# Pre-editorial redesign restore point

The complete version immediately before the editorial redesign is Git commit
`bc616af679b53ec022d848d0a3badd764421747f` (the merge of PR #44). It is
already on the remote `main` history and remains reachable from the redesign
branch; no database or credentials are included in this code backup.

To restore the interface, use Git to review and revert the redesign commit(s)
in a new change, rebuilding the v6 bundles and testing before deployment. Do
not reset the shared production database as part of a code rollback. A code
restore point is not a backup of production data; database backups must be
managed separately by the deployment administrator.
