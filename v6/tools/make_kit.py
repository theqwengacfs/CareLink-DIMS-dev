#!/usr/bin/env python3
"""
make_kit.py - assemble the offline demonstration kit and its ZIP.

Run from the project root, after build.py:

    python3 build.py
    python3 tools/make_kit.py

Produces:
    offline-kit/                                   the folder to copy onto a USB stick
    LOMAMO-CareLink-DIMS-v6.0-Office-Kit.zip      the same folder, zipped for download

Every text file written here is ASCII and uses CRLF line endings, because the
target is Notepad and cmd.exe on a Windows office machine. The script asserts
both properties before it writes the ZIP.
"""
import os, sys, shutil, zipfile, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = "LOMAMO-CareLink-DIMS-v6.0.html"
KIT = os.path.join(ROOT, "offline-kit")
ZIP = os.path.join(ROOT, "LOMAMO-CareLink-DIMS-v6.0-Office-Kit.zip")
TOPDIR = "CareLink-DIMS-v6.0-office"

# ----------------------------------------------------------------------------
# start.bat
# ----------------------------------------------------------------------------
START_BAT = r"""@echo off
setlocal EnableExtensions
title LOMAMO CareLink DIMS 6.0 - Offline Launcher
cd /d "%~dp0"
set "APP=LOMAMO-CareLink-DIMS-v6.0.html"

if not exist "%APP%" goto :missing
if /i "%~1"=="--auto" goto :lan

:menu
cls
echo.
echo   ============================================================
echo.
echo      LOMAMO FOUNDATION   .   CARELINK DIMS  v6.0
echo      Offline demonstration launcher
echo.
echo   ============================================================
echo.
echo      [1]  Open on this computer only
echo           No server. Records stay in this browser.
echo.
echo      [2]  Start the office server (recommended)
echo           The host computer holds the database. Tablets and
echo           laptops on the Wi-Fi share the same records.
echo.
echo      [3]  Check the network and firewall
echo      [4]  Read the setup and demonstration guide
echo.
echo      [0]  Exit
echo.
choice /c 12340 /n /m "      Choose 1, 2, 3, 4 or 0:  "
if errorlevel 5 goto :end
if errorlevel 4 goto :guide
if errorlevel 3 goto :netcheck
if errorlevel 2 goto :lan
goto :local

:local
echo.
echo   Opening the application. If your browser asks, allow it to
echo   open - the file is local and needs no permission.
echo.
start "" "%APP%"
exit /b 0

:netcheck
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\network-status.ps1"
echo.
pause
goto :menu

:guide
start "" notepad "%~dp0README-FIRST.txt"
goto :menu

:lan
cls
echo.
echo   Preparing the shared demonstration server...
echo.
set "PORT="
for %%P in (8000 8080 8081 8090) do (
  if not defined PORT (
    netstat -an | findstr /R /C:":%%P .*LISTENING" >nul 2>&1
    if errorlevel 1 set "PORT=%%P"
  )
)
if not defined PORT (
  echo   Ports 8000, 8080, 8081 and 8090 are all in use.
  echo   Close whatever else is serving on those ports and try again.
  echo.
  pause
  goto :menu
)

set "PY="
python -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY=python"
if not defined PY (
  py -3 -c "import sys" >nul 2>&1
  if not errorlevel 1 set "PY=py -3"
)

echo   ------------------------------------------------------------
echo     THE ADDRESSES TO USE
echo   ------------------------------------------------------------
echo.
echo     On this computer:
echo        http://localhost:%PORT%/
echo.
echo     On a tablet or another laptop on the same Wi-Fi:
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\lan-ip.ps1"`) do echo        http://%%I:%PORT%/
echo.
echo   ------------------------------------------------------------
echo.
echo   Configuring Windows Wi-Fi profile and local subnet firewall automatically...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\firewall.ps1" -Port %PORT%

echo.
echo   Starting the server. The browser will open in a moment.
echo   If it opens before the server is ready, press F5 once.
echo.
echo   The database is created beside this file, in the folder "data".
echo   Copy that folder as part of your weekly off-device backup.
echo.
echo   KEEP THIS WINDOW OPEN while you demonstrate.
echo   Close it, or press Ctrl+C twice, to stop sharing.
echo.
start "" "http://localhost:%PORT%/"

set "CARELINK_DATA_DIR=%~dp0data"
if defined PY (
  %PY% "%~dp0server.py" --port %PORT%
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1" -Port %PORT% -Root "%~dp0."
)

echo.
echo   The server has stopped. Nothing lost on any device.
echo.
pause
goto :menu

:missing
echo.
echo   ERROR
echo   -----
echo   %APP% is not in this folder.
echo.
echo   Keep start.bat in the same folder as the application file,
echo   or rename the application back to its original name.
echo.
pause
exit /b 1

:end
endlocal
exit /b 0
"""

# ----------------------------------------------------------------------------
# start.sh  (macOS / Linux convenience)
# ----------------------------------------------------------------------------
START_SH = r"""#!/bin/sh
# LOMAMO CareLink DIMS 6.0 - launcher for macOS and Linux
cd "$(dirname "$0")" || exit 1
PORT="${CARELINK_PORT:-8000}"

# pick the first free port from 8000, 8080, 8081, 8090
port_free() { ! (command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 "$1" >/dev/null 2>&1); }
if [ -z "${CARELINK_PORT:-}" ]; then
  for p in 8000 8080 8081 8090; do
    if port_free "$p"; then PORT="$p"; break; fi
  done
fi

# the addresses other devices should type
lan_ips() {
  if command -v hostname >/dev/null 2>&1 && hostname -I >/dev/null 2>&1; then
    hostname -I | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | grep -v '^169\.254\.'
  elif command -v ipconfig >/dev/null 2>&1; then
    for i in en0 en1 en2; do ipconfig getifaddr "$i" 2>/dev/null; done
  fi
}

echo ""
echo "  LOMAMO CareLink DIMS 6.0"
echo "  On this computer:  http://localhost:$PORT/"
for ip in $(lan_ips); do echo "  On other devices:  http://$ip:$PORT/   (same Wi-Fi, not guest Wi-Fi)"; done
echo ""
echo "  Other devices cannot connect until the firewall allows port $PORT."
echo "  Linux:  sudo ./firewall/linux-firewall.sh --port $PORT"
echo "  macOS:  sudo ./firewall/macos-firewall.sh --port $PORT"
echo "  See firewall/FIREWALL-RULES.txt.   Ctrl+C stops the server."
echo ""
(
  sleep 1
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:$PORT/"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:$PORT/" >/dev/null 2>&1
  fi
) &
exec python3 server.py --port "$PORT"
"""

# ----------------------------------------------------------------------------
# tools/lan-ip.ps1
# ----------------------------------------------------------------------------
LAN_IP = r"""# lan-ip.ps1 - print this computer's IPv4 addresses, one per line.
# Used by start.bat to show the address to type on a tablet.
$ErrorActionPreference = "SilentlyContinue"

$list = @()
try {
  $list = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
          Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } |
          Select-Object -ExpandProperty IPAddress
} catch { $list = @() }

if (-not $list -or $list.Count -eq 0) {
  $list = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
          Where-Object { $_.AddressFamily -eq 'InterNetwork' } |
          ForEach-Object { $_.IPAddressToString } |
          Where-Object { $_ -notmatch '^(127\.|169\.254\.)' }
}

foreach ($ip in ($list | Sort-Object -Unique)) { Write-Output $ip }
"""

# ----------------------------------------------------------------------------
# tools/firewall.ps1
# ----------------------------------------------------------------------------
NETWORK_STATUS = r"""# network-status.ps1 - what this computer is sharing, in plain words.
$ErrorActionPreference = "SilentlyContinue"
Write-Host ""
Write-Host "  CARELINK DIMS - NETWORK STATUS"
Write-Host "  ------------------------------------------------------------"
$port = 8000
$rules = @(Get-NetFirewallRule -DisplayName "CareLink DIMS*" -ErrorAction SilentlyContinue)
if ($rules.Count -gt 0) {
  Write-Host "  Firewall rule    : present"
  foreach ($r in $rules) {
    $pf = $r | Get-NetFirewallPortFilter | Select-Object -First 1
    $af = $r | Get-NetFirewallAddressFilter | Select-Object -First 1
    Write-Host ("    " + $r.DisplayName + "  profile: " + $r.Profile + "  from: " + $af.RemoteAddress + "  enabled: " + $r.Enabled)
    if ($pf -and $pf.LocalPort) { $port = [int]$pf.LocalPort }
  }
  Write-Host "  Reach            : private and domain networks, local subnet only"
} else {
  Write-Host "  Firewall rule    : not present"
  Write-Host "  Other devices cannot connect until the rule is added."
}
$listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listen) { Write-Host "  Server           : listening on port $port" }
else { Write-Host "  Server           : not running" }
Write-Host ""
Write-Host "  Addresses on this computer:"
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" } | ForEach-Object {
  Write-Host ("    http://{0}:{1}/" -f $_.IPAddress, $port)
}
Write-Host ""
Write-Host "  Rules of the demonstration:"
Write-Host "    - Office Wi-Fi or a private network only."
Write-Host "    - Do not forward this port on a router."
Write-Host "    - Do not run it on a public hotspot."
Write-Host "    - The host computer holds the only authoritative copy."
Write-Host ""
"""

FIREWALL = r"""# firewall.ps1 - allow the office port for devices on THIS network only.
# The rule is limited to the private and domain profiles (not a cafe or a phone
# hotspot) and to the local subnet (not the whole internet).
#   powershell -File firewall.ps1 -Port 8000          add the rule
#   powershell -File firewall.ps1 -Port 8000 -Remove  take it away again
# Asks for administrator rights if it does not already have them.
param([int]$Port = 8000, [switch]$Remove)

$rule = "CareLink DIMS (port $Port)"
$bat  = Join-Path $env:TEMP "carelink-firewall-$Port.bat"

$lines = @(
  '@echo off',
  "netsh advfirewall firewall delete rule name=`"$rule`" >nul 2>&1"
)
if ($Remove) {
  $lines += @('echo.', "echo   Rule removed: $rule")
} else {
  $lines += @(
    "netsh advfirewall firewall add rule name=`"$rule`" dir=in action=allow protocol=TCP localport=$Port profile=private,domain remoteip=localsubnet",
    'echo.',
    "echo   Rule added: $rule",
    "echo   TCP $Port, private and domain networks, local subnet only."
  )
}
$lines += @('echo   You can close this window.', 'timeout /t 6 >nul')
Set-Content -Path $bat -Value $lines -Encoding ASCII

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($admin) {
  Start-Process -FilePath $bat -Wait
} else {
  Write-Host "   Asking Windows for permission to change the firewall..."
  Start-Process -FilePath $bat -Verb RunAs -Wait
}
"""

# ----------------------------------------------------------------------------
# tools/serve.ps1  - fallback static server when Python is absent
# ----------------------------------------------------------------------------
SERVE = r"""# serve.ps1 - minimal static file server, used only when Python is absent.
# PowerShell 2.0+ compatible. Read-only, GET and HEAD, no dependencies.
# Binds to all interfaces so tablets on the same Wi-Fi can reach it.
param(
  [int]$Port = 8080,
  [string]$Root = "."
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path -LiteralPath $Root).Path
$mime = @{
  ".html" = "text/html; charset=utf-8"; ".htm" = "text/html; charset=utf-8";
  ".txt"  = "text/plain; charset=utf-8"; ".css" = "text/css; charset=utf-8";
  ".js"   = "application/javascript; charset=utf-8";
  ".json" = "application/json; charset=utf-8";
  ".png"  = "image/png";   ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg";
  ".gif"  = "image/gif";   ".svg" = "image/svg+xml"; ".ico" = "image/x-icon";
  ".pdf"  = "application/pdf"; ".zip" = "application/zip";
  ".md"   = "text/plain; charset=utf-8"; ".csv" = "text/csv; charset=utf-8"
}

$listener = New-Object -TypeName System.Net.Sockets.TcpListener -ArgumentList ([System.Net.IPAddress]::Any), $Port
$listener.Start()

Write-Host ""
Write-Host "  Serving: $Root"
Write-Host "  Port:    $Port"
Write-Host "  Address: http://localhost:$Port/"
Write-Host ""
Write-Host "  Keep this window open. Close it to stop the server."
Write-Host ""

function Send-Bytes($stream, [string]$status, [string]$ctype, [byte[]]$body, [bool]$headOnly) {
  $head = "HTTP/1.1 $status`r`nContent-Type: $ctype`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($hb, 0, $hb.Length)
  if (-not $headOnly) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $client.NoDelay = $true
    $stream = $client.GetStream()
    $stream.ReadTimeout  = 8000
    $stream.WriteTimeout = 15000

    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 4096, $true)
    $requestLine = $reader.ReadLine()
    if ([string]::IsNullOrWhiteSpace($requestLine)) { $client.Close(); continue }

    # discard headers
    $guard = 0
    while ($guard -lt 100) {
      $guard++
      $line = $reader.ReadLine()
      if ($null -eq $line -or $line -eq "") { break }
    }

    $parts = $requestLine -split ' '
    if ($parts.Length -lt 2) { $client.Close(); continue }
    $method = $parts[0].ToUpper()
    $headOnly = ($method -eq "HEAD")

    if ($method -ne "GET" -and $method -ne "HEAD") {
      $body = [System.Text.Encoding]::UTF8.GetBytes("Method not allowed")
      Send-Bytes $stream "405 Method Not Allowed" "text/plain; charset=utf-8" $body $false
      $client.Close(); continue
    }

    $target = $parts[1]
    $q = $target.IndexOf('?'); if ($q -ge 0) { $target = $target.Substring(0, $q) }
    $target = [System.Uri]::UnescapeDataString($target)
    if ($target -eq "/" -or $target -eq "") { $target = "/index.html" }

    $rel  = $target.TrimStart('/').Replace('/', '\')
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root $rel))
    $inside = $full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)

    if (-not $inside) {
      $body = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
      Send-Bytes $stream "403 Forbidden" "text/plain; charset=utf-8" $body $headOnly
      $client.Close(); continue
    }

    if (Test-Path -LiteralPath $full -PathType Container) {
      $idx = Join-Path $full "index.html"
      if (Test-Path -LiteralPath $idx -PathType Leaf) { $full = $idx } else { $full = "" }
    }

    if ($full -ne "" -and (Test-Path -LiteralPath $full -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ctype = "application/octet-stream"
      if ($mime.ContainsKey($ext)) { $ctype = $mime[$ext] }
      Send-Bytes $stream "200 OK" $ctype $bytes $headOnly
    } else {
      $body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      Send-Bytes $stream "404 Not Found" "text/plain; charset=utf-8" $body $headOnly
    }

    $client.Close()
  } catch {
    try { $client.Close() } catch { }
  }
}
"""

# ----------------------------------------------------------------------------
# index.html - landing page, deliberately plain and touch-sized
# ----------------------------------------------------------------------------
INDEX = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LOMAMO CareLink DIMS 6.0</title>
<style>
  :root{ --red:#C8102E; --ink:#15171B; --mut:#6B7280; --line:#E5E7EB; }
  *{ box-sizing:border-box; }
  body{ margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
        color:var(--ink); background:radial-gradient(1200px 600px at 50% -10%,#FFF5F6 0%,#F6F7F9 45%,#EFF1F4 100%); }
  .card{ width:100%; max-width:520px; background:#fff; border:1px solid var(--line); border-radius:20px;
         padding:34px 32px 30px; box-shadow:0 18px 60px rgba(16,24,40,.10); }
  .mark{ display:flex; align-items:center; gap:12px; margin-bottom:26px; }
  .mark .bar{ width:6px; height:34px; border-radius:3px; background:var(--red); }
  .mark b{ font-size:15px; letter-spacing:.16em; text-transform:uppercase; }
  h1{ font-size:27px; line-height:1.18; margin:0 0 8px; letter-spacing:-.02em; }
  h1 em{ font-style:normal; color:var(--red); }
  p.lead{ color:var(--mut); font-size:14.5px; line-height:1.6; margin:0 0 26px; }
  a.go{ display:flex; align-items:center; justify-content:space-between; gap:14px; text-decoration:none;
        background:var(--red); color:#fff; border-radius:14px; padding:20px 22px; font-size:17px; font-weight:600;
        box-shadow:0 10px 24px rgba(200,16,46,.24); }
  a.go:active{ transform:translateY(1px); }
  a.go span.arrow{ font-size:22px; line-height:1; }
  .creds{ margin-top:22px; padding:16px 18px; background:#FAFAFB; border:1px solid var(--line); border-radius:12px; }
  .creds h2{ margin:0 0 8px; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--mut); font-weight:600; }
  .creds .pw{ font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:17px; letter-spacing:.06em; }
  .creds p{ margin:8px 0 0; font-size:13px; color:var(--mut); line-height:1.55; }
  .foot{ margin-top:22px; font-size:12px; color:var(--mut); line-height:1.6; }
  .foot b{ color:var(--ink); font-weight:600; }
  @media (max-width:420px){ .card{ padding:26px 22px; } h1{ font-size:23px; } }
</style>
</head>
<body>
  <div class="card">
    <div class="mark"><div class="bar"></div><b>LOMAMO Foundation</b></div>
    <h1>One foundation.<br><em>One operating system.</em></h1>
    <p class="lead">CareLink DIMS v6.0 &mdash; the offline demonstration build. Synthetic data only.</p>

    <a class="go" href="LOMAMO-CareLink-DIMS-v6.0.html">
      Open CareLink DIMS <span class="arrow">&rarr;</span>
    </a>

    <div class="creds">
      <h2>Demonstration password</h2>
      <div class="pw">LOMAMO2026</div>
      <p>Every demonstration account uses this password. Press any account chip on the sign-in screen instead of typing a username.</p>
    </div>

    <div class="foot">
      <b>First time on this device?</b> Choose <i>Load demonstration dataset</i> when the application opens.<br>
      On the office server every device shares the host computer's database. Nothing is sent to the internet.
    </div>
  </div>
</body>
</html>
"""

# ----------------------------------------------------------------------------
# README-FIRST.txt
# ----------------------------------------------------------------------------
README = r"""LOMAMO FOUNDATION - CARELINK DIMS v6.0
Office kit: one host computer, every device on the office Wi-Fi
================================================================


WHAT THIS IS
------------
CareLink DIMS is one file of software. Styles, code and the Foundation
logo are inside that single HTML file. It runs with no internet
connection. When the office server is started it also runs as a shared
database for every tablet and laptop on the same Wi-Fi.

This build carries no demonstration accounts. The first time it is
opened, it asks for the System Administrator account. When that
account is created, the host issues the official accounts for the
Foundation roster and offers a master credentials file, which is the
only copy of those first passwords. It is saved once, at setup, by the
System Administrator. Nothing is emailed and nothing is stored in a
web page.

Every person changes their own password the first time they sign in.


QUICK START - THE HOST COMPUTER (Windows)
-----------------------------------------
1. Right-click start.bat and choose "Run as administrator" (one time,
   so the firewall rule can be created).
2. Choose 2 to start the office server.
3. Note the address it prints, for example  http://192.168.1.24:8080/
4. Leave that window open. It IS the server.
5. On the host, open the address in a browser.
6. Complete the first-run setup: create the System Administrator
   account, then save the master credentials file when it is offered.

The server keeps its database in a file beside the application
(data/carelink-db.json). Back it up by copying that file. Closing the
window stops sharing but loses nothing.


JOINING FROM A TABLET OR LAPTOP
-------------------------------
1. Join the same office Wi-Fi.
2. Open Chrome and type the address exactly, including http:// and
   the port.
3. The landing page appears. Choose "Proceed to My CareLink Console".
4. Sign in with your own username and the password issued to you.
5. Choose a new password when asked. It is yours from then on.

Every device reads the same central database. A change made on the
tablet appears on the host and on every other device within a second
or two, and is written into the audit chain with the account that made
it. There is no "two devices changed the same record" message: the
host reconciles writes and journals each merge.


IF THE TABLET CANNOT REACH THE ADDRESS
--------------------------------------
- Both devices must be on the same network, not one on Wi-Fi and the
  other on a phone hotspot.
- Windows Firewall is the usual cause. Run start.bat as administrator
  once, choose 3 to check, and allow the rule when asked. The rule
  stays after that.
- Some office networks isolate wireless clients from each other
  ("client isolation"). If yours does, ask whoever manages the router
  to switch that off for the office network.
- The firewall folder (see firewall\FIREWALL-RULES.txt) holds the exact
  subnet rules for Windows, macOS and Linux.


WHAT LIVES IN THIS FOLDER
-------------------------
LOMAMO-CareLink-DIMS-v6.0.html   the entire application
index.html                       the same file, for a web server root
server.py                        the office host
start.bat                        Windows launcher and network check
start.sh                         launcher for macOS and Linux
firewall\                        rules for the three platforms
tools\                           small helper scripts
docs\                            release report and prompt audit


FIRST-RUN NOTES THAT MATTER
---------------------------
- The master credentials file is written once. Save it somewhere
  controlled, not in a shared folder.
- Passwords are stored only as salted hashes. No page can show an
  existing password, including to the System Administrator.
- If a password must be recovered, four offices must agree in the
  system: Director, System Administrator, Chief Program Administrator
  and Chief Program Administrator Assistant. Only then may the System
  Administrator overwrite it, and the county administrator for that
  account then sets a new one. Every step is audited.
- An account can be requested from the landing page or the sign-in
  page. The System Administrator approves it, and the applicant
  receives a username and a one-time activation code which are entered
  on the sign-in page together with a password of their own choosing.
- Session idle lock is 900 seconds (15 minutes) by default and is configurable on
  the host with CARELINK_IDLE_SECONDS.


WHAT HAS NOT BEEN TESTED
------------------------
Two physical devices on a real office network, printing, and any
external integration (DHIS2, KHIS, FHIR, laboratory, pharmacy, SMS).
The adapter boundary exists; no connection is claimed. See
docs/17_V6_RELEASE.md for the full list.


================================================================
LOMAMO Foundation Kenya - Love Matters Most
Serving our Neighbours in Love
"""

DEMO = r"""LOMAMO FOUNDATION - CARELINK DIMS v6.0
A ten-minute demonstration
================================================================

Every account below exists in the demonstration dataset and uses the
password LOMAMO2026. Press the account chip on the sign-in screen
rather than typing the username.

The story: a caregiver in Nyalenda assesses a patient on paper, the
form is entered, verified and enrolled, the patient is referred to
hospital, the transport is authorised, the hospital is paid and
reconciled, and the county office reads the result in a Monday
report. Two different people must approve anything consequential,
and every action lands in the audit trail.


1. THE CAREGIVER'S TABLET
   Account: caregiver.nyalenda         (ministry area: Nyalenda)

   - Show that the console is small and personal: their own area,
     their own patients, nothing else.
   - Notice there is no finance, no HR, no other county, no export
     button. This is enforced in the data layer, not by hiding menus.
   - Start a new assessment. Show the paper form fields.
   - Point out: the caregiver can submit, but cannot enrol or
     approve. The button simply is not theirs.


2. THE ADMINISTRATIVE ASSISTANT
   Account: assistant.kisumu

   - The digitisation queue: paper forms waiting to be typed in.
   - Verify a submitted assessment. Try to act as a caregiver and
     watch it refuse.


3. THE COUNTY OFFICE ADMINISTRATOR
   Account: kisumu.admin

   - Enrol the verified patient.
   - Show the patient record: the timeline, the consent state,
     the handover trail.
   - Show that this role can export the patient register, and that
     the export is audited and limited to Kisumu.


4. THE MEDICAL CASE MANAGER
   Account: mcm.kisumu

   - Hospital requests waiting for clinical approval.
   - Approve one. Show that the decision is recorded with the
     reasons, and that the caregiver could never have made it.
   - Recommend discharge on a patient: refused without a clinical
     report, accepted with one.


5. THE HOSPITAL LIAISON
   Account: liaison.kisumu

   - The assigned case. Record the service, attach the report.
   - Try to close it: refused while the money is unreconciled.


6. THE FINANCE OFFICER
   Account: finance.kisumu

   - Record the hospital expenditure and the receipt.
   - Reconcile. Now the liaison can close the case.
   - Show the budget lines: Kisumu only. Homa Bay's figures are not
     merely hidden, they are not returned.


7. GOVERNANCE AND DUAL CONTROL
   Account: chief.admin

   - Request a full export. The Chief cannot approve their own
     request.
   - Sign out, sign in as media.head, and countersign. Two people,
     two signatures, both recorded.
   - Open the audit console. Hash-chained, append-only, and nobody
     can edit it.


8. THE MONDAY REPORT
   Account: kisumu.admin

   - Report centre, Patient Figures, generate.
   - Point at the period, the cut-off, the county, the version
     number and the integrity block.
   - Print / PDF. Each regeneration creates a new version; nothing
     already issued is overwritten.


9. THE CARE CENTRE
   Account: mcm.kisumu, then Care centre

   - Occupancy, the bed board and the evening handover.
   - Record a daily entry: meal, fluids, mood, hygiene.
   - Open the safeguarding register. Note that HR can see the care
     centre exists but cannot read a single incident.
   - This is not a second hospital console: no clinical notes, no
     theatre lists, no hospital billing.

10. THE CARE PLAN AND ITS REVIEWS
   Account: caregiver.nyalenda, open any patient, PDCA tab

   - The care plan records the need, the objective, the expected
     duration and the reason for that estimate.
   - Twelve reviews fall every 30 days from enrolment. A review that
     is completed late is shown as late; the due date never moves.
   - A case beyond 180 days is flagged as extended and needs a
     written review before it can be closed.

11. DELEGATION
   Account: kisumu.admin, then Delegation

   - Issue seven days of enrolment authority to the Administrative
     Assistant while the administrator travels.
   - Sign in as the assistant: the delegated capability works, the
     rest does not, and the header shows the delegation.
   - Try to delegate something you do not hold. It is refused.
   - The delegation expires by itself. Nobody shares a password.

12. CONDITIONS, AND WHAT IS WITHHELD
   Account: caregiver.nyalenda, open a patient, Clinical tab

   - Record a suspected condition. The caregiver cannot confirm it.
   - Sign in as mcm.kisumu and confirm it.
   - Sign in as hr.officer. The clinical tab is not there at all.
   - Sign in as me.kisumu: aggregate counts, sensitive categories
     withheld, and small groups shown as a band, never a number.

13. THE ASSISTANT
   Any account, the assistant panel.

   - Ask a question the role is allowed to answer and read the
     evidence.
   - Ask a caregiver about finances. It refuses and says what the
     role can see instead of answering zero.
   - Nothing leaves the device. The model runs locally if one is
     installed; otherwise it reasons over the data with rules.


14. THE POINT
    The same system separates clinical authority, financial
    authority, administrative authority and information governance,
    across two counties, ten ministry areas and thirteen
    departments - without a second copy of the truth.


IF SOMEBODY ASKS THE HARD QUESTIONS
-----------------------------------
"Can a caregiver see another county?"
    No. Try it and the record is refused by the data layer, and
    the refusal is itself recorded.

"Who can see a patient's clinical notes?"
    Only roles with the clinical capability. HR, media and finance
    cannot, even though they can see the patient exists.

"Can the Chief Administrator do anything?"
    Configure the platform, yes. Read clinical notes, no. Approve
    their own export, no.

"Is this the production system?"
    No. This is the demonstration build with synthetic data. The
    production deployment uses a server and a real database.
"""

LINUX_FW = r"""#!/bin/sh
# linux-firewall.sh - let devices on the office network reach CareLink DIMS, and nobody else.
#
#   sudo ./linux-firewall.sh [--port 8000] [--subnet 192.168.1.0/24]
#   sudo ./linux-firewall.sh --status
#   sudo ./linux-firewall.sh --remove
#   ./linux-firewall.sh --dry-run          show what would run, change nothing
#   --backend ufw|firewalld|iptables|nft   choose one instead of auto-detecting
#
# One inbound TCP port, from the local subnet only. The subnet is detected from
# the network this computer is on, and only private ranges are ever detected
# (10.x, 172.16-31.x, 192.168.x). Nothing is opened to the internet.
set -u
PORT=8000; SUBNET=""; ACTION=add; DRY=0; BACKEND=""
TAG="CareLink DIMS"

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; }
have() { command -v "$1" >/dev/null 2>&1; }
say()  { printf '%s\n' "$*"; }
run()  { if [ "$DRY" = 1 ]; then say "  [dry-run] $*"; else "$@"; fi; }

while [ $# -gt 0 ]; do
  case "$1" in
    --port)    PORT="${2:-}"; shift 2 ;;
    --subnet)  SUBNET="${2:-}"; shift 2 ;;
    --backend) BACKEND="${2:-}"; shift 2 ;;
    --remove)  ACTION=remove; shift ;;
    --status)  ACTION=status; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) say "Unknown option: $1"; usage; exit 2 ;;
  esac
done

case "$PORT" in ''|*[!0-9]*) say "The port must be a number."; exit 2 ;; esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then say "The port must be 1 to 65535."; exit 2; fi

valid_cidr() {
  printf '%s' "$1" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}/([0-9]|[12][0-9]|3[0-2])$' || return 1
  printf '%s' "${1%/*}" | awk -F. '{ for (i=1;i<=4;i++) if ($i+0 > 255) exit 1 }'
}
private_cidr() { printf '%s' "$1" | grep -Eq '^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)'; }

detect_subnet() {
  have ip || return 1
  # the network the default route uses; failing that, any real private network
  DEV="$(ip -o -4 route show default 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}')"
  ip -o -4 route show scope link 2>/dev/null | awk -v want="$DEV" '
    $1 ~ /\// {
      dev=""; for(i=1;i<=NF;i++) if($i=="dev") dev=$(i+1)
      if (dev ~ /^(docker|br-|virbr|veth|lo|tun|tap|wg|tailscale|zt)/) next
      if (want != "" && dev == want) print "0 " $1; else print "1 " $1
    }' | sort | awk '{print $2}' | while read -r r; do
    if private_cidr "$r"; then printf '%s\n' "$r"; break; fi
  done
}

if [ "$ACTION" != "status" ] && [ "$ACTION" != "remove" ]; then
  if [ -z "$SUBNET" ]; then SUBNET="$(detect_subnet | head -n 1)"; fi
  if [ -z "$SUBNET" ]; then
    say "Could not work out the office network automatically."
    say "Give it with --subnet, for example:  --subnet 192.168.1.0/24"; exit 2
  fi
  if ! valid_cidr "$SUBNET"; then say "That subnet is not valid: $SUBNET"; exit 2; fi
  if ! private_cidr "$SUBNET"; then
    say "Refusing to open the port to a public range: $SUBNET"
    say "Use a private network such as 192.168.1.0/24."; exit 2
  fi
fi

if [ "$DRY" != 1 ] && [ "$(id -u)" != 0 ]; then say "Run this with sudo."; exit 1; fi

detect_backend() {
  if [ -n "$BACKEND" ]; then printf '%s' "$BACKEND"; return; fi
  if have ufw && ufw status 2>/dev/null | grep -qi 'status: active'; then printf ufw; return; fi
  if have firewall-cmd && firewall-cmd --state >/dev/null 2>&1; then printf firewalld; return; fi
  if have iptables; then printf iptables; return; fi
  if have nft; then printf nft; return; fi
  printf none
}
B="$(detect_backend)"
case "$B" in ufw|firewalld|iptables|nft) ;; none)
  say "No firewall tool found (ufw, firewalld, iptables, nft)."
  say "If this computer has no firewall, nothing needs opening. Port $PORT is reachable on the LAN already."
  exit 0 ;;
  *) say "Unknown backend: $B"; exit 2 ;; esac

say ""
say "  $TAG  -  firewall ($B)"
[ "$ACTION" = "add" ] && say "  Allow TCP $PORT from $SUBNET only"

do_add() {
  case "$B" in
    ufw)
      run ufw allow from "$SUBNET" to any port "$PORT" proto tcp comment "$TAG" ;;
    firewalld)
      run firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=$SUBNET port port=$PORT protocol=tcp accept"
      run firewall-cmd --reload ;;
    iptables)
      # a private chain keeps the rules together and makes removal exact
      if [ "$DRY" = 1 ] || ! iptables -nL CARELINK >/dev/null 2>&1; then run iptables -N CARELINK; fi
      run iptables -F CARELINK
      run iptables -A CARELINK -s "$SUBNET" -j ACCEPT
      run iptables -A CARELINK -j DROP
      if [ "$DRY" = 1 ] || ! iptables -C INPUT -p tcp --dport "$PORT" -j CARELINK >/dev/null 2>&1; then
        run iptables -I INPUT -p tcp --dport "$PORT" -j CARELINK
      fi
      say "  Note: iptables rules last until the next restart unless your system saves them" ;;
    nft)
      say "  Note: an nftables rule in its own table can restrict a port but cannot open one"
      say "  that another table drops. If this computer already blocks incoming traffic,"
      say "  add the accept rule to that ruleset as well."
      run nft add table inet carelink
      run nft add chain inet carelink input '{ type filter hook input priority -5 ; policy accept ; }'
      run nft flush chain inet carelink input
      run nft add rule inet carelink input ip saddr "$SUBNET" tcp dport "$PORT" accept
      run nft add rule inet carelink input tcp dport "$PORT" drop ;;
  esac
}

do_remove() {
  case "$B" in
    ufw)
      run ufw delete allow from "${SUBNET:-any}" to any port "$PORT" proto tcp 2>/dev/null || true
      say "  If a rule remains, list it with:  sudo ufw status numbered" ;;
    firewalld)
      if [ -n "$SUBNET" ]; then
        run firewall-cmd --permanent --remove-rich-rule="rule family=ipv4 source address=$SUBNET port port=$PORT protocol=tcp accept"
      else
        say "  Give --subnet to remove the firewalld rule for that subnet."
      fi
      run firewall-cmd --reload ;;
    iptables)
      run iptables -D INPUT -p tcp --dport "$PORT" -j CARELINK
      run iptables -F CARELINK
      run iptables -X CARELINK ;;
    nft)
      run nft delete table inet carelink ;;
  esac
}

do_status() {
  case "$B" in
    ufw)       ufw status 2>/dev/null | grep -i "$PORT" || say "  No rule for port $PORT." ;;
    firewalld) firewall-cmd --list-rich-rules 2>/dev/null | grep "port=\"$PORT\"" || say "  No rule for port $PORT." ;;
    iptables)  iptables -nL CARELINK 2>/dev/null || say "  No CARELINK chain." ;;
    nft)       nft list table inet carelink 2>/dev/null || say "  No carelink table." ;;
  esac
}

case "$ACTION" in
  add)    do_add;    say "  Done. Other devices on $SUBNET can now reach port $PORT." ;;
  remove) do_remove; say "  Done. The CareLink rule is removed." ;;
  status) do_status ;;
esac
"""

MAC_FW = r"""#!/bin/sh
# macos-firewall.sh - let devices on the office network reach CareLink DIMS on this Mac.
#
#   sudo ./macos-firewall.sh [--port 8000] [--subnet 192.168.1.0/24]
#   sudo ./macos-firewall.sh --remove
#   ./macos-firewall.sh --dry-run          show what would run, change nothing
#
# Two things are done. The built-in application firewall is told to allow
# python3 to accept connections, and a packet-filter rule limits the port to
# the local subnet. Neither opens anything to the internet.
set -u
PORT=8000; SUBNET=""; ACTION=add; DRY=0
ANCHOR="com.apple/carelink"
SF="/usr/libexec/ApplicationFirewall/socketfilterfw"

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; }
say()  { printf '%s\n' "$*"; }
run()  { if [ "$DRY" = 1 ]; then say "  [dry-run] $*"; else "$@"; fi; }

while [ $# -gt 0 ]; do
  case "$1" in
    --port)    PORT="${2:-}"; shift 2 ;;
    --subnet)  SUBNET="${2:-}"; shift 2 ;;
    --remove)  ACTION=remove; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) say "Unknown option: $1"; usage; exit 2 ;;
  esac
done
case "$PORT" in ''|*[!0-9]*) say "The port must be a number."; exit 2 ;; esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then say "The port must be 1 to 65535."; exit 2; fi

# the subnet this Mac is on: address and mask of the first active interface
detect_subnet() {
  for i in en0 en1 en2 en3; do
    ip="$(ipconfig getifaddr "$i" 2>/dev/null)"; mask="$(ipconfig getoption "$i" subnet_mask 2>/dev/null)"
    [ -n "$ip" ] && [ -n "$mask" ] || continue
    printf '%s %s\n' "$ip" "$mask" | awk '
      function bits(m){ return (m==255)?8:(m==254)?7:(m==252)?6:(m==248)?5:(m==240)?4:(m==224)?3:(m==192)?2:(m==128)?1:0 }
      { split($1,a,"."); split($2,m,".");
        for(k=1;k<=4;k++){ blk=256-m[k]; n[k]=int(a[k]/blk)*blk; p+=bits(m[k]) }
        printf "%d.%d.%d.%d/%d\n", n[1],n[2],n[3],n[4],p }'
    return 0
  done
  return 1
}
private_cidr() { printf '%s' "$1" | grep -Eq '^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)'; }

if [ "$ACTION" = "add" ]; then
  [ -n "$SUBNET" ] || SUBNET="$(detect_subnet)"
  if [ -z "$SUBNET" ]; then say "Could not work out the office network. Give --subnet, for example 192.168.1.0/24"; exit 2; fi
  if ! printf '%s' "$SUBNET" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}/([0-9]|[12][0-9]|3[0-2])$'; then say "That subnet is not valid: $SUBNET"; exit 2; fi
  if ! private_cidr "$SUBNET"; then say "Refusing to open the port to a public range: $SUBNET"; exit 2; fi
fi
if [ "$DRY" != 1 ] && [ "$(id -u)" != 0 ]; then say "Run this with sudo."; exit 1; fi

PY="$(command -v python3 || true)"
say ""
say "  CareLink DIMS  -  macOS firewall"
if [ "$ACTION" = "add" ]; then
  say "  Allow TCP $PORT from $SUBNET only"
  if [ -n "$PY" ]; then
    run "$SF" --add "$PY"
    run "$SF" --unblockapp "$PY"
  fi
  RULES="pass in quick proto tcp from $SUBNET to any port $PORT
block in quick proto tcp from any to any port $PORT"
  if [ "$DRY" = 1 ]; then
    say "  [dry-run] pfctl -a $ANCHOR -f -   with these rules:"; printf '%s\n' "$RULES" | sed 's/^/                /'
    say "  [dry-run] pfctl -E"
  else
    printf '%s\n' "$RULES" | pfctl -a "$ANCHOR" -f - && pfctl -E >/dev/null 2>&1
  fi
  say "  Done. Other devices on $SUBNET can now reach port $PORT."
else
  [ -n "$PY" ] && run "$SF" --remove "$PY"
  run pfctl -a "$ANCHOR" -F all
  say "  Done. The CareLink rules are removed."
fi
"""

WIN_ALLOW = r"""@echo off
rem Allow other devices on this network to reach CareLink DIMS.
cd /d "%~dp0"
set "PORT=8000"
set /p "PORT=   Port the server uses [8000]:  "
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\tools\firewall.ps1" -Port %PORT%
echo.
pause
"""

WIN_REMOVE = r"""@echo off
rem Remove the CareLink DIMS firewall rule.
cd /d "%~dp0"
set "PORT=8000"
set /p "PORT=   Port to close [8000]:  "
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\tools\firewall.ps1" -Port %PORT% -Remove
echo.
pause
"""

FW_RULES = r"""CareLink DIMS - FIREWALL RULES AND SEVERAL DEVICES
================================================================

WHAT THE SYSTEM NEEDS
---------------------
One host computer runs server.py. Tablets, phones and laptops open it in a
browser. That is all.

  Inbound to the host   TCP, one port, default 8000 (the launcher may pick
                        8080, 8081 or 8090 if 8000 is busy)
  Protocol              HTTP. There is no UDP, no discovery protocol and no
                        second port.
  From                  the office network only (the local subnet)
  Outbound from host    NONE required. The system makes no outside
                        connections and works with the internet unplugged.
  From the internet     NOTHING. Never forward this port on the router.

THE RULE, ON EACH KIND OF HOST
------------------------------
Windows   Double-click firewall\windows-allow.bat   (asks for administrator)
          Adds:  "CareLink DIMS (port 8000)"  inbound  TCP 8000
                 profiles private and domain, remote address = local subnet
          Undo:  firewall\windows-remove.bat
          By hand:
            netsh advfirewall firewall add rule name="CareLink DIMS (port 8000)" ^
              dir=in action=allow protocol=TCP localport=8000 ^
              profile=private,domain remoteip=localsubnet

Linux     sudo ./firewall/linux-firewall.sh --port 8000
          Detects ufw, firewalld, iptables or nftables, and the office subnet.
          Only private ranges are accepted: 10.x, 172.16-31.x, 192.168.x.
          Look first:   ./firewall/linux-firewall.sh --dry-run
          Check:        sudo ./firewall/linux-firewall.sh --status
          Undo:         sudo ./firewall/linux-firewall.sh --remove
          By hand (ufw):
            sudo ufw allow from 192.168.1.0/24 to any port 8000 proto tcp
          By hand (firewalld):
            sudo firewall-cmd --permanent --add-rich-rule='rule family=ipv4 source address=192.168.1.0/24 port port=8000 protocol=tcp accept'
            sudo firewall-cmd --reload

macOS     sudo ./firewall/macos-firewall.sh --port 8000
          Allows python3 in the application firewall and limits the port to
          the subnet with a packet-filter rule.
          Look first:   ./firewall/macos-firewall.sh --dry-run
          Undo:         sudo ./firewall/macos-firewall.sh --remove

Tablets and phones (Android, iPad) are clients. They need no firewall rule.

THE NETWORK ITSELF
------------------
 1. Put every device on the SAME Wi-Fi network. A guest network usually
    isolates devices from one another, which blocks this.
 2. In the router, switch OFF "AP isolation" or "client isolation" for that
    network.
 3. Give the host computer a fixed address (a DHCP reservation in the
    router), so the address typed on the tablets does not change.
 4. Use the address the launcher prints, for example http://192.168.1.20:8000/
 5. On an Android tablet: open Chrome, type the address, then
    menu > Add to Home screen, so it opens like an app.

BEFORE REAL DEVICES CONNECT  (do this, it matters)
--------------------------------------------------
The demonstration accounts share a published password. On a shared network:

  a. Give each real account its own password on the host:
       python3 tools/set_password.py --user mcm.kisumu
  b. Then make the host refuse any account that has no password set:
       Windows:   set CARELINK_ALLOW_UNVERIFIED=0   (before starting server.py)
       Linux/mac: CARELINK_ALLOW_UNVERIFIED=0 python3 server.py --port 8000
  c. The connection is plain HTTP. On a trusted office network that is the
     normal arrangement for this kit. If the network is shared with people
     you do not trust, run the host with --tls-cert and --tls-key.

SESSIONS
--------
A signed-in person is signed out after 900 seconds (15 minutes) without
genuine activity, with a 15 second warning before it happens. The host also
refuses an expired session, so closing the warning or leaving the browser open
does not keep it alive. Change the host side with CARELINK_IDLE_SECONDS only
if your policy changes; the browser side is fixed at 300.

IF A DEVICE CANNOT CONNECT
--------------------------
 1. Is the address typed exactly as the launcher printed it, with :port?
 2. Same Wi-Fi network, not guest Wi-Fi?  Client isolation off?
 3. Is the rule present?  Windows: start.bat option 3.  Linux:
    sudo ./firewall/linux-firewall.sh --status
 4. Is the server running on the host (the black window is still open)?
 5. Did the host's own address change?  Use a DHCP reservation.

WHAT HAS AND HAS NOT BEEN TESTED
--------------------------------
The server and the browser application were tested with several simulated
devices on one machine. The Linux script was tested in dry-run against stubbed
firewall tools. The Windows and macOS scripts were reviewed but NOT run on
those systems. Run each with its look-first or status option on the real host
before relying on it.
"""

# ----------------------------------------------------------------------------
# writer
# ----------------------------------------------------------------------------
LOVABLE = r"""PUBLISHING THIS BUILD ON LOVABLE OR ANY STATIC HOST
==================================================


WHAT TO UPLOAD
--------------
The application is one self-contained HTML file. Two routes work:

1. Static hosting (simplest, keeps every feature)
   Upload LOMAMO-CareLink-DIMS-v6.0.html (or index.html, which is the
   same file) to any static host. The page opens, the landing page
   appears and the console runs in the browser. Records live in the
   browser on that device.

2. Source import (for further development)
   Import this folder as a project. index.html is the entry point and
   needs no build step. If your host runs a server, server.py can be
   started separately to provide the shared database; it needs Python
   3.9 or later and no packages.


WHAT A STATIC HOST CANNOT DO
----------------------------
A static host cannot run server.py, so it cannot provide the shared
central database, server-side password hashing, the four-office vote
or the audit chain verification endpoint. Use the office host for
those. The interface states which of these it can see; it does not
pretend to be connected when it is not.

Do not describe a static deployment as a production patient record
system. The Data Protection Act, 2019 obligations apply to wherever
the records actually live.


LOVABLE-SPECIFIC NOTES
----------------------
- Lovable edits React/Vite projects. This file is plain HTML, CSS and
  JavaScript by design, because it must open from a USB stick with no
  toolchain. Uploading the built HTML and using the preview is the
  supported route; rewriting it as a React app is a different project
  and has not been done here.
- If Lovable's preview blocks inline scripts or a Content Security
  Policy is added, the application will not run until that policy
  permits inline script and style. That has not been tested on
  Lovable's platform.
- Nothing in this build calls an external service. There is no API
  key, no analytics and no outbound request, so publishing it exposes
  no third party.


CHECK BEFORE SHARING WIDELY
---------------------------
- Open the file once on the target device and complete first-run setup
  yourself, so no half-finished account travels with the link.
- Do not publish a copy that contains records. Export the database,
  keep it, then start a clean copy.
- Read docs/17_V6_RELEASE.md "What has not been verified" before any
  claim is made to a partner or board.
"""

AUTO_BAT = r"""@echo off
cd /d "%~dp0"
call "%~dp0start.bat" --auto
"""

FILES = {
    "AUTO-START-WIFI.bat": AUTO_BAT,
    "start.bat": START_BAT,
    "start.sh": START_SH,
    "index.html": INDEX,
    "README-FIRST.txt": README,
    "DEMO-SCRIPT.txt": DEMO,
    "tools/lan-ip.ps1": LAN_IP,
    "tools/firewall.ps1": FIREWALL,
    "tools/network-status.ps1": NETWORK_STATUS,
    "tools/serve.ps1": SERVE,
    "firewall/FIREWALL-RULES.txt": FW_RULES,
    "firewall/windows-allow.bat": WIN_ALLOW,
    "firewall/windows-remove.bat": WIN_REMOVE,
    "firewall/linux-firewall.sh": LINUX_FW,
    "firewall/macos-firewall.sh": MAC_FW,
    "LOVABLE.md": LOVABLE,
    "lovable/README.md": LOVABLE,
}
CRLF = {"AUTO-START-WIFI.bat", "start.bat", "README-FIRST.txt", "DEMO-SCRIPT.txt", "firewall/FIREWALL-RULES.txt",
        "firewall/windows-allow.bat", "firewall/windows-remove.bat"}


def main():
    src = os.path.join(ROOT, APP)
    if not os.path.exists(src):
        sys.exit("build the application first: python3 build.py")

    if os.path.isdir(KIT):
        shutil.rmtree(KIT)
    os.makedirs(os.path.join(KIT, "tools"), exist_ok=True)
    os.makedirs(os.path.join(KIT, "firewall"), exist_ok=True)

    shutil.copy2(src, os.path.join(KIT, APP))
    # A web server serves index.html at the root, so the static-host route
    # needs no configuration at all. It is the same bytes as the application.
    shutil.copy2(src, os.path.join(KIT, "index.html"))
    os.makedirs(os.path.join(KIT, "lovable"), exist_ok=True)
    shutil.copy2(src, os.path.join(KIT, "lovable", "index.html"))
    server_src = os.path.join(ROOT, "server.py")
    if os.path.exists(server_src):
        shutil.copy2(server_src, os.path.join(KIT, "server.py"))
    for doc in ("17_V6_RELEASE.md", "18_PROMPT_EXECUTION_AUDIT.md"):
        dsrc = os.path.join(ROOT, "docs", doc)
        if os.path.exists(dsrc):
            os.makedirs(os.path.join(KIT, "docs"), exist_ok=True)
            shutil.copy2(dsrc, os.path.join(KIT, "docs", doc))
    pw_src = os.path.join(ROOT, "tools", "set_password.py")
    if os.path.exists(pw_src):
        shutil.copy2(pw_src, os.path.join(KIT, "tools", "set_password.py"))

    for rel, text in FILES.items():
        path = os.path.join(KIT, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        nl = "\r\n" if rel in CRLF else "\n"
        body = text.replace("\r\n", "\n").replace("\n", nl)
        # Guard: the Windows-facing files must be pure ASCII, or cmd.exe
        # and Notepad will mangle them on a machine set to another codepage.
        if rel.endswith((".bat", ".txt", ".ps1")):
            try:
                body.encode("ascii")
            except UnicodeEncodeError as e:
                sys.exit(f"{rel} contains a non-ASCII character: {e}")
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(body)

    for sh in ("start.sh", "firewall/linux-firewall.sh", "firewall/macos-firewall.sh"):
        os.chmod(os.path.join(KIT, sh), 0o755)

    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for base, _dirs, files in os.walk(KIT):
            for name in sorted(files):
                full = os.path.join(base, name)
                rel = os.path.relpath(full, KIT).replace("\\", "/")
                info = zipfile.ZipInfo(f"{TOPDIR}/{rel}", date_time=(2026, 10, 18, 8, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                # Unix mode in the high word: start.sh must arrive executable.
                mode = 0o755 if name.endswith(".sh") else 0o644
                info.external_attr = (mode | 0o100000) << 16
                with open(full, "rb") as fh:
                    z.writestr(info, fh.read())

    size = os.path.getsize(ZIP)
    h = hashlib.sha256(open(ZIP, "rb").read()).hexdigest()[:16]
    print(f"Kit folder : {KIT}")
    print(f"Zip        : {ZIP}  ({size/1024:.1f} KB, sha256 {h})")
    for base, _d, files in os.walk(KIT):
        for name in sorted(files):
            p = os.path.join(base, name)
            print(f"  {os.path.relpath(p, KIT):34} {os.path.getsize(p)/1024:9.1f} KB")


if __name__ == "__main__":
    main()
