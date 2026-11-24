# Console interaction and viewport repair

## Fixed causes
- Cost tabs changed local state, but every render reapplied an older route parameter. A deep link to Ministry areas therefore undid clicks to other tabs. Route defaults now apply once per route entry. This pattern was also corrected in waiting/urgent lists, TB, households, administration, developer-console and interoperability views. Re-entering a deep link still applies its defaults; redraws no longer undo local selections.
- The cost table/chart route now synchronises shared chart mode so a previous view cannot keep the wrong display mode active.
- Desktop toolbar and content no longer share a scrolling grid track. The toolbar occupies its own row; the introduction, shortcuts and selected workspace scroll inside the remaining row. Navigation reveals the selected workspace anchor and preserves content scroll during background redraws.
- The sign-in scene's fixed minimum height and enlarged two-row thumbnails caused overflow. The outer sign-in shell is again exactly one viewport high, with a flexible-height main image and four compact thumbnail choices. Long recovery/request forms retain an internal accessible scroll area rather than forcing document scrolling or clipping controls.

## Validation
- Full regression suite and production build pass.
- Cost regression exercises all ten tabs after a deep link, filter reset, table/chart switching, report opening and route re-entry.
- Existing all-role shell checks cover every role; navigation audit covers 36 seeded role types.
- A real headless Chromium session loaded the generated bundle using synthetic data only. It clicked all ten cost tabs, toggled table mode and opened the full report modal successfully.
- In that browser, sign-in document height matched viewport height at 1568×900, 1366×650, 1024×768 and 390×844. The ordinary sign-in panel required no internal scrolling at those sizes.
- At 1568×900, the request toolbar ended at y=156.33 and its workspace context card began at y=172.70: separate tracks with a visible gap, not overlap. Sign-in and request screenshots were visually inspected.

The optional browser test is `v6/test/browser-console-smoke.cjs`. It requires external playwright-core and @sparticuz/chromium installation plus compatible system libraries; set CARELINK_BROWSER_TOOLS to their installation directory. It uses only local synthetic records and does not access production accounts. These checks do not constitute physical-device, all-printer or all-browser acceptance.
