# Cross-account checks and workspace access

## Evidence reconciliation
The Data quality workspace now includes cross-account findings for authorised quality/audit officers. Checks are deterministic review prompts, not employee performance scores or allegations. They do not mutate sources. Existing blocking/warning priorities and reasoned, time-limited waiver handling apply.

Initial categories:
- Clinical observations: one verified home sheet and one visit, same patient and day, different entering accounts, positive weights differing by more than 0.05 kg. Multiple observations on either side are not paired; measurement time/units still need human review.
- Hospital/finance linkage: an expense's patient differs from its explicitly linked hospital request, entered by different accounts.
- Independent financial review: a reconciled expense has the same entering/reviewing account.
- Hospital/finance handover: closed/reconciled hospital request has a linked paid/reconciled expense with no financial reviewer.

Clinical checks require clinical and form visibility. Finance checks require finance visibility. All comparisons are restricted to the viewer's patient scope and finance county scope. No patient identifiers from outside that scope are displayed. Draft clinical forms are excluded. CSV findings include categories, accounts and source record IDs. Missing findings do not mean missing/ambiguous evidence agrees. Additional category comparisons require agreed source links and reconciliation rules; no comprehensive all-department audit certification is claimed.

## Navigation and screenshots
All accounts use the same high-contrast CareLink OS identity and in-flow shortcut row; no per-user visual patch is necessary. The application iframe has a new release key, the offline shell cache advances to v8, and a build stamp is visible in the toolbar to distinguish current builds from old open/offline copies. No account, clinical data or local drafts are cleared by the cache update.

View navigation now reveals/focuses the content area, including Home, instead of scrolling to the introductory hero. Clicking a control that replaces the workspace reveals the replacement unless it opens a modal or intentionally changes navigation-pane/theme controls. Ordinary background redraws preserve scroll. Hash navigation uses the same reveal logic. Form inputs and ordinary in-place controls are not indiscriminately scrolled on every click.

The sign-in gallery uses a taller 4:3 main scene and larger labelled thumbnail cards instead of shallow 19–23vh strips and 22px thumbnails. Review at actual browser/device sizes remains part of visual acceptance.
