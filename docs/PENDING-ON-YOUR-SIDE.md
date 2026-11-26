# Pending on your side — the running list

> Everything below needs a **person**, not a commit. Nothing here can be closed by
> writing more code, and each line names what stays blocked until it arrives.
> Re-read this at the start of every development round; items move off it only when
> you say they are done.
>
> Last verified against the deployed system: **v6.9.9**, preferred host
> `care-link-dims-dev-three.vercel.app` (`/api/health` reports `version 6.9.9`).

---

## 1. Three decisions only the Foundation can make

| # | Decision | What stays blocked | Also blocks |
|---|---|---|---|
| 1 | **Official 52-week calendar and boundary rule** — which Monday is week 1, how a 53-week year is handled | Every weekly report keeps the word **(provisional)** | A1, A4 |
| 2 | **4,444-patient reconciliation** — the authorised private records, or a written instruction that the 4,000-patient contract stands | The register stays at 4,000. Fabricating patient rows is prohibited, so this cannot be worked around | B6 |
| 3 | **16 → 11 department structure** — which of the 16 departments becomes which of the 11, and which 8 appear on the landing graphic | `D9` is the **only** requirement still recorded as *not captured*. Merging changes RBAC, reporting and palettes — it is not a rename | D9, D10 |

## 2. Physical and account acceptance only you can perform

| # | What to do | Why a test cannot cover it |
|---|---|---|
| 4 | Sign in on the **Samsung Tab A11+** and one desktop; tap through every workspace tab | Tab reveal is measured in a simulated scrollport; a real screen is the only real proof (B4/C5) |
| 5 | **Two browsers, one account** — confirm the second is refused, press takeover, confirm the first says *why* it was signed out | 31 automated checks prove the behaviour; the wording on a real screen is your acceptance (D4/C4) |
| 6 | **Print** a report and a discharge summary, wired and wireless | Output on physical paper is unverified (D2) |
| 7 | **Stylus**: sign a SOAP encounter on the tablet, then print it | Capture works with pointer events; the pen feel and printed ink need your eye (D19) |
| 8 | **Offline sign-in**: sign in online, tick *Remember this device*, turn the radio off, sign in offline | Credential expiry and refusals are tested; a real network going down is not (C1) |

## 3. Licences, suppliers and third parties

| # | Needed | Consequence until it arrives |
|---|---|---|
| 9 | **Bible translation licence** — which of the seven can be reproduced, plus the licence reference | Only public-domain **KJV** text is displayed; the other six show references that open at the publisher (A6) |
| 10 | **Private storage + malware scanning** supplier or budget | Document sharing stays **blocked**; the legacy file service keeps running without document-level authorisation (B2) |
| 11 | **Clinical / privacy review** of the PDCA pattern review engine | The engine stays advisory-only and is never presented as a clinical model (D17) |
| 12 | **120 real MCM-reviewed cycles**, approved for training, if you want a real engine rather than a pattern check | The engine keeps learning from the demonstration register, and says so on screen (D17) |

## 3b. Things on the deployed host only you can confirm

| # | To confirm | Why |
|---|---|---|
| 12a | Whether the **4,000-patient demonstration register** is meant to be loaded on the live host at `care-link-dims-dev-three` | It is a live, globally activated installation with **36 accounts** and no patient rows loaded (rev 359). The register is imported deliberately, never seeded automatically — so this waits on your instruction. |
| 12b | Name a **reviewer** for the public statistics (`settings.publicStatistics.<figure>.reviewedBy`) | Until a figure carries a named official's review, the portal keeps showing the labelled cumulative totals and prints no live number. That is by design (B5). |

## 4. Verification that needs an approved private process

| # | Needed | Note |
|---|---|---|
| 13 | Real-patient completeness verification | Must run through the approved private process — never in this repository. `v6/tools/verify_no_patient_data.py` guards the repository side |
| 14 | **Android APK** signing and store submission | `native-android/` and both workflows are committed and building; the keystore and the store listing are yours |

---

## How these are tracked in the repository

- `docs/OUTSTANDING-DELIVERY-TRACKER.md` — the same list, inside the standing tracker.
- `docs/audit/PROMPT-AUDIT-001.md` — each blocked or provisional requirement says
  beside the requirement which of the items above it is waiting on.
- `v6/docs/BUILD_LOG.md` — what was deployed and when, per release.

## Standing rules that stay in force while you work through this list

- The **4,000-patient** register is contractual. Do not reseed it to 4,444.
- **No real patient record** is created or modified in this repository.
- Do not clear browser storage, reset the installation, or delete held work as a shortcut.
- Public portal statistics must never show a marketing figure as a counted one, and
  never expose patient-level data (suppression floor is 5 people).
- A captured stroke is **not** a verified signature, and is never presented as one.
