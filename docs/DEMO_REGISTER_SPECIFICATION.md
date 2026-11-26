# Runtime demonstration register specification

The board preview and reference service generate **4,000 synthetic patients**
and their related programme/departmental records. No dataset is committed or
included in the public application bundle. The generators are
`seedSyntheticDataset()` in `v6/src/data6.js`, `DB.seedSynthetic()` for isolated
browser evaluation, and `api/synthetic-reference.mjs` for authenticated runtime
reference downloads/imports. `seedOfficial()` remains the actual-roster helper;
synthetic generation replaces named staff with synthetic staff labels (retaining
unconfirmed seat labels). Real staff credential exports use the actual roster,
never these synthetic identities.

**Evaluation only. Never populate the existing live installation with this
register.** Hosted commissioning begins empty. Reference import/explicit
auto-feed is restricted to the Chief before global activation; no anonymous
provisioning endpoint or browser-local fallback loads staff data.

## Reproducibility and reserved identifiers

The default PRNG seed is `20261022`, anchored at
`2026-11-22T00:00:00.000Z`. All calendar arithmetic in the synthetic seeder uses
UTC. A different wall clock, random source or timezone must not change the
reference payload for the same seed and anchor. The generated manifest carries
SHA-256 digests of both the JSON payload and compressed transport.

Every array record, including nested object rows, carries `synthetic:true`.
Generated people use only these reserved bands:

| Field | Band |
|---|---|
| Patient phones | `07001xxxxx` (displayed `0700 1xxxxx`) |
| Staff account phones | `07003xxxxx` (displayed `0700 3xxxxx`) |
| Demo roster/employee phones | `07005xxxxx` (displayed `0700 5xxxxx`) |
| National IDs | eight digits starting with `9` (`9x,xxx,xxx`) |
| CCC | `CCC/9xxxxx` |
| Email | `@lomamo.example` only |

The payload excludes password hashes, salts and issued credential secrets.
Synthetic phone/ID bands are placeholders, not proof that a number is assigned
or contactable. Do not send messages or validate real people against demo data.

## What the register contains

| Property | Value | Source |
|---|---|---|
| Patients | **4,000** | `DEMO_REGISTER.patients`; server `REFERENCE_PATIENT_COUNT` |
| Age range | **5–75**, every age present | seeded age draw |
| Sex split | **2,000 girls / 2,000 boys** | alternating `sex` draw |
| County split | **Kisumu 2,000 / Homa Bay 2,000** | ten balanced ministry areas |
| Day 60–80 review window at anchor | **1,600 (exactly 40%)** | `DEMO_REGISTER.windowShare` |
| Other programme durations | day 81–240 core; day 241–330 extension tail | `PROGRAM_DAYS_PROFILE` |
| Contacts per patient | **at least 12** | `DEMO_REGISTER.minVisits` |
| Home-visit rhythm | **every 21 days** from enrolment to anchor | `visitIntervalDays` |
| Weight measurements | **at least 3**, no gap over 21 days | weight-date grid |
| Modules | every programme/departmental collection populated | `enrichV6Collections()` |
| Workflow QA | unique identifiers, complete profiles, related evidence and structured reviews/discharges | runtime `qualityReport()` and import validation |

Patients enrolled only 60–80 days before the anchor have three or four regular
three-weekly home visits. Additional clinical/hospital/homestay contacts bring
the longitudinal history to at least twelve without changing the home-visit or
weight grid. All such evidence is synthetic.

## Delivery, not a static dataset

The full JSON is roughly 81 MiB including related records; exact sizes and
chunk counts are measured in each runtime manifest, not hard-coded promises.
It is Brotli-compressed into bounded verified upload chunks below Vercel's
Function payload limit. Online state uses compressed/immutable KV storage and
scoped bounded client responses. Application source includes generator logic
and the existing media modules, not the generated record arrays.

- **Chief download:** `GET /api/admin/reference-master` through **System →
  Master data import → Full 4,000-patient reference master**. Requires an
  approved Chief session whose private password is set.
- **Optional local export:** `npm run build:reference-master` writes only under
  ignored `v6/data/`. It is not a production build input; never copy it to
  `public/` or commit it.
- **Removed:** `public/master/CareLink-Reference-Master-v6.6.json`. Any link or
  test depending on that static dataset must use the runtime service instead.

## Verification

`v6/test/v699-demo-register-spec.js` checks the clinical/programme specification
and runtime package. `v6/test/v6103-synthetic.mjs` checks determinism, nested
synthetic markers, exact contact/ID bands, staff de-identification and absence
of static datasets. `v6/test/reference-master-e2e.js` exercises digest/chunked
import, workflow completeness and a correctly scoped fresh tablet. Privacy
scanning additionally uses `v6/tools/verify_no_patient_data.py`; its authorized
workbook-dependent patient-identity sweep cannot be certified when that source
is unavailable.
