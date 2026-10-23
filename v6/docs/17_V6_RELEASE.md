# 17 · LOMAMO Foundation CareLink DIMS v6.0 · Release report

**Date:** 22 October 2026
**Build:** 6.0.0 · schema 6
**Artefact:** `LOMAMO-CareLink-DIMS-v6.0.html` (1,339 KB, one file — no server needed to open it)
**Host:** `server.py` (optional; the shared-database mode)
**Lineages merged:** CareLink DIMS v5.1 application source (Claude lineage) + v5.3 Office Kit
(delivery packaging with an older server fork)

This report states what exists, what was verified, and what has **not** been verified. It does not claim
more than the tests and measurements show.

---

## 1. What v6 is

One system, not a new one. Every v5.1 module is retained: patient register, assessment pipeline, visits,
PDCA, hospital requests and focal-person workflow, reconciliation, reports and the report archive,
finance, procurement, media and consent, staff and leave, pharmacy, care plans, forms, targets,
condition register, audit, backup, import, settings, messaging, calendar.

v6 adds the layers the merge required, each as a module with one owner, one capability set and one audit
trail:

| Area | What exists | Where |
|---|---|---|
| Patient master index | Stable internal IDs (`p00001`), identifier index (national ID, CCC, code), duplicate **candidates** with a review queue. Nothing is auto-merged; a merge is a recorded decision with a merge journal entry | `src/pmi.js` |
| Data quality | Live-computed findings from the records themselves. **Blocking** findings must be corrected in the record and cannot be waived; **warnings** and **advisories** may be waived by `dq.manage` with a written reason for a stated period, and return by themselves when it expires | `src/insight6.js` (`DQ6`) |
| Visit-order learner | Learns the order in which a caregiver's visits were recorded per field day, the movement between service areas, and proposes the next patient with its reasons attached. A proposal only reaches the calendar when a person adds it | `src/insight6.js` (`PLAN6`) |
| CareLink coins and standing | 100-point usage/data-efficiency ranking computed from recorded activity, badges and tiers, coin ledger, re-earning rules | `src/recognition.js` |
| Staff evaluation | Badge ladder, evidence, coin awards, review notes — computed from data, never a hardcoded score | `src/recognition.js` |
| Department library | Per-department catalogue and archive, time-limited cross-department access requests, owning-department decision, self-closing expired loans | `src/workplace.js` (`LIBRARY`) |
| Executive console | Agenda, minutes, decisions and documents for the Director's executive team only | `src/workplace.js` |
| Office equipment register | 122 rows imported from the October 2026 master workbook, categories, movements, condition, missing/damaged counts | `src/workplace.js`, `src/inventory_data.js` |
| Students, interns, research | Placement records, supervisor, data-access level, supervision log | `src/workplace.js` |
| Occupational health & safety | Incident and hazard register with severity, action and closure | `src/workplace.js` |
| Presence and location | Deliberate location sharing, visible for a short window, feeding the messaging presence chip | `src/workplace.js` (`PRESENCE`) |
| Weather board | Cached reading, explicit "needs a connection once" state; never blocks any other page | `src/workplace.js` (`WEATHER`) |
| Live shared database | Host-authoritative sync with per-operation idempotency keys, delta reads, merge journal, audit-chain verification and rollback | `src/sync6.js`, `server.py` |
| Landing, sign-in, onboarding | One-screen sign-in, richer landing, activation-code onboarding, account request from the landing page | `src/entry6.js`, `src/console6.css` |

## 2. The reconciliation policy, stated plainly

There is no user-facing conflict screen. Every device converges on the central record:

| Central revision | Local state | Decision |
|---|---|---|
| 0 and the device holds records | push this device's copy |
| 0 and nothing local | nothing to do |
| newer than the device | adopt the central copy; a dirty device patches its own edits on top |
| equal | in step |
| device has no recorded revision | adopt (never merge blind) |

Every write carries an operation id. Replaying a write that already reached the host is a no-op, so a
dropped connection cannot duplicate a record. Every merge is journalled with before/after values, and
`/api/audit/verify` recomputes the hash chain from genesis.

## 3. Session policy

Idle auto-logout is **900 seconds** (15 minutes) with a warning at 870 seconds, replacing the old
60-second rule, and is configurable on the host (`CARELINK_IDLE_SECONDS`). Drafts are persisted before
the lock, and the lock is distinguished from a server-side session end.

## 4. What was checked

Run in `v6/` with `python3 build.py` then `node test/<suite>.js`:

| Suite | Result |
|---|---|
| smoke | 25 passed · 0 failed (26 checks, 1 informational) |
| lint | 18/18 |
| wiring | all 113 emitted controls have handlers |
| modals | 67 action paths + 28 report documents opened without error |
| workflows | 45/45 |
| scoping | 6/6 invariants |
| ai_and_export | 10/10 |
| dual | 10/10 |
| import | 11/11 |
| views | 1,541 renders completed without error |
| v41 | 66/66 |
| v42 | 48/48 |
| v43 | 159/159 |
| v51 | 1,478/1,478 |
| v52 | 823/823 |
| v60 (new) | 65/65 — data quality and the visit-order learner |

The v4.1 sync assertions were updated, deliberately and in the open, where the v6 host-authoritative
policy replaces the earlier conflict-screen design: a dirty device now `patch`es rather than raising a
conflict, and a device with no revision `adopt`s rather than merging blind. Session assertions moved from
285/300 to 870/900 seconds for the same reason.

## 5. What has **not** been verified

- A real second physical device on office Wi-Fi (the delta protocol is exercised in tests and against the
  local host, not across two machines with a real router).
- DHIS2, KHIS, FHIR, laboratory, pharmacy or SMS integration. These do **not** exist as working
  connections. The adapter boundary and the configuration fields exist so that a connection can be
  added; no claim of conformance or submission is made anywhere in the interface.
- A real tablet, Samsung Internet, DeX, or printing.
- Password-reveal voting with four real office holders present. The vote, the four-office rule and the
  audit entries are implemented; a live four-person ceremony is not something a test can assert.
- The weather provider end to end (the page states when it has no reading).

## 6. Known limits, by design

- National ID, CCC and TB numbers are indexed identifiers, never the primary key. Duplicate candidates are
  never merged automatically.
- A caregiver observation is stored as an observation; it is never promoted to a diagnosis by the system.
- Financial roles cannot see HIV/TB status or clinical notes; the data layer enforces it, not the menu.
- Indicators use a restricted, versioned formula evaluator — no arbitrary code, no treatment changes.
- Where a national report definition has not been verified against the current KHIS/MOH release, the
  interface says so and records the definition version used.
