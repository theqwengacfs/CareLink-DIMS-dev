# 07 · Security and information governance

## 1. The problem being corrected

In v3.3.2, a user who knew a URL could reach a console belonging to another department, and county
offices could see each other's records. Hiding menu items did not prevent this, because the data was
already being sent to the browser.

v4.0 changes the direction of the control:

| v3.3.2 | v4.0 |
|---|---|
| Navigation filtered in the interface | Capability checked **and** rows filtered before the interface sees them |
| One "admin" account with broad reach | Twenty role templates with explicit scope; the Chief Administrator has **no clinical authority by default** |
| County separation by page | County and ministry-area separation in the data layer |
| Audit written only for successful actions | Audit records refusals as well as successes |
| Governance by instruction | Governance by rule engine (rules g1–g8) |

---

## 2. Mandatory governance rules

These are enforced in code. No account — including the Chief System Administrator — can switch them
off through ordinary administration.

| Rule | Statement |
|---|---|
| **g1** | Passwords are stored only as salted one-way hashes and are never displayed to any account. |
| **g2** | The audit trail is append-only and hash-chained. No role may edit or delete an entry. |
| **g3** | A patient photograph or story cannot be published without a recorded, scoped consent that has not been withdrawn. |
| **g4** | Full-database export and database restoration require dual approval and are always audited. |
| **g5** | Clinical records require a clinical-authorised role. Administrative seniority does not confer it. |
| **g6** | Cross-county and cross-ministry-area access is denied by default at the data layer. |
| **g7** | Sensitive patient data is never transmitted to an external AI service unless an explicit, documented authorisation is in force. |
| **g8** | Public and donor-facing reports are generated redacted — no names, phone numbers, CCC numbers, IDs or unapproved photographs. |

The Media & Information Governance function owns the *policy*. The rule engine enforces it against
every account. Neither can silently override the other.

---

## 3. Authentication and session

| Control | Implementation |
|---|---|
| Password storage | Salted, iterated hash (`strongHash`); plaintext is never stored, logged or displayed |
| Password policy | Minimum length configurable (default 12); enforced on change |
| Lockout | Configurable failed-attempt threshold (default 5) → account locked, event audited |
| Session lock | Idle timeout (default 20 minutes) → password required to resume |
| First sign-in | Accounts created through approval receive a one-time activation code and `mustChange` |
| Onboarding | A newly approved account's code is displayed **once** on a printable sheet |
| Sign-out | Clears the session and writes an audit entry |

**Prototype limitation, stated plainly.** The browser build uses an iterated FNV-1a hash for
demonstration. A production server deployment must use Argon2id (or bcrypt with a work factor ≥ 12),
TLS 1.2+, HttpOnly/SameSite cookies, and server-side session store. The UI and the RBAC model do not
change; only the adapter changes.

---

## 4. Audit trail

Every entry records: sequence, timestamp, actor, action, entity, entity identifier, human-readable
detail, before/after state, reason, and device/session metadata where available.

```
hash(n) = fnv1a( seq | ts | actor | action | entity | entityId | detail | prevHash )
```

`AUDIT.verify()` recomputes the whole chain and reports any break by sequence number. The Audit
console and System Health display the result; the Security self-test confirms it.

Actions recorded include: sign-in and sign-out, failed sign-in, account locked, access denied,
account created / status changed, permission and role changes, patient assessment, verification,
enrolment, discharge, visit recorded, PDCA update, hospital request and every decision on it,
expense recorded, transaction reconciled, budget versioned, target versioned, consent changed,
document uploaded, media published or declined, report generated and exported, import committed,
backup created and downloaded, approval requested and granted, settings changed, security self-test
run.

**Refusals matter as much as successes.** A cluster of `access.denied` events from one account is an
early indicator of misconfiguration or of an attempted breach.

---

## 5. Dual control

| Operation | Why | Control |
|---|---|---|
| Full database export | Whole-of-organisation data leaving the system | Requester + two independent approvals |
| Database restore | Destruction of newer records | Requester + two independent approvals; pre-restore state preserved |
| Patient data export | Confidential dataset | Capability `patient.export` (scoped) + approval |
| Publication of patient media | Irreversible disclosure | Consent gate + governance approval |

The requester cannot approve their own request, and one approver cannot sign twice.

---

## 6. Consent and publication

Consent is a record, not a checkbox on a form:

- **Status:** granted · pending · withdrawn · not requested
- **Scope:** internal use · storytelling · donor reporting
- **Date and note**, with every change audited

`GOV.canPublish()` evaluates the live record at the moment of publication. An internal-use consent
cannot authorise a success story. A withdrawal immediately demotes any previously approved asset.
Restricted clinical images cannot be published at all.

Public and donor-facing reports are generated with identifiers removed. The report creator selects a
purpose; the selection cannot override the redaction rules.

---

## 7. AI governance

| Principle | Implementation |
|---|---|
| Least disclosure | The assistant reads through the same scoped repository as the screens |
| Evidence typing | Every statement labelled: recorded fact · calculated value · observed trend · AI interpretation · recommendation · draft |
| No invention | Where evidence is absent the assistant replies "Insufficient verified data to determine this." |
| No diagnosis | Clinical interpretation is explicitly out of scope; it summarises, it does not conclude |
| Local by default | The adapter targets Ollama on the configured local endpoint; external providers are not offered in Settings |
| Human in the loop | AI output is never written to the record automatically; a person must act |
| Traceability | Answers cite the registers consulted |

---

## 8. Threat model and mitigations

| Threat | Mitigation |
|---|---|
| Curious staff member opens another department's screen | Capability check + scoped repository + audited denial |
| Staff member edits a URL to view another county's patient | Row is never returned; denial logged |
| Shared tablet left unattended | Idle lock; sign-out; per-user accounts (never shared logins) |
| Malicious export of the patient register | Export capability scoped by county; approval for the whole database; every export audited |
| Loss or theft of a laptop | Backups encrypted; database file permissions restricted; device encryption required |
| Ransomware / accidental deletion | Versioned backups with verification; restoration requires dual approval |
| Silent alteration of history | Hash chain makes tampering evident |
| Publication of a patient's photograph without consent | Rule g3 blocks publication at the engine |
| Cloud AI leaking patient data | No external AI is configured; import and assistant operate locally |
| Duplicate patient records inflating caseload | Duplicate detection at assessment, import and data-quality review |

---

## 9. Production hardening checklist

- [ ] Replace the storage adapter with a server database (PostgreSQL or SQLite WAL).
- [ ] Argon2id password hashing; remove the prototype hash.
- [ ] TLS 1.2+ with HSTS; secure cookie flags; CSRF tokens on state-changing requests.
- [ ] Server-side session store with sliding expiry and revocation.
- [ ] Rate limiting on authentication; alerting on repeated denials.
- [ ] Encryption at rest for the database and the document store.
- [ ] Signed, encrypted, off-device backups with restore drills.
- [ ] Parameterised queries everywhere; no string-concatenated SQL.
- [ ] Dependency pinning and an update procedure.
- [ ] Retention job implementing the adopted retention schedule.
- [ ] Annual access review: every account, every capability, in writing.
- [ ] Incident response and breach notification procedure.
- [ ] Data-protection impact assessment under the Kenya Data Protection Act, 2019.

Items on this list are honestly incomplete in the prototype. They are the difference between a
faithful operating model and a production system, and they must not be skipped because the
demonstration looks finished.
