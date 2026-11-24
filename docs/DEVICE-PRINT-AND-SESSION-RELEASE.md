# Device-aware workspace and single-instance sign-in

## Behaviour

- Client layout hints identify phone, tablet (including touch-capable iPad desktop mode), or computer and compact/medium/wide windows. Window resizing updates the layout. These hints never determine permissions: signed-in account/role and server scope still do that.
- Toolbar shortcuts wrap into deliberate rows rather than clipping names. Foundation White retains opaque reading surfaces, with restrained colour/texture and brighter messaging surfaces.
- One atomic KV account/credential-epoch lease admits one session. Competing login returns HTTP 409 `session_conflict`. Login retries with the same random attempt ID are idempotent only within the same cookie-bound browser proof. Reload retains the tab session; a fresh tab/login is a separate instance.
- Logout persists token/session revocation before owner-checked lease release. If release fails, HTTP 503 requests a retry; the signed, device-bound former owner may retry release without affecting a newer owner's lease. Explicit UI logout waits for confirmation. Closing a browser is not a guaranteed logout: the abandoned lease expires after 31 minutes without renewal. Existing idle token limit remains 30 minutes; UI may lock/end sooner.
- Existing v1/v2 leases migrate on heartbeat; first valid owner wins. Other old sessions lose renewal and must sign in again. Already-issued tokens can remain usable for their existing signed lifetime before the next heartbeat; this release does not claim instantaneous invalidation of every pre-release token.
- Each successful login records browser registration, account, time, supplied client label/type and a bounded user-agent hint. The Chief's Devices console shows last sign-in and recent account history (50 entries per registration, up to 100 distinct account names). Cookie clearing produces a new browser registration; this is not an IMEI/hardware inventory. Treat client labels as untrusted hints. Registry/audit remain server-side and Chief-restricted.
- Password checking now uses asynchronous PBKDF2 rather than blocking the server event loop. The 160,000-round hash, constant-time comparison and fail-closed storage remain unchanged. Temporary-password consumption and login history share one metadata write. No unmeasured login-speed multiplier is promised.

## Print centre

The existing Print actions open orientation (portrait/landscape), A4/Letter and device setup guidance. A visible document/modal is captured before print settings open, avoiding stale previous-document output. Workspace printing excludes shell/navigation. Preview state is removed by `afterprint`/focus rather than an arbitrary 800ms timeout.

Windows uses installed USB/network/Wi-Fi printers. Android uses the system or manufacturer print service; USB requires device/adapter support. Printer enumeration, Bluetooth pairing, driver installation, silent printing and proof of successful paper output are outside browser capabilities. Save as PDF is available when the OS supports it. Physical hardware acceptance remains required.

## Calling

Vercel now permits same-origin microphone/camera access and the app iframe explicitly delegates both. Other origins are not globally enabled. Diagnostics distinguish embedding/server policy from browser/OS denial and missing devices. Permission changes may require opening/reloading the direct production tab. Actual calls still depend on browser/OS capability and network traversal; this release does not add a TURN relay or promise universal cross-network calling. No call recording is added.

## Organisation display and artwork

The landing workflow features Administration, Field Care, Hospital, Transport, Media & IT, Homestay, Procurement and Finance. The count is explicitly **11 Major Departments**; the dedicated “How CareLink works” page lists all eleven, including HR & Staff, Welfare Department and Internal Operations. The landing graphic stays free of the expanded directory. The same stated structure applies to counties. Role descriptions and overlapping transport/procurement duties are explanatory only, not new permission grants. Internal legacy RBAC capability groups are deliberately not migrated or renamed.

`public/media/lake-workspace-original.jpg` is AI-generated Lake Victoria-inspired artwork, not an authenticated photograph of a particular Kisumu site. Its native dimensions are 1376 × 768. Responsive WebP exports are 960, 1920 and 3840 pixels wide; the larger files are resampled, not native 4K detail. Hosted entry selects these separately loaded assets; the standalone file retains the existing bundled lake fallback. A verified native-UHD photograph can replace the artwork later without changing authentication or app code.

## Verification / remaining acceptance

Automated coverage includes phone/tablet/iPad/Windows hints, narrow PC layout, print-handler wiring/lifecycle, camera policy delegation, exact department display, competing and parallel sign-ins, immediate logout handoff, same-device retries, failed lease-release recovery, device history and account scope. Run `npm run test:all` and `npm run build`.

Real-device acceptance is still needed: Android and Windows printer dialogs/hardware, camera/microphone with two separate authorised accounts, narrow/wide/zoomed layouts and screenshot review. Chromium screenshot automation in this workspace cannot launch because system NSS/NSPR shared libraries are missing. Do not describe source/render tests as real browser visual acceptance.
