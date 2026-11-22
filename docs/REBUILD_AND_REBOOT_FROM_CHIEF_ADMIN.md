# Running a rebuild or reboot from the Chief System Administrator account

CareLink keeps account passwords as one-way salted hashes (PBKDF2-SHA256). That
is deliberate: nobody — including the Chief System Administrator — can read a
password back out of the database. When accounts must be re-issued (a new
roster, a lost hand-over pack, a phone lost in the field), the Chief **rebuilds**
the official hierarchy and CareLink issues a fresh confidential credential pack.

A rebuild is not a "restore". It replaces every account, keeps every clinical and
programme record, and re-issues the password for every named seat. Read the
"what a rebuild does" table below before you start so you can tell officers
exactly what will happen.

> **Where the controls live:** sign in as the Chief System Administrator, open
> **Development Console → Provisioning**. The two buttons are **Rebuild &
> reactivate** and **Recover recent pack**. Both require the Chief's own password.

---

## 1. Before you start

| Check | Why it matters |
|---|---|
| You are signed in as the **Chief System Administrator** on the live online address (not the downloaded file, not a demo). | Accounts live in the shared online vault. A rebuild on a device-only copy fixes nothing. |
| Your own Chief password is to hand. | The rebuild asks for it again — a stolen session cannot reset every account by itself. |
| No colleague is mid-form. | The rebuild bumps the shared revision, so tablets must refresh before they save pending fieldwork. |
| You have a private channel ready (WhatsApp/SMS/printed sheet). | The handoff is confidential; an encrypted recovery receipt lasts 24 hours. |
| It is not within 24 hours of a previous rebuild. | A recent pack is still recoverable; the server deliberately refuses a second rebuild so a lost response cannot destroy the first pack. |

---

## 2. Rebuild the official hierarchy (re-issue every password)

1. Sign in as the Chief System Administrator.
2. Open **Development Console** (System → Development Console) and select the
   **Provisioning** tab.
3. Confirm the panel shows *Rebuild the official hierarchy* with the expected
   number of named officers (currently 35).
4. Click **Rebuild & reactivate**. A confirmation sheet opens.
5. Type the word **REBUILD** and enter your **current Chief password**.
6. Click **Rebuild accounts**. Wait for the confirmation — do **not** close the
   tab while the request is in flight.
7. When it succeeds, the credential pack appears in memory. Immediately click
   **Download credential document** (HTML), and/or **Download CSV** / **SMS
   dispatch text**. Only an encrypted receipt is stored in the database. The
   plaintext browser copy disappears when you sign out.
8. Hand each officer only their own line. Never post the file in a group chat.

**What the pack contains:** the actual roster name, username, explicitly
confirmed existing work mailbox (otherwise blank), single-use temporary
password and its expiry, role, department and office. Unconfirmed seats remain
disabled; CareLink never invents a person or provisions a mailbox.

**What every officer does next:** use an approved registered browser. An unknown
browser creates a pending request for **System → Devices**, not a staff session.
After approval, redeem the temporary password once before it expires (seven days
by default, governed by `system.config.temporaryPasswordDays`) and choose a new
private password. **The API refuses workspace data until private replacement.**
A stolen token without its browser cookie is not a session.

### What a rebuild does and does not touch

| Rebuilt / replaced | Preserved |
|---|---|
| Every named officer's password (new one issued) | Every patient, visit, PDCA, form, referral and financial record |
| Every session on every device (signed out) | The **Chief's own** sign-in and password |
| Other Chief accounts (deactivated, archived for attribution) | Non-account records: rosters, leave, assets, audit history |
| Legacy and demo accounts (archived, no authority) | The organisation's name, counties, departments and settings |
| Only attested existing work mailboxes are included; otherwise blank | Device admission policy and approvals; unconfirmed seats stay **disabled** |

An archived account keeps its name against historic records (an audit trail must
still say who did what) but can no longer sign in.

---

## 3. Recover a pack you did not manage to download

If the connection dropped, the browser closed, or you clicked away:

1. Sign in as the Chief again.
2. **Development Console → Provisioning → Recover recent pack**.
3. Enter the current Chief password and click **Recover pack**.
4. Download the document that appears.

Recovery works for **24 hours** and only returns passwords that are still valid.
If an officer has already set a private password in the meantime, their account is
excluded — CareLink cannot recover a password it never stored. If you have changed
your own Chief password since the rebuild, the sealed pack can no longer be
opened (it is encrypted with the password you used at rebuild time), so you must
wait out the 24-hour window before rebuilding again.

---

## 4. "Reboot" — restarting CareLink without changing any password

Most of what people call a reboot does not need a rebuild. Use the smallest step
that fixes the problem:

| Symptom | Correct action | Password impact |
|---|---|---|
| A tablet shows stale data or "refresh required" | Reload the page, or **sync chip → Retry**. The client re-pulls the shared state. | None |
| A device is signed in as the wrong person | **Sign out**, then sign in again. | None |
| A lost response during a save | The change is held on the device and retried; wait for the sync chip to say *Shared online source*. | None |
| One officer forgot their password | **County Administrator → Account recovery** issues a 24-hour recovery code, or the Chief issues one from the Development Console. | Only that officer |
| An officer's tablet was lost | **System → Devices → Revoke** that browser; use **Staff credential export → Revoke password** and reissue if its password is also compromised. | Lost browser; optionally that account |
| The last approved Chief browser was lost | Owner-only [`tools/OWNER-RECOVERY.md`](../tools/OWNER-RECOVERY.md); approve only the exact pending Chief browser. | Named Chief only; device enforcement stays on |
| The whole roster changed (new organogram, new official email domain, corrupted account vault) | **Rebuild & reactivate** (section 2). | Everyone |

A per-account re-issue is always preferable to a rebuild: it leaves every other
officer signed in.

---

## 5. If something goes wrong

| Message | Meaning | What to do |
|---|---|---|
| *A recent rebuild already issued a pack* | You are inside the 24-hour window. | Use **Recover recent pack**, or wait for the window to pass. |
| *Chief password verification failed* | Wrong password in the confirmation sheet. | Re-type it; three failures lock the account for the standard lockout period. |
| *Complete initial commissioning before rebuilding* | The installation was never globally activated. | Finish first-run setup + global activation first. |
| *Sign in required / shared online source unreachable* | The rebuild needs the online vault. | Restore connectivity; a device-only copy cannot rebuild the shared accounts. |
| *The account hierarchy was rebuilt. Refresh the shared state* | A tablet is holding pending work from before the rebuild. | Let its pending edits save first (or export them), then reload. |

Every rebuild, recovery, re-issue and failed Chief password is written to the
audit trail with the Chief's identity and the time. A rebuild can never be
performed silently.

---

## 6. After the rebuild — the three-minute health check

1. **Health:** open `https://<your-domain>/api/health`. It must report
   `globallyActivated: true`, `storageMode: cloud-kv-redis` and the expected
   number of accounts.
2. **One known officer:** on their browser, verify a pending request grants no
   staff data; approve its exact device in the Chief Devices console. Redeem the
   temporary password, set a private password, then confirm scoped workspace
   access. The temporary password must not sign in again. Test email sign-in
   only if that officer has a Chief-confirmed existing mailbox.
3. **Old password:** confirm a password from the previous pack is refused.
4. **Register:** open the patient register and confirm the programme totals are
   unchanged (a rebuild never touches records).
5. **Sign out** on the test phone so the officer's one live session is free.
