# Planning and PDCA work in progress

This is a partial implementation, not a completed feature suite.

- Weekly Planning Indicators default to the last completed Monday–Friday work week in Africa/Nairobi. Dated events use that period; standing totals remain current register figures, not historical snapshots. The custom 52-week numbering rule is not yet specified. New archive keys therefore continue to use a **provisional ISO week key** for the selected working period; existing records are not relabelled. The supplied example 16–20 November 2026 is ISO week 47. The custom rule may differ, and must be defined before converting keys or displaying its week numbers.
- The Monday assessment tab groups scoped events by area and uses a deterministic shuffled area order; see `MONDAY-WEEKLY-REVIEW.md`. It does not yet provide a shared secretary-controlled meeting progression. It still includes the whole previous Monday–Sunday for assessment coverage, so weekend clinical records are not silently hidden.
- For the existing 120+ day workflow, the assigned caregiver can now explicitly share an immutable, MCM-authorized revision. Server checks and the established MCM authorization chain remain in force. Sharing all other MCM-reviewed PDCAs is not yet implemented.
- PDCA printable HTML has a foundation letterhead; this does not establish logo or bespoke layout support for every export or document type.
- Line-anchored international comments, questions, evidence requests, threaded local discussion, the daily devotion roster and seven-translation Bible reference, and full document redesign are not implemented. The actual minutes template is to be supplied later; no template was used for training.
- Secure hosted offline login and refresh after loss of network remain blocked as described in `OFFLINE_SECURITY_REQUIREMENTS.md`; the shell alone is not offline clinical access. No claim of full offline synchronization, safety or data retention is made.
