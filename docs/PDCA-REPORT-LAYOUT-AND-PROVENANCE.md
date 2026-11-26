# PDCA layout and report output provenance

The PDCA report retains the source-mapped clinical fields and their reading order, but arranges them in two balanced spreads instead of three half-empty pages. Both columns are used on the second spread. Long clinical narratives remain visible and may flow onto additional physical pages; two spreads is not a guarantee of exactly two printed sheets. Discharge acknowledgement/signatures remain separate and must be obtained on paper. The restrained four-stage graphic is a navigation aid, not a claim that stages are completed.

Report provenance identifies the generating/exporting account, username, department and UTC timestamp. It is separate from the clinician who prepared the evaluation, the reviewer and sharing authorisation. Existing clinical authorship and immutable revisions are not overwritten. Archived report metadata now captures a generation-time provenance snapshot. Older archived records are not retroactively attributed to invented departments.

Coverage: shared report shell (including Word reports), PDCA preview/PDF/Word/JSON output, generic printable documents, spreadsheet exports via the shared XLSX builder, Monday minutes Word export, and the shared print controller. Spreadsheets add a provenance sheet without changing source-data columns. Machine-readable operational extracts and backups are not restructured as presentation reports.

Printing adds “Print requested” with the current account/department/time. A device print dialog cannot establish that paper was produced, that a physical printer succeeded, or who later printed a downloaded file. Those events are not asserted. The authenticated account identity is output context, not a cryptographic signature.

The PDCA DOCX embeds the actual bundled foundation PNG with an Office package image relationship on both spreads. The shared DOCX report writer also embeds it alongside a text letterhead. Other Word-like exports may still use separate paths and have not all been redesigned.

Automated validation includes preservation of every PDCA source field, two nonempty-column spreads, embedded logo bytes and package relationships, Word structure, output attribution and escaping, spreadsheet provenance, print lifecycle and the full workflow regression suite. Browser print-preview, pagination with exceptionally long narratives, physical printer and real-device visual acceptance remain manual checks. Passing automated tests is not a certification that every real-world user journey has been exercised.
