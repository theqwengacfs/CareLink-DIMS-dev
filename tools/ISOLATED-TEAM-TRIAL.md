# Isolated shared team trial

This runbook is for a **separate Vercel project and a separate, empty Redis/KV database**, not the existing CareLink installation. It provides a shared, editable evaluation site with 4,000 runtime-generated synthetic patients and synthetic role accounts. Do not enter real patient, staff or other confidential information. These accounts represent trial seats, not confirmation that anyone holds a real staff position. Trial data, edits, sessions and cookies are not a production system or a migration.

Do not create paid resources, enable automatic upgrades, reuse the existing database, switch the current hostname, reset an installation or copy credentials without the owner's separate approval. A missing project connection or inability to verify storage isolation is a **block**, not permission to use the existing database. The code cannot independently prove that a database which currently has no live root key is a different database; the owner must verify the provider identity and isolation before continuing.

## Configure a separate project

1. Create or select an approved **separate** Vercel project and a distinct, empty KV/Redis REST database. Ensure the deployment uses this reviewed code. Trial users may consume significant commands, storage and bandwidth; check the provider's limits and any charges before initialization. Do not enable upgrades or circumvent free limits.
2. On the trial project only, set the following environment variables for the environment being deployed. Do not put their values in this repository, issue, PR, chat, shell history, or logs. Set no production KV credentials in the trial project. Redeploy after configuring:
   - `CARELINK_TRIAL_MODE=isolated-v1`
   - `CARELINK_TRIAL_HOST`: the **exact** trial hostname, without scheme or path. Requests to other hostnames are refused. The current official and former CareLink hostnames and GitHub Pages hostname are explicitly forbidden. Configure a stable trial domain, not an automatic per-commit preview hostname.
   - `CARELINK_TRIAL_KV_REST_API_URL` and `CARELINK_TRIAL_KV_REST_API_TOKEN`: the **separate** trial database's REST endpoint and writable token. Normal `KV_*`, `UPSTASH_*`, TCP and read-only fallback variables are not used in trial mode.
   - `CARELINK_TRIAL_SETUP_SECRET`: generate 32 cryptographically random bytes and encode them as unpadded base64url. Keep this value private. The server requires a 43–128 character base64url value, but cannot test the randomness of an operator-supplied string.
3. The trial uses its own root, shard, session-lease and upload namespaces and refuses a backing database containing `carelink_cloud_v66`. This is a further guard, **not** proof of a distinct database: an empty production database would also pass the root check. Never rely on namespacing to justify sharing the production database. Verify both the Vercel project and the database identity independently.

The existing application and its normal environment variables behave as before when `CARELINK_TRIAL_MODE` is unset. Do not set trial variables on the current CareLink project.

## Initialize exactly once

Only the authorized trial owner should run initialization in a private interactive terminal from a reviewed checkout, with an absolute output filename in an existing **private directory outside the repository**:

```text
node tools/initialize-isolated-trial.mjs https://THE-SEPARATE-TRIAL-HOST /private/path/trial-credentials.json
```

Enter the configured setup secret at the prompt; it is not echoed. The helper confirms that the host identifies itself as an uninitialized isolated trial, refuses redirects and current/former official hosts, creates the output file with owner-only permissions without overwriting an existing file, and sends the one-time request. The server requires the secret and an absent trial root, verifies the generated 4,000-patient reference, and saves once with atomic snapshot protection. It returns randomly generated, unique synthetic account credentials only to the initializing caller. Store the pack securely, distribute each account individually over a trusted channel, and do not commit it or upload it to shared storage.

**Never blindly retry after a timeout, lost response or failed output write.** Initialization may already have succeeded even if the credential response was lost; verify trial health and use an authorized recovery procedure, without resetting or replacing the database. The trial deliberately refuses repeated initialization and production first-run/reset/global-activation endpoints. A private Chief password is included in the one-time pack; retain it and its approved browser securely.

## Trial sign-in and day-to-day use

- The synthetic Chief signs in first using the issued credentials. This initial browser is approved by the existing one-time Chief admission mechanism. Each additional browser is pending until the Chief reviews and approves its device code. The trial sign-in form hides device label and type; it does **not** bypass device admission or session checks. Keep browser cookies until approval.
- Other issued passwords are individual, single-use temporary passwords, expire according to the configured policy (seven days initially), and must be privately replaced before opening a workspace. The Chief can reissue trial seats through the trial's staff credential console. Do not reuse these credentials for production, and never share the Chief credentials with the team.
- Server role/county/area restrictions and clinical decision guards remain in force. A user sees records permitted to that role, not all 4,000 patients at every access level. The trial contains 4,000 total, distributed across the programme; privileged clinical county coverage remains scoped.
- Trial banners say **SYNTHETIC DATA ONLY**. This warning does not technically prevent a user typing real information. Tell testers explicitly not to do so. Saves are shared in the trial database and may be visible to appropriately scoped trial accounts.
- The trial supports testing, not clinical care, reporting or data migration. Existing production held work and browser-local records remain at their original host. Never clear site data to repair a sign-in.

## Current-site sign-in investigation

A public health probe can confirm only what the *currently bound* backend reports. If it says `setup:false` and `accounts:0`, existing credentials cannot authenticate against that reported store; it does **not** establish that old data was deleted or that another database cannot be recovered. Inspect the current project's environment/KV bindings and provider status with the authorized owner, without revealing tokens or passwords. Do not click reset, commission a new installation, import trial data, rotate credentials or delete keys as a diagnosis. See `OWNER-RECOVERY.md` and `KV-BANDWIDTH.md` for non-destructive recovery and quota guidance.
