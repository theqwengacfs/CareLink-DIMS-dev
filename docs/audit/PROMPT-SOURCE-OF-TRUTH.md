# Prompt source of truth

Status: **verbatim user text, supplied 26 November 2026.** This file exists because
[the request traceability checklist](../REQUEST-TRACEABILITY.md) and the
[outstanding delivery tracker](../OUTSTANDING-DELIVERY-TRACKER.md) were both
reconstructed, and both state in their own opening lines that the original wording
was not available for a word-for-word comparison. That gap is now closed.

This file is the **index and provenance record**. It does not restate every line;
the audit that reconciles each line against the code is in
[PROMPT-AUDIT-001.md](PROMPT-AUDIT-001.md).

## What was supplied

Four prompt batches, in this order:

| Batch | Content | Rough item count |
|---|---|---|
| A | "Add these too 100% fully" — nine numbered items (52-week planning weeks, international PDCA advisory, assessment deliberation order, Monday–Friday devotion rota, fair devotion distribution, verse/prayer notes with Bible display, minutes template, refresh-safe pages, PDCA letterhead and document identity) | 9 |
| B | Unnumbered block — immediate session end, document sharing and personal libraries, transition smoothing, click-to-content, public statistics from central DB, 4,444 patients, mobile metadata, executive matrix box, C-DIMS Coins explanation, banner colour balance, Hospital Department Update, Media & Information Governance, per-account banner colours, journeys and workflows, click-to-content repeated | ~16 |
| C | "Now consider these prompts" — offline login, no-network banner placement, sign-in right side, remove browser approval and 31-minute wait, navigation pane to workspace phase, left-pane role audit, call buttons and margin overflow, left navigation redesign, workspace colour and breathing space, cross-account discrepancy audit, sign-in imagery, (screenshots referenced twice), navigation repeated, PDCA layout and generator identity | ~16 |
| D | "Consider these prompts 100% in each line" — device-aware customisation, printing module, messaging/mic-camera restriction, single-instance login and device logging, UI elegance, wallpapers, faster login, landing graphic 11 departments, department structure, then a second numbered list (evidence audit, deliberation decisions, PDCA types and periods, care plan items, caregiver PDCA review engine, mid-week month boundaries, stylus handwriting, speed, announcements, icons, drawers and archive, international advisory console, care cycle file, justification only for extended, search/AI scope, device layouts, PWA upgrade, pane autohide, left-pane role audit, cramped stewardship text) | ~27 |

**Total distinct requirements: roughly 68.**

## Known limitations of this record

- The text above is a faithful index of what the user supplied, but the user's
  message contains four items that were **cut off mid-sentence or left blank**
  (the deliberation random-selection item, one screenshot reference, and one
  item whose body is empty). These are marked `INCOMPLETE-SOURCE` in the audit
  and are **not** treated as requirements that can be closed.
- Two items reference screenshots the assistant cannot see. They are marked
  `SCREENSHOT-MISSING`.
- Items about real-world facts (the 4,444 patient figure, the official calendar,
  the County organogram, the physical forms, the minutes template) cannot be
  verified from the repository. They are marked `EXTERNAL-DECISION`.

## Cross-reference

- Per-line verdicts, evidence and gaps: [PROMPT-AUDIT-001.md](PROMPT-AUDIT-001.md)
- Outstanding delivery work: [../OUTSTANDING-DELIVERY-TRACKER.md](../OUTSTANDING-DELIVERY-TRACKER.md)
- Session handoff gate (item B1): [../SESSION-HANDOFF-DESIGN-GATE.md](../SESSION-HANDOFF-DESIGN-GATE.md)
- Document sharing state (items B2): [../OFFLINE_SECURITY_REQUIREMENTS.md](../OFFLINE_SECURITY_REQUIREMENTS.md)
