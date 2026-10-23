#!/usr/bin/env python3
"""Kit and firewall checks. The firewall scripts are run for real, against stubbed
network tools, so the logic is exercised without touching this machine's firewall."""
import os, re, stat, subprocess, sys, tempfile, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import make_kit as mk

passed = failed = 0
def check(name, cond, detail=""):
    global passed, failed
    if cond: passed += 1
    else:
        failed += 1; print("  FAIL:", name, ("| " + str(detail)) if detail else "")

tmp = tempfile.mkdtemp(prefix="kitfw-")
def write(name, text, mode=0o755):
    p = os.path.join(tmp, name); open(p, "w", newline="\n").write(text); os.chmod(p, mode); return p
linux = write("linux-firewall.sh", mk.LINUX_FW)
mac = write("macos-firewall.sh", mk.MAC_FW)
startsh = write("start.sh", mk.START_SH)

def stubs(name, **cmds):
    d = os.path.join(tmp, "bin-" + name); os.makedirs(d, exist_ok=True)
    for c, out in cmds.items():
        with open(os.path.join(d, c), "w") as f: f.write("#!/bin/sh\n" + out + "\n")
        os.chmod(os.path.join(d, c), 0o755)
    return d
def sh(script, args, bindir=None, env=None):
    e = dict(os.environ); 
    e["PATH"] = (bindir + ":" if bindir else "") + os.environ["PATH"]
    if env: e.update(env)
    r = subprocess.run(["sh", script] + args, capture_output=True, text=True, env=e, timeout=20)
    return r.returncode, r.stdout + r.stderr

# ---------- syntax, on two shells ----------
for name, path in (("linux", linux), ("macos", mac), ("start", startsh)):
    for shell in ("sh", "bash"):
        r = subprocess.run([shell, "-n", path], capture_output=True, text=True)
        check(f"{name} script parses under {shell}", r.returncode == 0, r.stderr)

# ---------- subnet detection ----------
lan = stubs("lan", ip=r'''case "$*" in
 *"route show default"*) echo "default via 192.168.1.1 dev wlan0 proto dhcp" ;;
 *"route show scope link"*) echo "172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1"; echo "192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.20";; esac''')
rc, out = sh(linux, ["--dry-run", "--backend", "ufw"], lan)
check("Linux: picks the LAN, not the Docker bridge", "192.168.1.0/24" in out and "172.17" not in out, out)
nodef = stubs("nodef", ip=r'''case "$*" in
 *"route show default"*) : ;;
 *"route show scope link"*) echo "172.17.0.0/16 dev docker0 scope link"; echo "172.18.0.0/16 dev br-3f2a scope link"; echo "192.168.50.0/24 dev eth0 scope link src 192.168.50.5"; echo "169.254.0.0/16 dev eth0 scope link";; esac''')
rc, out = sh(linux, ["--dry-run", "--backend", "ufw"], nodef)
check("Linux: with no gateway, still skips Docker, bridges and link-local", "192.168.50.0/24" in out and "172.17" not in out and "172.18" not in out and "169.254" not in out, out)
none = stubs("none", ip='exit 0')
rc, out = sh(linux, ["--dry-run", "--backend", "ufw"], none)
check("Linux: asks for --subnet when it cannot tell", rc == 2 and "--subnet" in out, out)

# ---------- refusals ----------
for args, why in ((["--subnet", "8.8.8.0/24"], "a public range"), (["--subnet", "300.1.1.0/24"], "an impossible address"),
                  (["--subnet", "192.168.1.0/33"], "an impossible prefix"), (["--subnet", "192.168.1.0"], "a missing prefix"),
                  (["--subnet", "1.2.3.0/24"], "another public range"), (["--subnet", "172.32.0.0/16"], "just outside 172.16/12"),
                  (["--port", "0", "--subnet", "192.168.1.0/24"], "port 0"), (["--port", "70000", "--subnet", "192.168.1.0/24"], "port 70000"),
                  (["--port", "80a", "--subnet", "192.168.1.0/24"], "a non-number port"), (["--backend", "pf", "--subnet", "192.168.1.0/24"], "an unknown backend")):
    rc, out = sh(linux, ["--dry-run"] + args)
    check(f"Linux refuses {why}", rc != 0, out)
for sub in ("192.168.1.0/24", "10.0.0.0/8", "172.16.0.0/12", "172.31.5.0/24"):
    rc, out = sh(linux, ["--dry-run", "--backend", "ufw", "--subnet", sub])
    check(f"Linux accepts the private range {sub}", rc == 0, out)

# ---------- what each backend would run ----------
S = ["--dry-run", "--subnet", "192.168.1.0/24", "--port", "8080"]
rc, out = sh(linux, S + ["--backend", "ufw"])
check("ufw: allows the subnet to the port, TCP", "ufw allow from 192.168.1.0/24 to any port 8080 proto tcp" in out, out)
check("ufw: never an open 'allow 8080'", not re.search(r"ufw allow (8080|from any)", out))
rc, out = sh(linux, S + ["--backend", "firewalld"])
check("firewalld: a rich rule bound to the subnet", "source address=192.168.1.0/24 port port=8080 protocol=tcp accept" in out and "--reload" in out, out)
rc, out = sh(linux, S + ["--backend", "iptables"])
check("iptables: accept the subnet, drop the rest, in a private chain", "-A CARELINK -s 192.168.1.0/24 -j ACCEPT" in out and "-A CARELINK -j DROP" in out, out)
check("iptables: only port 8080 traffic enters the chain", "-I INPUT -p tcp --dport 8080 -j CARELINK" in out, out)
rc, out = sh(linux, S + ["--backend", "nft"])
check("nft: accept the subnet, drop the rest of that port", "ip saddr 192.168.1.0/24 tcp dport 8080 accept" in out and "tcp dport 8080 drop" in out, out)
check("nft: says plainly what it cannot do", "cannot open" in out)
rc, out = sh(linux, ["--dry-run", "--remove", "--backend", "iptables", "--port", "8080"])
check("remove (iptables) deletes the jump, empties and deletes the chain", "-D INPUT" in out and "-F CARELINK" in out and "-X CARELINK" in out, out)
rc, out = sh(linux, ["--dry-run", "--remove", "--backend", "nft"])
check("remove (nft) deletes only its own table", "nft delete table inet carelink" in out, out)
rc, out = sh(linux, ["--dry-run", "--remove", "--backend", "ufw", "--subnet", "192.168.1.0/24", "--port", "8080"])
check("remove (ufw) names the same rule it added", "ufw delete allow from 192.168.1.0/24 to any port 8080 proto tcp" in out, out)
# automatic backend choice
ufw_on = stubs("ufwon", ufw='echo "Status: active"')
rc, out = sh(linux, ["--dry-run", "--subnet", "192.168.1.0/24"], ufw_on)
check("auto-detects an active ufw", "(ufw)" in out, out)
fwd = stubs("fwd", **{"firewall-cmd": 'case "$1" in --state) echo running;; esac'})
rc, out = sh(linux, ["--dry-run", "--subnet", "192.168.1.0/24"], fwd)
check("auto-detects a running firewalld", "(firewalld)" in out, out)
# a real run without privileges must not pretend to work
rc, out = subprocess.run(["su", "-s", "/bin/sh", "nobody", "-c", f"sh {linux} --subnet 192.168.1.0/24 --backend ufw"], capture_output=True, text=True).returncode, ""
check("without --dry-run and without root it refuses", rc != 0)

# ---------- macOS ----------
m24 = stubs("m24", ipconfig='case "$*" in "getifaddr en0") echo 192.168.1.20;; "getoption en0 subnet_mask") echo 255.255.255.0;; esac')
rc, out = sh(mac, ["--dry-run"], m24)
check("macOS: works out a /24", "from 192.168.1.0/24 to any port 8000" in out, out)
m23 = stubs("m23", ipconfig='case "$*" in "getifaddr en0") echo 192.168.5.20;; "getoption en0 subnet_mask") echo 255.255.254.0;; esac')
rc, out = sh(mac, ["--dry-run"], m23)
check("macOS: works out a /23 correctly (192.168.4.0/23)", "192.168.4.0/23" in out, out)
m16 = stubs("m16", ipconfig='case "$*" in "getifaddr en1") echo 10.4.9.9;; "getoption en1 subnet_mask") echo 255.255.0.0;; esac')
rc, out = sh(mac, ["--dry-run"], m16)
check("macOS: falls through to en1 and works out a /16", "10.4.0.0/16" in out, out)
check("macOS: allows the subnet then blocks the rest of that port", out.index("pass in quick") < out.index("block in quick"), out)
rc, out = sh(mac, ["--dry-run", "--subnet", "8.8.8.0/24"]); check("macOS refuses a public range", rc != 0, out)
rc, out = sh(mac, ["--dry-run", "--subnet", "192.168.1.0/24", "--port", "x"]); check("macOS refuses a bad port", rc != 0, out)
rc, out = sh(mac, ["--dry-run", "--remove"])
check("macOS remove flushes its own anchor only", "pfctl -a com.apple/carelink -F all" in out, out)

# ---------- the Windows pieces ----------
fw = mk.FIREWALL
check("Windows: the rule is limited to the local subnet", "remoteip=localsubnet" in fw)
check("Windows: private and domain profiles only", "profile=private,domain" in fw and "public" not in fw.lower().replace("not a cafe", ""))
check("Windows: has a remove switch", "[switch]$Remove" in fw and "delete rule" in fw)
check("Windows: rule name matches what network-status looks for", 'CareLink DIMS (port $Port)' in fw and 'CareLink DIMS*' in mk.NETWORK_STATUS)
check("Windows: default port matches the launcher's first choice", "$Port = 8000" in fw)
check("Windows: the .bat helpers call the script with the right switches", "firewall.ps1" in mk.WIN_ALLOW and "-Remove" in mk.WIN_REMOVE)

# ---------- the kit as a whole ----------
ports = re.search(r"for %%P in \(([0-9 ]+)\)", mk.START_BAT).group(1).split()
check("start.bat tries 8000 first", ports[0] == "8000", ports)
check("start.sh tries the same ports", all(p in mk.START_SH for p in ports))
for p in ports: check(f"the rules document mentions port {p}", p in mk.FW_RULES)
check("rules say nothing is opened to the internet", "NOTHING" in mk.FW_RULES and "forward" in mk.FW_RULES)
check("rules say no outbound access is needed", "NONE required" in mk.FW_RULES)
check("rules state the 900 second policy", "900 seconds" in mk.FW_RULES and "900 seconds" in mk.README)
check("no stale sixty-second wording anywhere in the kit", not re.search(r"sixty seconds|60 seconds", mk.README + mk.FW_RULES + mk.DEMO, re.I))
check("rules tell people to set passwords and refuse unprovisioned accounts", "set_password.py" in mk.FW_RULES and "CARELINK_ALLOW_UNVERIFIED=0" in mk.FW_RULES)
check("rules say what was NOT tested", "NOT run on" in mk.FW_RULES)
check("README points at the firewall folder", "firewall" in mk.README and "FIREWALL-RULES.txt" in mk.README)
srv = open(os.path.join(ROOT, "server.py")).read()
check("the host default idle limit is 300", re.search(r'CARELINK_IDLE_SECONDS", "900"', srv) is not None)
check("the host binds all interfaces so tablets can reach it", '"--host", default="0.0.0.0"' in srv)

# ---------- the zip ----------
zp = os.path.join(ROOT, mk.ZIP) if not os.path.isabs(mk.ZIP) else mk.ZIP
check("the zip exists", os.path.exists(zp))
if os.path.exists(zp):
    z = zipfile.ZipFile(zp); names = z.namelist(); top = mk.TOPDIR + "/"
    for need in ("firewall/FIREWALL-RULES.txt", "firewall/linux-firewall.sh", "firewall/macos-firewall.sh", "firewall/windows-allow.bat",
                 "firewall/windows-remove.bat", "start.bat", "start.sh", "server.py", "tools/firewall.ps1", "tools/set_password.py", mk.APP):
        check(f"zip holds {need}", top + need in names)
    for sh_ in ("start.sh", "firewall/linux-firewall.sh", "firewall/macos-firewall.sh"):
        info = z.getinfo(top + sh_); check(f"{sh_} is executable in the zip", (info.external_attr >> 16) & stat.S_IXUSR != 0)
    for n in names:
        if n.endswith((".bat", ".txt", ".ps1")):
            try: z.read(n).decode("ascii")
            except UnicodeDecodeError: check(f"{n} is ASCII", False)
        if n.endswith((".bat", ".txt")):
            b = z.read(n); check(f"{n} uses CRLF", b.count(b"\r") == b.count(b"\n") and b.count(b"\n") > 0)
        if n.endswith(".sh"):
            check(f"{n} uses LF only", b"\r" not in z.read(n))
    check("the zip's application is the built application", z.read(top + mk.APP) == open(os.path.join(ROOT, mk.APP), "rb").read())

print(f"{passed}/{passed+failed} kit and firewall checks passed")
sys.exit(1 if failed else 0)
