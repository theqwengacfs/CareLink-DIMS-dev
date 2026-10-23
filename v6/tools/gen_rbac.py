#!/usr/bin/env python3
"""Generate docs/02_RBAC_MATRIX.md from the authoritative JS definitions."""
import json, pathlib, re, subprocess, textwrap

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

# Use node to evaluate the definitions so the document cannot drift from code.
JS = r"""
const fs=require('fs'),vm=require('vm');
const ctx={console,Math,JSON,Date,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
 document:{addEventListener(){},querySelector:()=>null,createElement:()=>({style:{},classList:{add(){},remove(){}},appendChild(){},addEventListener(){}})},
 window:{addEventListener(){}},setTimeout,clearTimeout,setInterval:()=>0,Blob:class{constructor(a){this.size=0}},
 /* The definition modules register their actions at load time; the generator
    only needs the data, so the registries are stubbed. */
 ACTIONS:{},FORMS:{}};
ctx.globalThis=ctx; vm.createContext(ctx);
/* Every module that defines capabilities, roles, departments or authority
   rules, in load order, so the document cannot drift from the code. */
for(const f of ['data.js','data6.js','core.js','access_rules.js','org_teams.js','costing.js','tb_dispensing.js','master_registry.js'])
  vm.runInContext(fs.readFileSync('src/'+f,'utf8'),ctx,{filename:f});
console.log(vm.runInContext('JSON.stringify({' +
  'caps: Object.fromEntries(Object.entries(CAPS).map(([k,v])=>[k,v])),' +
  'roles: ROLES.map(r=>({id:r.id,name:r.name,dept:r.dept,scope:r.scope,perms:r.perms})),' +
  'expanded: Object.fromEntries(ROLES.map(r=>[r.id,RBAC.expandedPerms(r.id)])),' +
  'depts: DEPARTMENTS,' +
  'domains: ACCESS_DOMAINS, levels: AUTHORITY_LEVELS, capDept: CAP_DEPT, capLevel: CAP_LEVEL,' +
  'nationalRoles: NATIONAL_ROLES, targetLevels: Object.fromEntries(ROLES.map(r=>[r.id, ACCESS.targetLevels({id:"p",username:"p",roleId:r.id,status:"active",countyId:"kisumu",areaIds:["nyalenda"],departmentId:r.dept})]))})', ctx));
"""
raw = subprocess.run(["node", "-e", JS], cwd=ROOT, capture_output=True, text=True, check=True).stdout
D = json.loads(raw)
caps, roles, expanded, depts = D["caps"], D["roles"], D["expanded"], D["depts"]
domains, levels = D.get("domains", []), D.get("levels", [])
cap_dept, cap_level = D.get("capDept", {}), D.get("capLevel", {})
target_levels = D.get("targetLevels", {})
dept_name = {d["id"]: d["name"] for d in depts}

groups = []
for c in caps.values():
    if c["g"] not in groups:
        groups.append(c["g"])

L = []
A = L.append
A("# 02 · Role-Based Access Control Matrix\n")
A("> Generated from `src/data.js`, `src/data6.js`, `src/core.js`, `src/access_rules.js`, "
  "`src/org_teams.js`, `src/costing.js`, `src/tb_dispensing.js` and `src/master_registry.js` "
  "by `tools/gen_rbac.py`. Do not edit by hand — regenerate after changing role templates "
  "or authority rules.\n")
A("## 1. The eight authorities\n")
A("Access is never a single flag. Every decision combines:\n")
A("| Authority | Question it answers | Enforced by |")
A("|---|---|---|")
A("| Organisational | What may this position oversee or approve? | `role.scope.geo` |")
A("| Departmental | Which department's records may be used? | `role.scope.records = 'department'` |")
A("| Geographic | Which county and ministry areas? | `role.scope.geo`, `countyId`, `areaIds` |")
A("| Clinical | Which patient-care functions and clinical fields? | `patient.view.clinical`, clinical caps |")
A("| Financial | Which budgets, payments and approvals? | `finance.*` |")
A("| Administrative | Which accounts, roles and settings? | `user.*`, `role.manage`, `system.config` |")
A("| Audit | Which records may be inspected and reported? | `audit.view`, `system.audit` (read-only) |")
A("| Information governance | What may be collected, disclosed or published? | `media.*`, governance rules g1–g8 |")
A("| Workflow | Which requests may be initiated, reviewed, approved, closed? | transition capabilities |")
A("")
A("## 2. Enforcement path\n")
A("```")
A("UI request")
A("   → contentFor() guard               (usability: shows an access-denied panel)")
A("   → RBAC.can(user, capability, ctx)  (authorisation: capability + county + area + assignment + department)")
A("   → repo.*()                         (data layer: rows filtered before they are returned)")
A("   → AUDIT.append(access.denied)      (evidence: every refusal is recorded)")
A("```")
A("The interface never receives a row the user is not entitled to see. Hiding a navigation item is a "
  "convenience, not the control.\n")
A("## 3. Role summary\n")
A("| Role | Department | Geographic scope | Record scope | Capabilities |")
A("|---|---|---|---|---:|")
for r in roles:
    sc = r["scope"]
    geo = {"global": "Organisation", "county": "Own county", "areas": "Assigned areas"}.get(sc.get("geo"), sc.get("geo"))
    rec = sc.get("records")
    extra = " · read-only" if sc.get("readOnly") else ""
    A(f"| **{r['name']}** | {dept_name.get(r['dept'], r['dept'])} | {geo} | {rec}{extra} | {len(expanded[r['id']])} |")
A("")
A("## 4. Coverage by capability group\n")
hdr = "| Role | " + " | ".join(groups) + " |"
A(hdr)
A("|---|" + "---:|" * len(groups))
for r in roles:
    cells = []
    for g in groups:
        total = [k for k, v in caps.items() if v["g"] == g]
        held = [k for k in total if k in expanded[r["id"]]]
        cells.append(f"{len(held)}/{len(total)}" if held else "—")
    A(f"| {r['name']} | " + " | ".join(cells) + " |")
A("")
A("## 5. Capability register\n")
A("`Sensitive` capabilities are subject to mandatory governance rules that ordinary administration cannot waive. "
  "`Dual` capabilities require two independent approvals.\n")
A("| Capability | Group | Description | Flags | Roles holding it |")
A("|---|---|---|---|---|")
for k, v in caps.items():
    holders = [r["name"] for r in roles if k in expanded[r["id"]]]
    flags = []
    if v.get("sensitive"): flags.append("sensitive")
    if v.get("dual"): flags.append("dual approval")
    A(f"| `{k}` | {v['g']} | {v['l']} | {', '.join(flags) or '—'} | "
      + (", ".join(holders) if len(holders) <= 6 else f"{len(holders)} roles") + " |")
A("")
A("## 6. Negative controls (proven by the in-app security self-test)\n")
neg = [
 ("Kisumu Finance Officer reads Homa Bay transactions", "denied", "county scope"),
 ("Homa Bay Finance Officer reads Kisumu transactions", "denied", "county scope"),
 ("Nyalenda caregiver opens a Homa Bay patient", "denied", "county + area scope"),
 ("Nyalenda caregiver opens a patient in Ombeyi", "denied", "area scope"),
 ("Caregiver approves a hospital request", "denied", "no `hosp.request.review`"),
 ("Caregiver publishes patient media", "denied", "no `media.publish`"),
 ("Caregiver reads financial records", "denied", "no `finance.view`"),
 ("Caregiver exports patient data", "denied", "no `patient.export`"),
 ("Chief System Administrator reads clinical detail", "denied by default", "no `patient.view.clinical`"),
 ("Auditor edits a patient record", "denied", "read-only role"),
 ("Hospital Liaison approves their own assignment", "denied", "no review capability"),
 ("Single approval executes a restore or export", "denied", "dual approval required"),
 ("Nyalenda caregiver opens a Nyalenda patient", "permitted", "positive control"),
]
A("| Attempt | Result | Control |")
A("|---|---|---|")
for a, b, c in neg:
    A(f"| {a} | **{b}** | {c} |")
A("")
A("## 7. Separation of duties\n")
A("| Sensitive operation | Chief System Administrator | Media & Information Governance Head | Requirement |")
A("|---|---|---|---|")
A("| Database restore | requests | approves | two independent approvals; requester cannot self-approve |")
A("| Full database export | requests | approves | two independent approvals, always audited |")
A("| Publication of patient media | cannot approve | approves | consent + scope gate evaluated at publication |")
A("| Reading clinical detail | not held by default | not held | clinical roles only |")
A("| Editing the audit trail | impossible | impossible | append-only, hash-chained |")
A("| Disabling privacy rules | impossible | possible only through policy versioning | rules g1–g8 are non-overridable |")
A("")
A("## 8. Authority levels, domains and departments (v6.1)\n")
A("A capability says **what** an action is. It does not say **how far** it reaches. "
  "Since v6.1 every capability that writes targets, money, patient data, drugs or organisational "
  "information is bound to a level, a domain and a context. The binding is data "
  "(`AUTHORITY_LEVELS`, `ACCESS_DOMAINS`, `CAP_DEPT`, `CAP_LEVEL` in `src/access_rules.js`), "
  "so it can be read whole, printed as a matrix and audited. Enforcement happens in `RBAC.can`, "
  "the same single gate the data layer already used.\n")
A("### 8.1 Levels\n")
A("| Level | Rank | What it reaches |")
A("|---|---:|---|")
for lv in levels:
    reach = {"own": "the person's own records", "assigned": "records assigned to the person",
             "area": "the assigned ministry areas", "department": "the person's department",
             "county": "every ministry area of one county office",
             "national": "every county office"}.get(lv["id"], "")
    A(f"| `{lv['id']}` | {lv['rank']} | {lv['label']} — {reach} |")
A("")
A("### 8.2 Domains\n")
A("| Domain | Capabilities |")
A("|---|---|")
for d in domains:
    A(f"| {d['label']} | " + ", ".join(f"`{c}`" for c in d["caps"] if c in caps) + " |")
A("")
A("### 8.3 Capabilities bound to a level\n")
A("| Capability | Deepest level | Who may exercise it |")
A("|---|---|---|")
for k, lv in cap_level.items():
    if k not in caps:
        continue
    holders = [r["name"] for r in roles if k in expanded[r["id"]]]
    A(f"| `{k}` | **{lv}** | " + (", ".join(holders) if len(holders) <= 5 else f"{len(holders)} roles") + " |")
A("")
A("### 8.4 Capabilities bound to a department\n")
A("| Capability | Departments that own it |")
A("|---|---|")
for k, ds in cap_dept.items():
    if k not in caps:
        continue
    A(f"| `{k}` | " + ", ".join(dept_name.get(x, x) for x in ds) + " |")
A("")
A("### 8.5 Who may set a target or a baseline\n")
A("Measurement and target setting are separate duties. An M&E / Data Officer reads targets, reports "
  "against them and raises a data-quality exception; the office that owns the level sets it.\n")
A("| Role | Area | County | National |")
A("|---|:--:|:--:|:--:|")
for r in roles:
    tl = target_levels.get(r["id"], [])
    A(f"| {r['name']} | {'yes' if 'area' in tl else '—'} | {'yes' if 'county' in tl else '—'} | {'yes' if 'national' in tl else '—'} |")
A("")
A("### 8.6 The authority self-test\n")
A("`ACCESS.selfTest()` proves these rules at run time. They also run inside "
  "*Assurance → Access & authority audit* and in `v6/test/v61.js`.\n")
A("| Rule | Expected |")
A("|---|---|")
for rule, exp in [
    ("M&E / Data Officer sets a county target", "refused"),
    ("M&E / Data Officer sets a national target", "refused"),
    ("M&E / Data Officer reads targets in scope", "permitted"),
    ("County Office Administrator sets a county target", "permitted"),
    ("County Office Administrator sets a national target", "refused"),
    ("Director sets a national target", "permitted"),
    ("Caregiver opens the finance ledger", "refused"),
    ("Caregiver sees the cost of the patients they serve", "permitted"),
    ("Caregiver reads the raw cost ledger", "refused"),
    ("Finance sets a national cost standard", "refused"),
    ("Coordinator proposes an area target for another area", "refused"),
    ("Chief System Administrator reads clinical detail", "refused"),
    ("Chief System Administrator sets a programme target", "refused"),
]:
    A(f"| {rule} | **{exp}** |")
A("")
A("## 9. Changing permissions\n")
A("1. Chief System Administrator opens **Roles & permissions** and selects a template.")
A("2. Capabilities are added or removed; scope is set (organisation / county / areas; record scope).")
A("3. The change is written to the audit trail with the acting account and timestamp.")
A("4. The Security self-test is re-run; a failure blocks promotion to production.")
A("")
A("Where a responsibility is not documented in the organogram or job descriptions, the role is marked "
  "**PROPOSED** in the decisions register (doc 08) and requires leadership confirmation.\n")

(ROOT / "docs").mkdir(exist_ok=True)
(ROOT / "docs" / "02_RBAC_MATRIX.md").write_text("\n".join(L), encoding="utf-8")
print(f"Wrote docs/02_RBAC_MATRIX.md — {len(L)} lines, {len(roles)} roles, {len(caps)} capabilities")
