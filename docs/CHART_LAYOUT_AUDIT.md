# Shared chart layout audit

The department cost dashboard and the shared chart components are used throughout the application. This pass fixes the pictured overlap by sizing the paired dashboard charts to their actual card, rather than the browser viewport. Shared donut legends, totals and horizontal bars wrap in narrow containers; wide SVG plots can be scrolled by keyboard or touch, and their complete data tables remain available. A visible hint appears when a plot is too narrow. Print copies do not inherit the scrolling minimum width.

## Synthetic verification

`npm run test:browser:layout` includes `v6/test/chart-layout-browser.mjs` (requires Playwright Core and Chromium). It exercises the real department cost card with synthetic data and the donut, horizontal bar, bar, line, stacked, grouped and waterfall components across eight viewport/card-width/zoom combinations. It checks child geometry, overlap and unwanted overflow, a long legend, keyboard focus and data-table access. It also samples rendered chart components in synthetic finance, clinical and reporting workspaces at desktop and phone widths. `npm run test:browser:report-print` checks synthetic report PDFs at desktop and phone viewport widths in A4 portrait and landscape.

This is a shared-component and sampled-workspace audit, not a visual certification of every route, role, dataset, language, theme, zoom setting, printer or device. Chart values and authorization policies were not changed. Further hands-on review on supported devices and with authorized data is needed before claiming a complete visual audit.
