# Staff Leave & Field Schedule Manager
### Specification, Technical Handover and Integration Guide
**Prepared for:** LOMAMO DDMS – Human Resource Manager console
**Project folder:** `/home/user/staff-manager`
**Document status:** Working draft v1.0 (for improvement and integration)

---

## 1. Purpose

The Staff Leave & Field Schedule Manager lets administrators record and approve staff leave and off-day requests while making sure every ministry and field location stays covered. It is designed for:

- **15 permanent staff**
- **3 casual workers** (used for coverage only)
- **2 administrators** who work from different laptops and must see the same data in real time

The core principle: **no leave or off-day is approved if it leaves a field or ministry location uncovered, or breaks the Monday office rule.**

---

## 2. Operating Rules (must be preserved exactly)

| # | Rule | Source |
|---|------|--------|
| R1 | **Monday: everyone is at the office.** | Original requirements |
| R2 | **Exception to R1:** Wickliff may leave on Mondays. | Original requirements |
| R3 | Each staff member is entitled to **one office day**. | Original requirements (see open question Q2) |
| R4 | Casual workers are used to cover field and ministry locations. | Original requirements |
| R5 | Leave/off-day requests must not leave any field or ministry location without coverage. | Original requirements |

### 2.1 Weekly Field Schedule (baseline)

| Day | Staff | Assignment |
|-----|-------|-----------|
| **Monday** | All staff | Office (except Wickliff, who may leave) |
| **Tuesday** | Daniel + 1 casual worker | Nyalenda field location (official duty) |
| **Tuesday** | Allan/John & Evans | Ombeyi field location (official duty) |
| **Tuesday** | Ashar & Cathy | Nairobi Road field location (official duty) |
| **Wednesday** | Daniel + 1 casual worker | Nyalenda field location |
| **Wednesday** | Allan/John & Ashar | Nyahera field location |
| **Wednesday** | Washington + 1 casual worker | Manyatta field location |
| **Thursday** | Cathy & Ashar | Nairobi Road field location |
| **Thursday** | Washington + 1 casual worker | Manyatta field location |
| **Thursday** | Allan/John & Evans | Ahero field location |
| **Friday** | Allan/John & Wickliff | Chiga field location |
| **Friday** | Washington (and a casual worker, sometimes) | Hospital Ministry (covering for Wickliff) |
| **Wickliff (Mon–Fri)** | Wickliff | Operates the **Hospital Ministry** locations; Monday exception per R2 |

> Spelling note: the original brief uses "Cathey" and "Wicliff" once each. The app uses **Cathy** and **Wickliff**. Confirm before final rollout.

### 2.2 Staff Roster (as seeded)

| ID | Name | Group | Type | Notes |
|----|------|-------|------|-------|
| 1 | Daniel | Caregiver | Permanent | Tuesday/Wednesday field with casual worker |
| 2 | Allan/John | Caregiver | Permanent | |
| 3 | Evans | Caregiver | Permanent | |
| 4 | Ashar | Caregiver | Permanent | |
| 5 | Cathy | Caregiver | Permanent | |
| 6 | Washington | Caregiver | Permanent | Manyatta; Hospital Ministry cover on Friday |
| 7 | Wickliff | Hospital Ministry | Permanent | **May leave on Mondays** |
| 8–15 | Staff 8 – Staff 15 | Office Staff | Permanent | **Placeholder names – replace with real names** |
| 16–18 | Casual Worker 1–3 | Casual | Casual | Coverage only |

---

## 3. Business Rules the System Must Enforce

These are the validation rules the leave-approval logic must apply. Items marked **[Partially implemented]** or **[Not implemented]** should be checked against the current code before release (see Section 8).

| Rule ID | Rule | Status |
|---------|------|--------|
| BR-01 | Leave on a **Monday** is rejected for everyone except Wickliff. | [Verify] |
| BR-02 | A request is rejected if the staff member's **assigned field/ministry location** on that day has no remaining cover after the leave. | [Not implemented] |
| BR-03 | Cover can come from **another permanent staff member** or a **casual worker**. A casual worker cannot be double-booked on two locations on the same day. | [Not implemented] |
| BR-04 | Friday cover: when Wickliff is at Chiga, **Hospital Ministry must be covered** (Washington, or a casual worker). | [Not implemented] |
| BR-05 | Each staff member receives **one office day** (see Q2 for definition). | [Verify] |
| BR-06 | Overlapping approved leave for the same person on the same date is rejected. | [Verify] |
| BR-07 | Leave requests carry a status: `pending`, `approved`, `rejected`. Only approved leave affects coverage. | [Partially implemented] |
| BR-08 | Every status change records who changed it and when (audit trail). | [Not implemented] |

### 3.1 Coverage Logic (pseudo-code)

```
function canApproveLeave(staffId, date):
    if weekday(date) == MONDAY and staffId != WICKLIFF: return REJECT ("Monday office rule")
    if hasOverlappingApprovedLeave(staffId, date):      return REJECT ("Already on leave")
    location = scheduledLocation(staffId, weekday(date))
    if location is None:                                 return APPROVE   // office / no field duty
    candidates = permanentStaffNotOnLeaveAndNotAssigned(date)
              + casualWorkersNotAssigned(date)
    if no candidate can cover location:                 return REJECT ("Location uncovered")
    assign best candidate → write coverage record
    return APPROVE
```

---

## 4. Data Model

| Table | Key fields | Notes |
|-------|-----------|-------|
| `staff` | `id`, `name`, `group`, `type` (`permanent`/`casual`), `canLeaveMonday` (bool) | `canLeaveMonday` = true only for Wickliff |
| `leave` | `id`, `staffId`, `startDate`, `endDate`, `reason`, `status`, `createdAt`, `decidedBy`, `decidedAt` | Status: pending/approved/rejected |
| `coverage` | `id`, `date`, `location`, `coveredBy` (staff or casual ID), `forStaffId`, `leaveId` | One row per covered location per day |

**Recommended additions:**
- `locations` table (name, day, required headcount) – avoids hard-coding places in the UI
- `schedule` table (staffId, weekday, locationId) – the weekly baseline in Section 2.1
- `users` table (admins) and `audit_log` table (see Section 7)

---

## 5. API Reference (current)

Base URL: `http://<host>:3000`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/staff` | List staff |
| POST | `/api/staff` | Add staff |
| PUT | `/api/staff/:id` | Update staff |
| DELETE | `/api/staff/:id` | Delete staff |
| GET | `/api/leave` | List leave requests |
| POST | `/api/leave` | Submit leave request |
| PUT | `/api/leave/:id/status` | Approve / reject |
| DELETE | `/api/leave/:id` | Delete request |
| GET | `/api/coverage` | List coverage assignments |
| POST | `/api/coverage` | Add coverage assignment |
| DELETE | `/api/coverage/:id` | Remove coverage assignment |

**Recommended:** version the API (`/api/v1/...`), validate payloads server-side, and return `409 Conflict` for rule violations (BR-01 to BR-06) with a human-readable reason.

### 5.1 Real-time Events (Socket.IO)

| Event | Payload | Sent when |
|-------|---------|-----------|
| `staff:created` / `staff:updated` / `staff:deleted` | staff object or `{id}` | Staff change |
| `leave:created` / `leave:updated` / `leave:deleted` | leave object or `{id}` | Leave change |
| `coverage:created` / `coverage:deleted` | coverage object or `{id}` | Coverage change |

---

## 6. Current Architecture & Status

```
Browser (Admin 1) ─┐                         ┌─ SQLite-compatible file (sql.js)
                   ├── HTTPS / Socket.IO ──► Node.js + Express server (server.js)
Browser (Admin 2) ─┘                         └─ public/index.html (UI)
```

| Component | Technology | File |
|-----------|-----------|------|
| Server | Node.js, Express, Socket.IO | `server.js` |
| Database | sql.js (pure JavaScript SQLite, file-based) | `data/staffmanager.db` (git-ignored) |
| Frontend | HTML/CSS/JS, `fetch` + `socket.io` client | `public/index.html` |
| Legacy prototype | Single-file, browser `localStorage` (no sync) | `index.html` |
| Dependencies | express ^4.18.0, socket.io ^4.7.0, sql.js ^1.10.0 | `package.json` |

**Working:** server starts; database auto-creates and seeds 18 staff; all API routes defined; real-time events broadcast; sync indicator in UI.

**Why not `localStorage`:** it is private to each browser on each device, so two laptops would never see the same data.

---

## 7. Known Issues & Required Fixes

| # | Priority | Issue | Fix |
|---|----------|-------|-----|
| 1 | **High** | **No authentication.** Anyone with the URL can read or change data. | Add admin login (username/password with hashed passwords, or SSO from the DDMS). Use HTTPS only. |
| 2 | **High** | **Coverage rules (BR-02 to BR-04) not enforced.** Leave can be approved without cover. | Implement `canApproveLeave()` on the server (Section 3.1). |
| 3 | **High** | **Data persistence on hosted free tiers** (e.g. Render free) may be lost on restart. | Use a persistent disk, or move to PostgreSQL (Neon, Supabase, or the DDMS database). |
| 4 | **Medium** | **Possible duplicate entries** on the admin who made the change, because the server broadcasts to all clients including the sender. Not yet tested in a browser. | Either de-duplicate by `id` in the client, or emit with `socket.broadcast` and send the originating socket ID. |
| 5 | **Medium** | **"Admins online" count** is calculated on the client and is not accurate. | Server counts connected sockets and broadcasts `admins:count`. |
| 6 | **Medium** | **Concurrent edits**: two admins approving the same request at the same time. | Add a `version` column; reject updates with stale versions (`409`). |
| 7 | Medium | **Full database file rewritten on every change** (`db.export()`). Fine for this size, but not scalable. | Acceptable for ~20 users; move to PostgreSQL if usage grows. |
| 8 | Low | No backup/export. | Add scheduled backup and CSV/PDF export of weekly schedule. |
| 9 | Low | Spelling variants (Cathey/Cathy, Wicliff/Wickliff). | Confirm final names. |
| 10 | Low | Placeholder names "Staff 8–15". | Replace with real staff names and roles. |

---

## 8. Test Checklist (before go-live)

**Rule tests**
- [ ] Non-Wickliff staff cannot take leave on a Monday.
- [ ] Wickliff can take leave on a Monday.
- [ ] Leave for Daniel on Tuesday is rejected if no cover exists for Nyalenda.
- [ ] Leave for Allan/John on Friday with Wickliff away: Hospital Ministry cover is required.
- [ ] A casual worker cannot be assigned to two locations on one day.
- [ ] Overlapping leave for one person is rejected.
- [ ] Office-day entitlement is respected (see Q2).

**Sync tests**
- [ ] Admin A creates a request → appears on Admin B's screen within 2 seconds, once only.
- [ ] Admin A approves → Admin B sees the status change.
- [ ] Refresh browser → data persists.
- [ ] Server restart → data persists (tests persistence fix).
- [ ] Two admins edit the same request at once → one gets a conflict message.

**Security tests**
- [ ] Unauthenticated API call returns `401`.
- [ ] Audit log records approver name and time.
- [ ] Site served over HTTPS.

---

## 9. Integration into the LOMAMO DDMS HR Console

Choose one of the following options. The DDMS technical stack was not provided, so the options are written generically.

### Option A – Embed as a module (fastest)
- Run this app as its own service.
- In the HR console, add a menu item "Leave & Field Schedule" that opens the app in an `<iframe>` or new tab.
- Requires SSO or a shared login so admins are not asked twice.
- **Effort:** low. **Data stays separate** from the DDMS database.

### Option B – Port into the DDMS (recommended long term)
- Move the `staff`, `leave` and `coverage` tables into the DDMS database.
- Expose the API routes from Section 5 under the DDMS backend's existing authentication and role system.
- Re-use the frontend views (Dashboard, Weekly Schedule, Leave Requests, Coverage Manager, Staff Directory) as HR console pages.
- **Effort:** medium. **Single source of truth** for staff records.

### Option C – Shared API
- Keep this service as the leave/coverage engine.
- The DDMS HR console calls its API for leave data and shows results in its own pages.
- **Effort:** medium. Good if other DDMS modules need coverage data.

### Staff record linkage
Whichever option is chosen, link `staff.id` to the DDMS employee ID (add `ddmsEmployeeId` column). Do not keep two separate staff lists.

### Roles to define in the HR console

| Role | Permissions |
|------|-------------|
| HR Admin (×2) | Full access: approve/reject, edit schedule, manage staff |
| Staff (view) | View own leave and schedule (optional, future) |
| Auditor | Read-only access to audit log |

---

## 10. Deployment

| Platform | Steps | Persistence note |
|----------|-------|------------------|
| Render.com | Build `npm install`, start `npm start` | Attach a persistent disk to `data/` |
| Railway.app | Deploy repo, add a volume for `data/` | Use volume |
| Fly.io | `fly launch`, `fly deploy` | Use a Fly volume |
| Office network | Run `npm start` on one laptop; others open `http://<laptop-IP>:3000` | Laptop must stay on; not suitable for remote access |

**Environment variables to add:**
- `PORT` – server port (default 3000)
- `ADMIN_SESSION_SECRET` – (to be added) session signing key
- `DATABASE_URL` – (if moved to PostgreSQL)

**Never commit** `data/` or `*.db` files – they contain staff data.

---

## 11. Development Roadmap

**Phase 1 – Make it safe (before real use)**
1. Add admin login and HTTPS.
2. Implement coverage and Monday rules on the server (BR-01 to BR-06).
3. Move to persistent database storage.
4. Fix duplicate real-time entries and admin count.

**Phase 2 – Make it complete**
5. Audit log and conflict handling.
6. Locations and schedule tables (editable by admins, no code changes).
7. Weekly schedule export (PDF/Excel) and monthly leave report.
8. Notifications (email/SMS/WhatsApp) when a request is decided.

**Phase 3 – Integrate**
9. Connect to DDMS employee records and SSO.
10. Role-based access for HR console.
11. Automated tests (unit tests for the rules, end-to-end sync test).

---

## 12. Open Questions for the Client

| ID | Question | Why it matters |
|----|----------|----------------|
| Q1 | What is the DDMS technology stack (language, framework, database, login method)? | Chooses integration option A, B or C |
| Q2 | Does "one office day" mean one **per week**, one **per month**, or one per staff member in total? | Needed for rule BR-05 |
| Q3 | Is Wickliff's Monday exception for every Monday, or only some Mondays? | Affects rule BR-01 |
| Q4 | Can casual workers cover **more than one** location on the same day? | Affects BR-03 |
| Q5 | Which location is the "primary" cover when two staff are needed (e.g. Hospital Ministry on Friday)? | Affects coverage logic |
| Q6 | What are the real names for Staff 8–15 and casual workers 1–3? | Data entry |
| Q7 | Must the system work offline (poor network at field locations)? | Changes architecture |
| Q8 | Who hosts the system (DDMS server, cloud, or office laptop)? | Deployment and data-protection requirements |
| Q9 | Is leave approval done by one admin, or do both admins need to agree? | Workflow design |
| Q10 | Are staff personal details (leave reasons, medical notes) stored? | Data protection and retention policy |

---

## 13. Data Protection Notes

- Leave reasons may contain medical or family information. Restrict visibility to HR admins.
- Keep an audit trail of who approved or changed each request.
- Define a retention period for old leave records.
- Use HTTPS, strong passwords, and regular backups.
- Do not store the database inside a public web folder.

---

## 14. Glossary

| Term | Meaning |
|------|---------|
| Field location | A site outside the office where staff carry out official duty (e.g. Nyalenda, Ombeyi, Nyahera, Manyatta, Ahero, Chiga, Nairobi Road) |
| Hospital Ministry | Ministry location operated by Wickliff, covered by others when he is away |
| Cover | A permanent staff member or casual worker assigned to a location in place of someone on leave |
| Casual worker | Non-permanent worker used for coverage only |
| Official duty | Scheduled field work |
| DDMS | The LOMAMO data/management system into which the HR console belongs |

---

## Appendix A – Quick Start (for developers)

```bash
cd /home/user/staff-manager
npm install
npm start           # http://localhost:3000
```

Two admins on the same network: open `http://<host-laptop-IP>:3000` on each laptop.

## Appendix B – File Map

| Path | Purpose |
|------|---------|
| `server.js` | Express + Socket.IO + sql.js server, all API routes |
| `public/index.html` | Synced web interface (used by both admins) |
| `index.html` | Original offline prototype (localStorage, single device) |
| `package.json` | Dependencies and start script |
| `README.md` | Deployment steps |
| `.gitignore` | Excludes `node_modules/`, `data/`, `*.db` |
| `STAFF_LEAVE_MANAGER_SPEC.md` | This document |
