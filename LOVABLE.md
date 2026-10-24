# CareLink C-DIMS v6.6.0 — Dual Arena, Lovable.ai & Vercel Development Guide

This repository is engineered for seamless **two-way GitHub co-development** across
**Arena.ai**, **Lovable.ai**, **Vercel**, and **local VS Code / Office Wi-Fi hosting**.

## How the codebase works in every environment

1. **Modular source of truth (`v6/src/`)** — 61 JS modules + 6 CSS stylesheets, concatenated in a fixed
   order by the build. Nothing is bundled by a package manager: the modules are
   plain scripts that share one global scope, which is what lets the whole system
   ship as one offline HTML file (`4.2 MB`).

   | Area | Files |
   |---|---|
   | Configuration & reference data | `data.js`, `data6.js`, `inventory_data.js` |
   | Security, storage, workflow, audit | `core.js` |
   | Authority (levels, domains, departments) | `access_rules.js` |
   | Ministry teams, visit days, Monday rule | `org_teams.js` |
   | Cost per patient & budget-vs-expenditure | `costing.js`, `charts.js` |
   | TB dispensing control | `tb_dispensing.js` |
   | Anthropometry, Child Growth & MCM Clinical | `bmi_clinical6.js`, `discharge_hardcopy6.js` |
   | Monday workflows, Handover & Gov/MoH Hub | `monday_procurement6.js`, `handover_partners6.js` |
   | County Admin Ops, Dev Console & Global Activation | `admin_workflows6.js`, `dev_console6.js` |
   | AI Smart Workflow Engine & Universal Drafts | `workflow_engine6.js`, `ai.js` |
   | Master workbook mapping & analysis | `master_registry.js`, `master_analysis.js` |
   | Households, Waiting list & Urgent cases | `household.js`, `waiting_urgent.js` |
   | Public portal content | `portal_content.js` |
   | Device targeting & visual audit | `visual_audit.js`, `themes.js` |
   | Reporting | `reports.js`, `indicators6.js`, `insight6.js`, `exportdocs.js` |
   | Consoles | `views_*.js`, `hub6.js`, `workplace.js`, `recognition.js`, `care6_flows.js`, `pharmacy.js`, `leave.js`, `schedule.js`, `omaha.js`, `forms.js`, `import.js` |
   | Shell & actions | `app.js`, `ui.js`, `navpane.js`, `pager.js`, `entry6.js`, `office_actions.js`, `care_actions.js` |
   | Embedded photography | `media6.js` (teamwork), `media_portal.js` (public portal) |
   | Styles | `styles.css`, `console51.css`, `console6.css`, `portal6.css`, `audit6.css`, `carelink63.css` |

2. **Automatic zero-Python Vite sync (`tools/sync-lovable.mjs` + `vite.config.ts`)**:
   every `npm run dev` and `npm run build` compiles `v6/src/*` into both
   - `public/carelink-v6.html` — served live by Vite, by Lovable.ai and by GitHub Pages, and
   - `v6/LOMAMO-CareLink-DIMS-v6.0.html` — the single-file offline standalone bundle.

   During live editing, the `carelink-v6-live-sync` Vite plugin watches `v6/src/**`
   and hot-reloads the preview whenever any `.js` or `.css` file there is edited.

3. **React / TypeScript entry shell (`src/App.tsx`, `src/main.tsx`, `index.html`)**
   renders the full-viewport LOMAMO C-DIMS application for Lovable.ai cloud
   previews and static deployments.

4. **Photography** is packed by `v6/tools/pack_portal_media.py` (public portal) and
   `v6/tools/pack_media.py` (teamwork). Both write base64 into `v6/src/` so the
   offline file keeps working, and optimise the originals into `public/media/`.

## Guidance when prompting Lovable.ai or Arena.ai

- Edit the modular source files inside `v6/src/` (or the React wrapper in `src/`)
  rather than `public/carelink-v6.html`, because that file is regenerated from
  `v6/src/` on every build and reload.
- **Adding a module**: create it in `v6/src/`, then add its filename to `JS_ORDER`
  in `tools/sync-lovable.mjs` **and** to `v6/test/modules.js` (they must match, or
  the test suite will not see the module). A module that registers actions or forms
  (`Object.assign(ACTIONS, …)`) must be listed **after** `app.js`, because that is
  where `ACTIONS` and `FORMS` are defined.
- **Adding a console**: add a `case` in `contentFor()` (`v6/src/app.js`), a nav item
  in `navModel()` (`v6/src/ui.js`), a title in `viewCrumb()`, and — if it needs a
  new capability — register the capability in `CAPS` and grant it to at least one
  role, or `v6/test/lint.js` fails on an orphan capability.
- **Adding a capability that writes anything**: bind it in `access_rules.js`
  (`CAP_LEVEL` for how far it reaches, `CAP_DEPT` for which department owns it,
  `ACCESS_DOMAINS` for the subject matter). The binding is enforced inside
  `RBAC.can`, so views, forms, workflows and the data layer all meet the same test.
- **Run the suites before pushing**: `npm run test:all`, then `node v6/test/v61.js`.
  `v6/test/wiring.js` fails if any `data-act` or `data-form` a view emits has no
  handler; `v6/test/views.js` renders every view for every role.
- **Never commit patient data.** This repository is public and serves the live
  site. Structure, vocabulary, formulas and mappings belong here; patient
  identities belong on the office host, loaded through *System → Master data import*.
- Regenerate `v6/docs/02_RBAC_MATRIX.md` with `python3 v6/tools/gen_rbac.py` after
  changing roles, capabilities or authority rules.
