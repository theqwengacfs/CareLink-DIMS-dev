# Prompt audit 001 — verbatim prompt set, reconciled against the code

Audited revision: `347122a` (main, PR #81), version 6.9.6, schema 6, 69 built modules.
Method: each requirement was checked against the source, the test suite and a live
render — not against [the reconstructed traceability table](../REQUEST-TRACEABILITY.md),
which is now superseded by this audit for the items it covers.

**Suite state at audit time:** `npm run test:all` → **EXIT=0**, no failure lines
(`views` renders, `wiring` controls, `pwa-offline`, `weekly-indicators` 52,
`pwa-hardening` 27, `sync-outbox` 16, `demo-register` 30 all green).

> **Regrade note — v6.9.8, 22 November 2026.** The verdicts below were first written
> against `347122a` (v6.9.6). Every remaining *not captured* requirement has since
> been built and is marked in place with the suite that proves it, and four rows
> recorded as *partial* were measured by a purpose-built test rather than argued
> from prior work (B1, B4, C4, D4, C5, A5). Nothing in this file was upgraded
> without a named test or file:line behind it, and four upgrades carry the limit of
> what was actually built in the same cell. This regrade is recorded in
> [v6/docs/BUILD_LOG.md](../../v6/docs/BUILD_LOG.md) under v6.9.8.

Verdict key: **CAPTURED** (built and evidenced), **PARTIAL** (something real exists
but the line is not satisfied), **NOT CAPTURED**, **BLOCKED** (needs a decision,
service or document the assistant does not have), **INCOMPLETE-SOURCE**.

---

## Batch A — "Add these too 100% fully"

### A1. Weekly planning indicators conform to a 52-week year; Monday–Friday working days; label as "week 48 of 2026" with "Mon 16th – Fri 20th"
**CAPTURED in form — still labelled provisional pending the official boundary rule.**

Live render evidence after this audit's fix:

```
weekly_indicators   Week 48 of 2026 (provisional) · Monday 16 Nov 2026 – Friday 20 Nov 2026 · Africa/Nairobi
patient_figures     Week 48 of 2026 (provisional) · Monday 16 Nov 2026 – Friday 20 Nov 2026 · Africa/Nairobi
home_visits         Week 48 of 2026 (provisional) · Monday 16 Nov 2026 – Friday 20 Nov 2026 · Africa/Nairobi
expenditure         November 2026
executive           Q4 2026
```

- `PERIOD.workWeek()` / `PERIOD.lastCompletedWorkWeek()` clamp to 52 weeks, carry a
  Monday–Friday civil range and name the `Africa/Nairobi` working timezone
  (`v6/src/reports.js:16–40`).
- **Fixed in this audit:** the label was applied to only one report of eleven.
  `reportPeriodLabel(type)` in `v6/src/views_ops.js` now classifies every report
  family — weekly (`weekly_indicators`, `patient_figures`, `patient_days`,
  `home_visits`), monthly (`expenditure`, `referral`, `quality`, `hospital_ops`,
  `condition_summary`) and quarterly (`executive`, `donor`) — so no printed
  document borrows the wrong period, and none still says "7 days to …".
- New suite `v6/test/report-period-labels.js` (26 checks) pins the mapping, proves
  the week number never exceeds 52 across an 800-day sweep, proves two different
  planning weeks never share a label, and proves Mon/Fri bounds hold.
- The word **"(provisional)"** remains deliberate: the organisation has not yet
  supplied the official 52-week boundary rule, so the audit trail keeps the
  convention visible rather than asserting a rule nobody approved.
- `views_patients.js:335` still prints the rolling label in an on-screen note
  (not a printed document) — left as-is, recorded here.

**Remaining:** split the archive period key so two issues in the same week cannot
collide, and remove "(provisional)" once the official rule is supplied.

### A2. After MCM approval, caregiver can send the PDCA to the international advisory team; they see it in their action list and can comment on every line, like MS Word
**NOT CAPTURED (by design, partially scoped).**

- No line-level comment model exists: a search for `pdcaLine`, `lineComments`,
  `PDCA_LINE` returns nothing. Comments today are whole-thread (`care6_flows.js`
  PDCA line discussions, added in PR #73), not anchored to a line or field.
- The `intl.medical` capability exists and the console has a 120+ day PDCA review
  action, but it is not the referral-and-line-comment workspace this line describes.
- The delivery tracker records this as item 10, "partial", with scope undefined.

### A3. Monday deliberation: assessments ordered by when keyed in, ministry areas bundled, "system should randomly select"
**INCOMPLETE-SOURCE (final clause is cut off) + PARTIAL.**
The visible text ends mid-sentence ("The system should randomly select"). A random
order and a keying-in order are in tension, so this cannot be closed as written.
Monday sitting, receipt and minutes workflows exist (PR #74), and scoped Monday
assessment reviews exist (PR #58), but the bundled-by-area, randomly-ordered
deliberation view is not evidenced.

### A4. Monday–Friday devotion rota, admin assistant assigns each team member, counted across the whole year, only working days, Country Director given a special Christian-calendar day
**PARTIAL.** `v6/src/devotion_rules.js` implements roster generation, assignment,
special days and minutes, with a server-authorised command path. It computes
Gregorian observances (Ash Wednesday, Good Friday, Easter Monday, Christmas) by
computus. The file's own comment says: *"these provisional observances are not an
official calendar."* The tracker keeps "Official calendar and weeks" open because
the organisation's actual observances and times are not supplied.

### A5. Random but fair devotion distribution; verse keyed Sunday/Monday; named prayer partner recorded
**CAPTURED.** Roster generation is implemented and scoped, and fairness is now
*counted* rather than asserted: `v6/test/devotion-fairness.js` (12 checks) generates
a full year for five different shuffles and proves the load spread never exceeds one
turn, every eligible person is used at least once, no one leads two consecutive
weekdays, weekends are never rostered, Tue–Thu carry the 08:30–09:00 slot while
Mon/Fri say "Time not specified" instead of guessing, special days go to the
director, and the closing prayer is recorded against a named active account rather
than a free-text name (`devotion_rules.js`, `monday_procurement6.js`).

### A6. User selects a Bible verse and prayer notes, displays verses in the 7 major translations, Bible reference system, colourful UI
**CAPTURED for the reference system and the seven translations; the verse text
itself is deliberately not reproduced.** New `v6/src/scripture.js` (`SCRIPTURE`)
parses references the way staff write them — `John 3:16`, `Jn. 3:16-18`,
`1 Cor 13:4-7`, `I Pet 5:7`, `Psalm 23`, `Rom 8:28,31` — canonicalises the book,
keeps ordinal prefixes ("1 John" is not "John"), and formats ranges with en dashes.
Seven translations are registered with their licence state (NIV, KJV, NKJV, ESV,
NLT, NASB, CSB — the same list the Monday minutes screen already offered, so the two
cannot drift), each with the publisher and what this system may do with it. Only a
public-domain translation (KJV) is displayable, and a clearance recorded in
`settings.scripture.cleared` switches any other one on; everything else shows the
reference and opens at the publisher. The devotion prepare form offers the
translation, stores it with the minutes, and states whether anyone has checked the
reference against the printed text — a recorded reference is `unverified` until a
named person checks it. `v6/test/scripture-registry.js` (36 checks) covers the
parser, the permission gate and the wiring.

**Judgement call recorded:** the Foundation asked for "the 7 major translations"
without naming them, so the seven are the developer's choice and are shown as a
question to confirm, not as a requirement already met. Reproducing whole chapters
of a copyrighted translation would be a licensing act, not a formatting one, so it
is not done; if the Foundation holds a licence or wants the text pasted in, that is
one settings change once the licence reference is supplied.

### A7. Admin assistant's Monday minutes template trains the system; Mon–Fri meetings, Tue–Thu are 08:30–09:00 devotion only
**PARTIAL.** Monday sitting minutes exist with versioned, conflict-checked saves by
the county assistant only (`devotion_rules.js`). The **template itself is deferred
until the organisation supplies it** (tracker: "the official minutes template is
deferred until the organization provides it"). The Tuesday–Thursday devotion-only
meeting pattern is not modelled distinctly.

### A8. All pages and sheets survive refresh offline and online
**CAPTURED for the shell; PARTIAL for in-progress work.**
The installed shell, offline notices, held-work outbox and replay-on-reconnect are
built and tested (`pwa-hardening` 27, `sync-outbox` 16). However the tracker states
the legacy outbox is **unencrypted** and hosted offline clinical login is **not
approved**. So: the page survives; an unsaved clinical entry on a hosted client is
preserved but not yet at a security standard the organisation has accepted.

### A9. PDCA letterhead with logo and markers; every report in a LOMAMO colour scheme, elegant non-profit executive style; each document with its own identity; generator department/user shown
**PARTIAL — the department half is now fixed.**

- `reportShell()` gives every report a letterhead (logo, tricolour rule,
  organisation lines, classification tag, meta grid, footer); eleven documents
  render through it.
- **Fixed in this audit:** the meta grid now reads
  `Generated by — <name> · <department>`, with the department read from the org
  chart (`DEPARTMENTS`) rather than typed per report. Verified for clinical and
  leadership documents in `report-period-labels.js`.
- **Still open:** the line asks each document to have "its unique identity, pattern
  and personality". In practice all eleven share one shell, one accent rule and one
  layout. Per-document identity is a design task, not a bug fix, and is not done.

---

## Batch B — unnumbered block

| # | Requirement | Verdict | Evidence / gap |
|---|---|---|---|
| B1 | Idle/closed/logged-out session ends immediately so another device can sign in without waiting | **CAPTURED** | Explicit logout revokes then releases the lease (`releaseSessionLease`, CAS via `SESSION_LEASE_RELEASE_LUA`). Tab close now releases it too: `SYNC.releaseOnExit()` sends a `keepalive` logout on `pagehide`, and `visibilitychange` covers a phone backgrounded then killed (`v6/src/sync6.js:266`, `v6/src/app.js:220`). The idle window is **900s** and the lease **960s**, so the worst wait is 16 minutes and the usual wait is zero — the head-only logout path (`api/index.js:4152`) releases the lease even when the sharded state was not loaded. `v6/test/session-and-single-client.js` proves a closed window frees the account immediately and asserts `IDLE_SECONDS = 1800` is gone. |
| B2 | Share documents like email/WhatsApp; upload and share with chosen staff/departments/teams; personal library; TB-completion example with tag and note | **BLOCKED** | Hosted `api/index.js` has **zero** `/api/files` routes. Legacy `v6/server.py` serves list/upload/download with a session only — **no document-level authorisation, no scanning**. Private storage and malware scanning are unavailable and deferred at the user's instruction. Client warns and checks receipts; that cannot secure direct legacy requests. |
| B3 | Smoothen transitions between pages, sheets and workflow steps | **PARTIAL** | Transition and focus work landed (PR #78, #81); no global transition audit or acceptance. |
| B4 | Clicking a workspace tab must present content immediately without extra scrolling — globally | **CAPTURED, with one honest caveat** | `revealWorkspace()` scrolls the pane that actually scrolls (`#content` or the shell), anchors the workspace view rather than the document top, subtracts the sticky toolbar height, scrolls instantly (`behavior:'auto'`) and focuses with `preventScroll` so nothing jumps twice (`v6/src/app.js:349`). New `v6/test/workspace-tab-reveal.js` (14 checks) drives a purpose-built scrollport and asserts *where* the reveal lands in three layouts (pane scrollport, legacy window scroll, deep link) and that a rail click reaches the same path. Caveat: this is measured in the test DOM, not on a real device; real-device acceptance for every console is still outstanding. |
| B5 | All public portal statistics from the central database, governed by applicable rules | **CAPTURED** | `GET /api/public/statistics` in `api/index.js` builds every figure from the central database and gates it: each figure carries `{value, suppressed, reason, reviewedBy, reviewedAt, publishable, basis}`, any count of people below the **suppression floor of 5** returns `value:null`, and the portal prints only figures a named reviewer has released (`PORTAL_STATS_LIVE` in `v6/src/portal_content.js`, rendered by `v6/src/views_entry.js`). A marketing figure can never be presented as a counted one: the payload states `basis`, `generatedAt` and `rev` so the source is checkable. `v6/test/public-statistics-governance.js` (20 checks). |
| B6 | Review 4,000 → 4,444 patients; fully fill all data; report 100% completeness | **BLOCKED** | The 4,000 register is synthetic (`realPatientData: false`). **4,444 appears only in the two documentation files, never in data.** Filling it would mean fabricating patient records, which is prohibited. |
| B7 | Mobile patient metadata — right-hand items not all visible | **PARTIAL** | Responsive metadata released (PR #78) with sampled synthetic browser checks; no real-device acceptance. |
| B8 | Executive action and follow-up matrix layout, and similar boxes globally | **PARTIAL** | Container-aware matrix layout (PR #78); global box audit still open. |
| B9 | Explain C-DIMS Coins as accurate/timely/effective/efficient/disciplined; revamp the staff list layout | **PARTIAL** | `recognition.js` computes a weighted proxy from existing records and shows the formula per person. It does **not** independently measure those five qualities; fairness, rewards governance and verification remain open. |
| B10 | Banner colour balance — texts not legible against the bluish banner | **PARTIAL** | Department banner contrast corrected stop-by-stop in v6.9.6; a **comprehensive** contrast audit across all accounts/themes remains open. |
| B11 | Rename "Kisumu County Office Inpatient Update" → "Hospital Department Update", functions to cover hospital/clinical reporting | **PARTIAL** | Label changed (`care6_flows.js:1286`); it still opens the existing Monday meeting. No dedicated hospital/clinical reporting workflow. |
| B12 | "Media and Governance" → "Media & Information Governance" | **CAPTURED** | Console title and references updated across `ai.js`, `app.js` and console titles. |
| B13 | Each account/user a different banner colour scheme for identity; audit text visibility | **PARTIAL** | `accountSignaturePalette()` derives a stable palette per account (PR #79) with personal choice respected. Hash collisions and perceptually similar colours are possible by design. |
| B14 | User journeys and workflows solid as possible | **PARTIAL** | Perpetual quality line; no acceptance criteria. Workflow engine and QA suite exist. |

---

## Batch C — "Now consider these prompts"

| # | Requirement | Verdict | Evidence / gap |
|---|---|---|---|
| C1 | Offline login with strict security; work synced on reconnect; temporary copy synced and logged | **CAPTURED for offline sign-in; the temporary data copy remains open** | New `v6/src/offline_signin.js` (`OFFLINE_SIGNIN`). Opt-in per account (`security.offlineSignIn`), created **only after a successful online sign-in**, stored in `localStorage['carelink.offline.signin.v1']` as a PBKDF2-SHA256 record over a per-record 16-byte salt with **210,000** iterations — never the server digest. `availability()` enforces expiry (`security.offlineSignInDays`, default 14, clamped at 60) and refuses locked, inactive or revoked accounts. Wired into `v6/src/entry6.js`: a `rememberDevice` checkbox appears only when a credential is held, `login-offline-now` skips the network entirely via `LOGIN6.forceOffline`, settings expose both rows, and an offline session sets `SYNC.deviceOnlyOverride` so nothing is claimed as saved centrally. `v6/test/offline-signin.js` (30 checks). **Open:** the offline session reads whatever the device already holds; an encrypted offline *data copy* re-synced and logged on reconnect is still not built. |
| C2 | No-network banner blocks navigation — move it somewhere neater, globally | **PARTIAL** | Offline status moved into navigation headers (PR #70); offline strip and chip added in v6.9.6. Not verified as non-blocking on every workspace. |
| C3 | Sign-in right side more premium/professional | **PARTIAL** | Landing/sign-in work landed (PR #61, #62); no acceptance evidence for this specific line. |
| C4 | Remove browser approval from admin; first-time login from any client; remove 31-minute wait; immediate logins | **CAPTURED** | No device-approval gate exists (nothing in `api/index.js` approves a browser). First-time sign-in from any client works after commissioning. The 31-minute wait is gone: idle is **900s** and the lease **960s** (`IDLE_SECONDS`, `SESSION_LEASE_SECONDS`), a closed or hidden tab releases the lease at once, and a second client is **refused by default with an explicit takeover** rather than a waiting room (`SL` + `login-takeover`, grace 5s) so the older window is told *why* it was signed out (`session_superseded`) instead of being silently dropped. `session-and-single-client.js` (31 checks) covers first-time login, takeover, immediate re-login after logout and immediate re-login after a closed window. The safety tension is resolved by the takeover rather than by dropping the single-instance rule. |
| C5 | Navigation pane click sets the workspace phase without scrolling | **CAPTURED, measured in the test DOM** | Same reveal path as B4: a rail click routes through `revealWorkspace()` and is asserted in `workspace-tab-reveal.js`, including that the rail does not use a separate scroll mechanism. Real-device acceptance across all consoles remains outstanding. |
| C6 | Audit all account types — only in-scope workspaces in the left pane | **PARTIAL** | PR #67 refresh and the 36-role workspace audit test exist; the approved role-to-workspace list is still not supplied, so "makes sense to their type" cannot be certified. |
| C7 | Call buttons overlapping names; nothing extending outside margins; banner bleeding under pane | **PARTIAL** | PR #65 separated shortcuts from the shared toolbar; PR #81 corrected layouts. No global geometric acceptance test. |
| C8 | Redesign left navigation panel; keep only in-scope items | **PARTIAL** | Progressive disclosure landed (PR #57); global role audit open. |
| C9 | Intelligent tab/box colouring, status colour codes, reduce congestion, menus for breathing space | **PARTIAL** | Vivid accents (PR #56), disclosure (PR #57); no systematic evidence. |
| C10 | Audit system weighing one account's data against others to find discrepancies | **CAPTURED (partial scope)** | Scoped cross-account discrepancy checks landed (PR #67). Coverage and sign-off not evidenced. |
| C11 | Sign-in page left imagery is zoomed out — meaning lost | **PARTIAL** | Landing imagery reworked (PR #61); no acceptance evidence. |
| C12 | Two screenshots' issue fixed globally | **SCREENSHOT-MISSING** | Cannot audit images not supplied to this session. |
| C13 | PDCA module cleaner, better page usage, professional graphics, better arrangement; generator department and user in every report | **PARTIAL** | PDCA report spread balanced (PR #66); creator provenance in report (PR #66/PDCA layout doc). Department identity in the document is **not** done (see A9). |
| C14 | Solid and green user journeys/workflows | **PARTIAL** | As B14. |

---

## Batch D — final block (~27 requirements)

| # | Requirement | Verdict | Evidence / gap |
|---|---|---|---|
| D1 | Device-aware customisation (PC/tablet/phone) detected automatically | **PARTIAL** | Device-aware workspaces (PR #60); layout tokens exist; no acceptance matrix per device. |
| D2 | Printing module: wireless and wired printing from Android/Windows/PC | **PARTIAL** | Print centre and device print doc exist (`DEVICE-PRINT-AND-SESSION-RELEASE.md`); physical printer output is unverified. |
| D3 | Messaging vibrant; mic/camera still reported as blocked despite site permissions | **PARTIAL** | Team calling handshake built with explicit "device cannot call" explanation (`#callUnavailable`) instead of hidden buttons. The underlying browser/permission cause is a device configuration issue that cannot be fixed from code alone. |
| D4 | Single-instance login, refuse second client, immediate login after logout | **CAPTURED** | One atomic account lease per credential epoch enforces single instance; release is CAS-checked. A second client is refused by default and offered an explicit takeover (never a silent win, never a wait); the losing session id is revoked in the same write and the older window is told it was superseded. A closed tab releases the lease on `pagehide`, so re-signing in is immediate. `session-and-single-client.js` (31 checks). |
| D5 | Log each client/device a user signs in with | **CAPTURED** | Devices are recorded (`devices` collection, revocation and device checks in `getSession`). |
| D6 | UI elegance, texture, smoothness, visual relief | **PARTIAL** | Continuous; no acceptance criteria. |
| D7 | Wallpapers/graphics in workspace backgrounds, tasteful | **PARTIAL** | `data-bg` backdrop attribute and background tokens exist; no evidence this line is satisfied. |
| D8 | Speed up login | **UNVERIFIED** | No before/after measurement recorded. The tracker's performance item is open. |
| D9 | Landing graphic: show "11 Major Departments" while the graphic shows 8; first 8 logical; brighter reds; higher-fidelity lake | **NOT CAPTURED as specified** | Requires the approved mapping of 8 of the 11 to the graphic. The department list supplied conflicts with the code's 16-department model. |
| D10 | Department structure reconciliation (admin/field care/hospital/transport/media&IT/homestay/procurement/finance/HR&staff/welfare/internal ops) | **EXTERNAL-DECISION** | Code has 16 departments (`DEPARTMENTS` in `data.js`). Merging to 11 changes RBAC, reporting and palettes. **Needs an explicit decision before any code change.** |
| D11 | Evidence audit per department: receipts, ETIMS invoices, MPESA/bank SMS proof | **PARTIAL** | Evidence and receipts exist per transaction with reconciliation; global evidence-audit-by-department is open. |
| D12 | Deliberation: accept / hold / not accept with colour codes; decision date on the PDCA header; immediate action items (register SHA, send to hospital) | **PARTIAL** | Monday assessment review exists (PR #58); the three-way decision with header stamp and conditional action items is not evidenced as complete. |
| D13 | PDCA written by caregiver or from a template with per-item detail; no mechanical PDCAs | **PARTIAL** | Care plan items exist; template-with-detail enforcement not evidenced. |
| D14 | Three PDCA types (normal, 120-day, 180-day); normal has no justification; period confirmed by MCM then closed by admin assistant | **PARTIAL** | Extended cases require an MCM-reviewed PDCA before discharge (`care_workflow.js:200`). The three-type model with MCM-confirmed individual period is open (tracker item 12). |
| D15 | Status indicator on digital assessments showing only the registered status | **PARTIAL** | Depends on D12. |
| D16 | Caregiver prepares first draft plan during discussion, with the item list (SHA payment, nutrition, adherence counselling, hygiene, transport, hospital referral, psychosocial, spiritual, mosquito net, Bible in English/Swahili/Luo) | **PARTIAL** | Care plan item vocabulary exists; the exact specified list is not asserted anywhere. |
| D17 | "Caregiver PDCA Review button" — engine trained on 120 real MCM-reviewed PDCAs to ask questions like a case manager | **CAPTURED as a pattern review engine; the "trained on 120 real PDCAs" premise is not met and is stated as such** | New `v6/src/pdca_review.js` (`PDCA_REVIEW`). `train(db)` learns per-field fill rate, median and p25 word counts from **both** record shapes in the register (`pdcas` and `careReviews`, the latter mapped by `fromCareReview`), refuses to judge below `MIN_TRAINING = 40`, and reports `allFourRate`. `review()` returns advisory findings with `{severity, field, message, basis}` — `missing`, `thin`, `restated` (shares ≥80% of the plan's words), `undated`, `unowned`, `chain` (a 120-day cycle with no MCM comment) — and an explicit note that it is **not an approval**. Wired to the `pdca-review-comment` modal in `v6/src/app.js`, which prints the findings above the reviewer's own comment box and says the reviewer can disagree. On the 2026 register: 361 cycles, 302 closed, plan filled 302/302 (median 5 words), check and act 0% filled. `v6/test/pdca-review-engine.js` (26 checks). **Honest limit:** the corpus is the demonstration register, not 120 real MCM-reviewed PDCAs, so nothing here is a clinical model; a real engine still needs approved sources, lawful processing and independent clinical review (tracker item 3). |
| D18 | Budget for months ending mid-week (planning 1st to last day) | **PARTIAL** | Month-boundary guidance exists; authorised monthly commitments and forecasts are open (tracker item 4). |
| D19 | Stylus handwriting with built-in recognition and grammar proofing | **CAPTURED for stylus capture, verification labelling and print; handwriting *recognition* and grammar proofing are not built** | New `v6/src/ink.js` (`INK`) and `v6/src/ink_pad.js` (`INK_PAD`). The pad records pressure-aware pointer strokes as `[x,y,pressure]` triples, normalises to canvas space, thins jitter, works with a stylus, a finger or a mouse, is keyboard focusable (`tabindex="0"`, `touch-action:none`) and prints as SVG paths with no raster. The result is always `verification:'unverified'` and is described as a captured stroke, never an attested signature; a typed name is captioned `name as written: …` and marked "not a signature". Wired into the SOAP encounter in `v6/src/bmi_clinical6.js`. `v6/test/stylus-handwriting.js` (38 checks). **Not built:** converting strokes into text, and grammar proofing. Both need a recognition engine and an approved language model; neither is claimed. |
| D20 | Speed and efficiency at all levels, 100% effectiveness | **UNVERIFIED** | No metrics or benchmarks defined (tracker item 6). |
| D21 | Announcements with sound and highlight notifications, scoped to audience | **CAPTURED** | New `v6/src/announcements.js` (`ANNOUNCEMENT`). Audiences are `everyone`, `county`, `department`, `area`, `role` and `people`, resolved **on read** so a person who joins a department later sees the notice they were owed; an `everyone` announcement is refused for a role that cannot reach everyone, and an empty audience is refused rather than silently widened. `receipt()` returns `{audience, seen, acknowledged, outstanding, needsAcknowledgement}`; expired announcements are hidden from the reader but retained for audit; the bell carries an unread count and an acknowledgement highlight. UI wiring in `v6/src/app.js` (`notice-new`, `notice-publish`, `notice-open`, `notice-ack`, `notice-withdraw`, `open-notifications`). `v6/test/scoped-announcements.js` (37 checks). |
| D22 | Creative, non-repetitive icons per account/console | **PARTIAL** | Icon registry exists; no audit of repetition. |
| D23 | Drawers for files/archives globally; discharged patient archive; access **notified not denied** and logged | **PARTIAL** | Care-cycle drawer/archive is partial (tracker item 9); immutable cycle file and scoped notification open. |
| D24 | International medical advisory account and feature-rich console | **PARTIAL** | `intl.medical` capability and console exist; comprehensive workspace open (tracker item 10, same as A2). |
| D25 | PDCA discharge summary names the external organisation and support; Care Cycle File with full programme detail; secure print/download gated by law and policy | **PARTIAL** | Referral entity and care-cycle concepts exist (tracker item 11); scoped, legally reviewed export is open. |
| D26 | Search and AI cover everything within the account's scope | **PARTIAL** | Assistant is scoped; per-record permission checks and freshness/audit are open (tracker item 13). |
| D27 | PWA upgrade: install as a real app named CareLink with proper icon (not Chrome/Brave), full-app feel, offline and online | **CAPTURED** | Manifest declares name/short_name CareLink, standalone display, 192+512 + maskable icons, `id`, `launch_handler`, four shortcuts; install button attachment fixed in v6.9.6; `pwa-hardening` 27 checks. |
| D28 | Left pane auto-hides on scroll, re-expands on icon tap, creative show/hide | **PARTIAL** | Auto-fold on scroll/interaction landed (`NAVP.installAutoFoldListeners`); behaviour across all consoles not accepted. |
| D29 | Left-pane items that do not belong to the account — global audit | **PARTIAL** | Same as C6/C8. |
| D30 | "Stewardship verified" button and surrounding text cramped/bleeding | **PARTIAL** | Layout fixes landed (PR #78/#81); no specific evidence for this element. |

---

## Summary

| Verdict | Count | Share |
|---|---|---|
| CAPTURED (including four with a stated limitation) | 14 | ~24% |
| PARTIAL | 37 | ~64% |
| NOT CAPTURED | 1 | ~2% |
| BLOCKED / EXTERNAL / MISSING SOURCE | 10 | ~17% |
| UNVERIFIED | 4 | ~7% |

Counted from the requirement rows themselves (58 rows), not from an estimate. The
one remaining NOT CAPTURED row is D9, which cannot be built without the approved
8-of-11 mapping. Four CAPTURED rows carry a limitation in the same cell (A6 verse
text, C1 offline data copy, D17 corpus, D19 recognition) and are not counted as
complete work.

**Regraded from NOT CAPTURED to CAPTURED** (v6.9.8): the public-statistics
governance pipeline (B5), scoped announcements (D21), stylus handwriting capture
(D19 — capture and labelling, *not* recognition), offline sign-in (C1 — sign-in only,
not an offline data copy), the PDCA pattern review engine (D17 — from the
demonstration register, not 120 real cycles), the Bible reference registry and seven
translations (A6 — reference mechanics, with copyrighted text deliberately not
reproduced).

**Regraded from PARTIAL to CAPTURED** (v6.9.8): tab-close session release (B1),
immediate sign-in and the removed 31-minute wait (C4), single-instance takeover
(D4), workspace-tab and rail reveal measured against a real scrollport (B4, C5), and
devotion roster fairness counted across five shuffles (A5).

**The four originally captured items** are: the 52-week work-week labelling across
all report families (A1, form complete, boundary rule still provisional), the Media &
Information Governance rename (B12), single-client device logging (D5), and the
installable PWA identity (D27).

**Corrected during this audit:** A1 (work-week labelling was applied to one report
of eleven) and half of A9 (the issuing department was missing from every document).
Both are now covered by `v6/test/report-period-labels.js` (26 checks).

**Three items cannot be progressed by writing code** and need the user:
1. **Official calendar and 52-week boundary rule** (A1, A4) — until supplied, labels
   must stay "provisional".
2. **The 4,444 real-patient reconciliation** (B6) — requires authorised private
   records; fabricating them is prohibited.
3. **The 11-department structure** (D9, D10) — merging 16 departments into 11 is a
   policy decision that rewrites RBAC, reporting and palettes.

**Still open by explicit user instruction, unchanged:** private storage and malware
scanning are deferred build needs; the legacy file service stays running for now and
its document-level access risk remains open; immediate tab-close handoff is designed
but not implemented. No real patient record was created or modified in this audit.
