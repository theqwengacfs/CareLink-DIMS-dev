# Chart and policy-card layout

This change isolates and adapts the chart and policy-card layout improvements from draft PR #75; it does not merge or release the rest of that draft. The cost card uses its actual container width, shared donut legends and horizontal bars wrap long labels, and narrow SVG chart plots can be scrolled by keyboard or touch while retaining the complete data table. Print media removes the scroll-only minimum plot width. Policy-card status and classification text wrap separately. No chart values, clinical decisions, permissions or report archive behavior are changed.

Chart labels and formatted values in donut/share accessibility descriptions and chart tooltips are escaped as text so a label cannot break out into HTML. The formatter outputs in stacked, grouped, gauge and waterfall descriptions are also escaped. This is not a general security certification of every chart input or every application view.

## Verification

- `node v6/test/chart-security-and-layout.js` checks synthetic hostile labels/formatter values, keyboard-focusable chart plots, retained table markup, responsive/print rules and policy metadata.
- `npm run test:browser:charts-and-policy` is an optional synthetic Playwright/Chromium geometry and interaction check. It measures chart containers, legends, totals, rows and actual cost cards across eight viewport/container/zoom combinations, keyboard scrolling, full tables and a sample of finance, clinical and reporting workspaces. It also tests six policy cards at five viewport sizes and checks that hostile text does not create markup. It makes no production requests or uses real records.
- These checks are not a complete visual audit or acceptance of every view, chart, accessibility device, browser, theme, language, printer or physical device. Real device, assistive-technology and printer acceptance remain necessary.

The browser tests require `playwright-core` and either a Chromium path in `CHROMIUM_PATH` or `@sparticuz/chromium`; they are optional test dependencies, not production packages. On minimal Linux environments the Chromium binary may also require NSS/NSPR shared libraries. Never add downloaded browser binaries or system libraries to this repository.
