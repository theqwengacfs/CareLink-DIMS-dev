# Session handoff — design and safety gate

Status: **not implemented**. This is a design gate for the request to release a session on logout or tab closure so the account can sign in elsewhere without an idle-session wait. It is not a guarantee of immediate browser-close detection or a production security approval.

## Current behavior and risk

- Explicit online logout saves revocation before compare-and-release of the owner lease. A failed release is retryable by the same signed, device-bound owner. Competing logins otherwise wait for the account lease to expire; see [device and session release](DEVICE-PRINT-AND-SESSION-RELEASE.md).
- The browser cannot reliably distinguish closing the last tab from reload, navigation, a crash, process termination, mobile suspension or a network outage. A `pagehide`, `beforeunload` or beacon is not a delivery guarantee. Logging out on such an event can also terminate a refreshed page or another tab and jeopardize unsaved work. Do not implement it as a definitive sign-out.
- A password-authenticated takeover could provide a practical recovery path without waiting for expiry, but a blind lease replacement is unsafe. `getSession` validates signatures, credentials, device and revocation state; ordinary protected requests do not all validate current lease ownership. An old signed token can therefore remain usable until expiration even if its lease is replaced, unless a stronger server-side revocation/fencing protocol is implemented.
- Active or queued work may exist on the previous device. Do not clear browser storage or silently discard outbox entries; a takeover cannot guarantee those drafts were preserved or transmitted.

## Conditions before implementing takeover

1. Define explicit user confirmation and disclose that the other session will be invalidated and unsaved work may be lost. Require current credentials and existing device/admission controls; do not bypass MFA, revocation, temporary-password rules or rate limiting if they apply. Distinguish a new device from a retry of the same login attempt.
2. Atomically establish ownership on the writable primary with a unique fencing value. An old holder must not renew, release or resurrect the replacement. Login/lease/metadata failures and lost responses must have idempotent, owner-safe recovery.
3. Enforce the current fence on every authenticated data read and write, including paged/delta, exports, commands, identity and file endpoints. Account for requests already in flight during replacement: a write authorized before takeover must not commit afterward as the former session. Coordinate with optimistic concurrency and multi-instance persistence; fail closed when primary verification is unavailable. Do not equate a cached snapshot or a heartbeat-only check with fencing.
4. Preserve correct logout behavior: revoke before release; an old owner's delayed logout or failed-release retry cannot revoke or release the new session. Handle simultaneous takeovers, parallel login, retries and password changes without multiple winners or stranded leases.
5. Do not rely on tab unload as proof of closure. A best-effort close notification, if later approved, must not log out on refresh, navigation, back/forward cache, backgrounding or when another tab owns the same session. Clearly disclose that no notification can be guaranteed.
6. Test synthetic multi-device, multi-tab, concurrent read/write and stale-token cases, including former-token reads and mutations after handoff, in-flight writes, delayed logout/heartbeat, provider outages, lost acknowledgements, cold starts, held work and safe retries. Verify on target browsers/devices. Assess primary-request cost and performance without weakening the fence.
7. Obtain appropriate security and privacy review and an operational rollback plan before production. Do not characterize a synthetic test or preview as complete clinical/security acceptance.

Until then, retain current single-session behavior and the existing explicit logout/retry path. There is no new takeover endpoint or tab-close logout in this design note.
