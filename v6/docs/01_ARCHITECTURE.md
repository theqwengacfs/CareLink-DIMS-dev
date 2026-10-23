# 01 · Architecture

## 1. What was built

CareLink DIMS v4.0 is a single, self-contained application. It is one operating system with
twenty differentiated workspaces, not twenty applications and not one universal dashboard.

| Layer | Responsibility | Files |
|---|---|---|
| Configuration | Organisation, roles, capabilities, indicators, reference data | `src/data.js` |
| Security & data | Storage adapter, authentication, authorisation, scoped repository, workflow engine, audit chain | `src/core.js` |
| Reporting | Period maths, Patient-Days, Patient Figures, expenditure lifecycle, referral registry, Monday scheduler, archive | `src/reports.js` |
| Intelligence | Role-aware assistant with typed evidence and optional local Ollama adapter | `src/ai.js` |
| Components | Icons, KPI tiles, tables, charts, modals, toasts, navigation model | `src/ui.js` |
| Consoles | Patient & field, hospital & finance, media/people/fleet/assurance/system, leadership | `src/views_patients.js`, `src/views_ops.js`, `src/views_admin.js` |
| Import | Offline workbook wizard (CSV + engine JSON) | `src/import.js` |
| Shell | Routing, login, onboarding, session lock, global search, assistant dock, all actions | `src/app.js` |
| Offline engine | Multi-sheet XLSX analysis, mapping, duplicate detection, reconciliation | `tools/import_engine.py` |
| Build | Inlines CSS, JS and the logo into one HTML file | `build.py` |

`build.py` produces **`LOMAMO-CareLink-DIMS-v5.0.html`** - 1,001 KB, no dependencies, no network calls,
no installation. It runs from a USB stick, a shared drive or an offline laptop.

## 2. Why a single file

The deployment reality is field tablets and county-office desktops in Kisumu and Homa Bay, often
without reliable connectivity. A single file:

- cannot break because a CDN is unreachable;
- cannot silently fetch an updated script from the internet;
- can be copied to a tablet by cable and opened in any modern browser;
- can be audited as one artefact with a known checksum;
- behaves identically in an air-gapped room and on a connected laptop.

It is a deliberate deployment choice, not an architectural limitation. The source is split into
ten modules under `src/`; moving to a server deployment means serving those same modules and
replacing the storage adapter (see §6).

## 3. Data flow — the enforcement path

```
 user action
     │
     ▼
 contentFor(view)            UI guard — shows an access-denied panel where a capability is missing
     │
     ▼
 RBAC.can(user, cap, ctx)    capability + county + ministry area + assignment + department
     │
     ▼
 repo.*(user)                data layer — rows are filtered BEFORE they reach the interface
     │
     ├── permitted → rendered
     └── refused   → AUDIT.append('access.denied') → visible in Audit and System Health
```

**No view reads `DB.db` for patient or finance rows.** Screens call `repo.patientList`,
`repo.patient`, `repo.requests`, `repo.transactions`, `repo.budget`, `repo.employees`,
`repo.documents` or `repo.auditLog`. That is the structural guarantee that a user cannot see
another department's data by constructing a link, editing a URL or opening developer tools on a
rendered page: the rows were never sent.

Reference data (counties, departments, capability labels) is public configuration and is read
directly — it contains no personal information.

## 4. Storage

`Store` is an adapter with two backends:

1. **`localStorage`** — durable, per-browser profile. Used when the file is opened normally.
2. **In-memory fallback** — used when the browser blocks storage (for example the sandboxed
   in-app preview). The user is told plainly, and export/import of the database remains available.

The stored object is one JSON document with a schema version. `DB.meta.schema` is checked on load;
`DB.blank()` defines a new installation. Migrations are additive and versioned.

**Production target.** For multi-user concurrent access, replace the adapter with a server-backed
database (PostgreSQL, or SQLite in WAL mode for a small single-office deployment). The repository
functions map one-to-one onto parameterised queries; the RBAC predicate becomes a `WHERE` clause
built from the same scope object. **Do not** place a database file on a cloud-synchronised folder
(Google Drive, OneDrive, Dropbox) and treat it as a multi-user database — that corrupts SQLite and
provides no access control.

## 5. Boot sequence

1. `DB.load()` — parse stored state or create a blank installation.
2. If there are no users → **first-run onboarding** (create Chief System Administrator, confirm
   organisational structure). Nothing is auto-created and no password is ever displayed.
3. If there is no session → **login** with demonstration accounts listed for evaluation.
4. If the session is idle beyond the configured limit → **lock screen** requiring the password.
5. Authenticated → **shell**: sidebar from `navModel(user)`, content from `contentFor(view)`.
6. `REPORTS.mondayTick()` runs at start-up and every 60 seconds; it generates the Monday 08:00
   report set once the local clock passes the scheduled time and a run has not yet been recorded.

## 6. Extension points

| Need | Where | No rewrite required |
|---|---|---|
| New county office | `COUNTIES` / Organisation Configuration | Yes — areas, classification, users |
| New ministry area | Organisation Configuration → Add area | Yes |
| New department | `DEPARTMENTS` | Yes — workspace identity and partitioning |
| New role | Clone a role template, set capabilities and scope | Yes |
| New capability | Add to `CAPS`, grant to templates | Yes |
| New workflow state | `WORKFLOW[kind].transitions` | Yes — transitions are data |
| New report | `REPORTS` function + `buildReportDoc` branch | Yes |
| New console | Add a view function and a nav entry | Yes |
| Medical Case Manager console rewrite | It is one view module; replace it without touching core | Yes |

The Medical Case Manager prototype was treated as replaceable. Its **functions** (patient review,
PDCA review, hospital request decisions, referral registry) are implemented as services with
capability checks; its **screens** are one module among many and can be rebuilt independently.

## 7. Device targets

- **Desktop** 1366×768 and above: sidebar, wide tables, multi-column dashboards.
- **Tablet** Samsung Galaxy A11+ 5G (720×1560 CSS px, Chrome): sidebar becomes a drawer; touch
  targets are ≥ 44 px; tables scroll horizontally inside their own container; forms are single-column
  at ≤ 900 px; the assistant dock occupies the lower-right and can be dismissed.
- **Print** A4: the report document has a dedicated print stylesheet; navigation, sidebars and
  controls are removed and the report renders full-width with headers and footers.

Test on the actual tablet before field deployment. The layout rules above are designed for it, but
browser font metrics and the on-screen keyboard must be verified on the device.

## 8. Performance

The bundled demonstration dataset (46 patients, ~250 visits, 30 users, full audit history) renders
any console in well under a second. The register is paginated at 120 rows for display. The audit
trail is capped at 6,000 entries in the browser prototype to keep the document small; the
production server database keeps the full, immutable history.

## 9. What is deliberately absent

- **No external AI call.** The assistant is rule-based over scoped data; the optional Ollama
  adapter only talks to a configured local endpoint. There is no cloud LLM key anywhere in the code.
- **No fabricated production records.** Every patient, staff member, transaction and vehicle in the
  demonstration set is prefixed `DEMO` and the dataset is labelled synthetic.
- **No silent privilege.** There is no "super admin can see everything" switch. The Chief System
  Administrator does not hold clinical authority by default.
