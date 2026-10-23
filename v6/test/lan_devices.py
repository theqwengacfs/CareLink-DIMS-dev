#!/usr/bin/env python3
"""Several devices through the kit's own server: messages, replies, read state, refusals,
theme sync for one person across two tablets, and survival of a server restart.
Needs Playwright with Chromium. Without it the suite says so and passes as 'skipped'."""
import json, os, shutil, socket, subprocess, sys, tempfile, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
try:
    from playwright.sync_api import sync_playwright
except Exception:
    print("skipped: Playwright is not installed (pip install playwright && playwright install chromium)"); sys.exit(0)

kit = os.path.join(ROOT, "offline-kit")
if not os.path.isdir(kit): subprocess.run([sys.executable, os.path.join(ROOT, "tools", "make_kit.py")], check=True, capture_output=True)
work = tempfile.mkdtemp(prefix="lan-"); host = os.path.join(work, "host"); shutil.copytree(kit, host)
s = socket.socket(); s.bind(("127.0.0.1", 0)); PORT = s.getsockname()[1]; s.close()
URL = f"http://127.0.0.1:{PORT}/"; R = []; srv = None
def start():
    global srv
    srv = subprocess.Popen([sys.executable, "server.py", "--port", str(PORT)], cwd=host, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try: urllib.request.urlopen(URL + "api/health", timeout=1); return
        except Exception: time.sleep(0.2)
    raise SystemExit("the kit's server did not start")
def stop():
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()
def ck(name, ok, extra=""):
    R.append(bool(ok))
    if not ok: print("  FAIL:", name, extra)
def wait(pg, js, secs=20):
    t = time.time()
    while time.time() - t < secs:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(0.25)
    return False

start()
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        def device(label):
            pg = b.new_context(viewport={"width": 1280, "height": 800}).new_page()
            pg.on("pageerror", lambda e: errs.append(label + ": " + str(e))); pg.goto(URL); pg.wait_for_timeout(700); return pg
        def join(pg, user):
            pg.evaluate("ACTIONS['load-demo']()"); pg.evaluate("ACTIONS['quick-login']({u:'%s'})" % user)
            return wait(pg, "!!AUTH.user") and wait(pg, "SYNC.state==='connected' && (DB.db.meta||{}).serverRev>0", 25)
        A = device("A"); A.evaluate("ACTIONS['load-demo']()"); A.evaluate("ACTIONS['quick-login']({u:'caregiver.nyalenda'})")
        ck("device A signs in", wait(A, "!!AUTH.user")); time.sleep(2)
        ck("the host recorded A's data", json.loads(urllib.request.urlopen(URL + "api/health").read())["rev"] > 0)
        B = device("B"); ck("an empty tablet is refused state until it signs in", B.evaluate("fetch('/api/state').then(r=>r.status)") == 401)
        ck("B joins and adopts the central copy", join(B, "mcm.kisumu"))
        A2 = device("A2"); ck("A2 (same person as A) joins", join(A2, "caregiver.nyalenda"))
        C = device("C"); ck("C (finance) joins", join(C, "finance.kisumu"))
        mcm = B.evaluate("AUTH.user.id"); cg = A.evaluate("AUTH.user.id"); fin = C.evaluate("AUTH.user.id")
        T = "dm:" + ":".join(sorted([mcm, cg]))
        r = A.evaluate("MESSAGING.send(AUTH.user,{thread:%s,text:'Patient review moved to Friday morning.'})" % json.dumps(T))
        ck("A's message is accepted", bool(r.get("id")), r)
        ck("B receives it with no refresh, unread = 1", wait(B, "MESSAGING.unreadCount(AUTH.user)===1"))
        ck("A2 shows what A sent", wait(A2, "messageThreads(AUTH.user).some(t=>t.msgs.some(m=>/Friday morning/.test(m.text)))"))
        ck("C (a third person) never sees the conversation", C.evaluate("messageThreads(AUTH.user).every(t=>t.thread!==%s)" % json.dumps(T)))
        B.evaluate("go('messages',{thread:%s})" % json.dumps(T)); B.wait_for_timeout(400)
        ck("opening it clears B's unread", B.evaluate("MESSAGING.unreadCount(AUTH.user)") == 0)
        ck("the text is on B's screen", "Friday morning" in B.inner_text(".msg-scroll"))
        B.fill("textarea[name=text]", "Understood, I will confirm with the family."); B.click('button:has-text("Send")')
        ck("B's reply reaches A", wait(A, "(messageThreads(AUTH.user).find(t=>t.thread===%s)||{msgs:[]}).msgs.length===2" % json.dumps(T)))
        ck("and is unread for A", A.evaluate("MESSAGING.unreadCount(AUTH.user)") == 1)
        r = A.evaluate("MESSAGING.send(AUTH.user,{thread:%s,text:'Call +254712345678 now'})" % json.dumps(T)); ck("a phone number is refused", bool(r.get("blocked")))
        hb = A.evaluate("DB.db.users.find(u=>u.username==='finance.homabay').id")
        r = A.evaluate("MESSAGING.send(AUTH.user,{thread:%s,text:'hello'})" % json.dumps("dm:" + ":".join(sorted([cg, hb]))))
        ck("a message to a person in another county is refused as out of reach", "reach" in (r.get("error") or ""), r)
        time.sleep(2); ck("B never received the refused message", B.evaluate("DB.db.messages.every(m=>!/254712345678/.test(m.text))"))
        A.evaluate("WTHEME.choose(AUTH.user,'night');SETTINGS.pref('touch','large');render()")
        ck("A2 takes on the same person's theme", wait(A2, "document.documentElement.getAttribute('data-wt')==='night'"))
        ck("A2 takes on their touch size", A2.evaluate("document.documentElement.getAttribute('data-touch')") == "large")
        ck("B (another person) keeps theirs", B.evaluate("document.documentElement.getAttribute('data-wt')") != "night")
        navA = A.evaluate("NAVP.groups(AUTH.user).map(g=>g.label).join('|')"); navB = B.evaluate("NAVP.groups(AUTH.user).map(g=>g.label).join('|')"); navC = C.evaluate("NAVP.groups(AUTH.user).map(g=>g.label).join('|')")
        ck("each console offers a different set of modules", len({navA, navB, navC}) == 3, [navA, navB, navC])
        ck("C (finance) is offered Expenditure and A (caregiver) is not", C.evaluate("PAGER.flat(AUTH.user).some(x=>x.id==='finance')") and not A.evaluate("PAGER.flat(AUTH.user).some(x=>x.id==='finance')"))
        ck("no script error on any device", not errs, errs[:2]); time.sleep(1.5)
        # restart the host: nothing may be lost
        stop(); start()
        D = device("D"); ck("after a restart a new device still adopts the central copy", join(D, "mcm.kisumu"))
        ck("the conversation survived the restart", D.evaluate("(messageThreads(AUTH.user).find(t=>t.thread===%s)||{msgs:[]}).msgs.length" % json.dumps(T)) == 2)
        b.close()
finally:
    stop(); shutil.rmtree(work, ignore_errors=True)
print(f"{sum(R)}/{len(R)} multi-device checks passed")
sys.exit(0 if all(R) else 1)
