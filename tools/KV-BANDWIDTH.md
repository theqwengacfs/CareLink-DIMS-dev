# KV bandwidth limits: safe no-upgrade response

A provider message such as **“This database has reached current Fixed plan
limits”** is not proof of a bad token, staff password, or even a paid plan. Read
the database's actual plan, alert and metrics in the Upstash console. Bandwidth,
commands and storage are separate limits. A monthly **bandwidth suspension**
can happen while command count is low; downloading or rewriting one large
value uses relatively few commands but transfers many bytes.

## Restore access without losing the installation

1. Stop repeated sign-in, full-sync and deployment retries. They cannot reset
   counted bandwidth. Keep the database and the issued account/device records.
2. In the existing database's console, confirm the exhausted metric and ask
   Upstash support, if necessary, for its **renewal/reactivation timing**. Do
   not assume a particular reset date or that a new deployment unsuspends it.
   Automatic access after renewal is provider-controlled and must be verified.
3. Do **not** enable an upgrade/auto-upgrade or add a payment method as a
   purported free fix. Do not rotate tokens/passwords, reset commissioning,
   seed demonstration data, flush keys, or point production at an empty store.
4. Review storage separately if it is close to its cap. This patch does not
   remove records or reclaim space. Do not delete shards just because their
   names look old: active and previous generations protect in-flight reads and
   recovery. Any cleanup needs its own inventory, backup and owner approval.
5. Once the provider confirms service is available, use **Retry Cloud KV
   Connection**, then sign in normally. Confirm held work is accepted by the
   online source; never treat an unavailable/held write as a live save.

Extra free accounts are not a compliant quota-reset strategy: Upstash's
[terms](https://upstash.com/trust/terms.pdf) allow no more than one free account
per person or legal entity. A different authorized provider/database is a
separate migration project, not a configuration-only fix. It requires capacity
and clinical-data/contract suitability review plus a verified backup/restore of
all records, credentials, approvals, audit and activation metadata. Mixed env
prefixes must not leave competing sources. No migration is performed here.

## What the code changes (no data-format migration)

- Every API request still checks the **writable primary** via EVAL. Redis hashes
  the exact stored root using the same SHA-1 identity as the existing CAS. Only
  when that digest matches an immutable raw snapshot already held by that
  process does Redis return `[digest, null]` instead of the root payload.
  Otherwise it returns the current exact value. No JSON re-encoding, schema
  migration, extra database key, TTL or browser-authority fallback is used.
- The bounded one-root process cache is never an online source: failed,
  malformed or missing-primary reads cannot authorize using an old value.
  Cold processes and changed roots still download the full value. The digest
  covers same-public-revision auth-only updates, not just revision/shard IDs.
  A request captures its own immutable entry before waiting on the primary.
- The existing exact-root CAS and request-to-store binding are preserved. A
  concurrent update still rejects a stale writer; a selected store's failed
  write cannot be committed to another configured database.
- Both gzip and sharded decoded snapshots overlay the freshly verified head,
  including device/account revocation, private-password gates and mutable
  authorization scope. Legacy values without embedded heads are cloned before
  device admission so a failed save cannot leave an uncommitted approval in a
  shared decoded cache. Session leases and Chief-only audited authority remain.
- Normal visible-client revision polling stays at ten seconds (the existing
  short pending-update cadence also remains). A slow tick cannot overlap the
  next one. Network exceptions and HTTP failures both back off to sixty
  seconds; hidden tabs skip state polls.
- Local call reconciliation still runs every ten seconds. Host session renewal
  is single-flight, at most once per minute, only after genuine activity and
  not while hidden or past the browser idle boundary. The fifteen-minute
  browser sign-out and host token/lease expiry checks are not relaxed.
- A quota is reported as HTTP `503`, `code: "kv_quota_exceeded"`, with
  `Retry-After: 300` and `retryAfterSeconds: 300`. The client shares a five-minute
  failure-only cooldown across reads, beats and saves, ending fast-pack,
  collection-page, recovery-probe and write-to-shards retry cascades. Already
  dispatched parallel parts may still finish. Cooldown expiry only permits a
  new check; it is **not** a promise of a provider reset. Explicit KV retry
  clears it so an operator can verify recovery.
- Failed saves and edits during cooldown stay in the existing account-bound
  durable outbox. Credentials and session tokens are not discarded as though
  the provider quota meant the operator entered a wrong password.

## Verification and limits of the measurements

```sh
npm run test:kv-bandwidth
npm run test:all
npm run build
```

The isolated byte regression includes both JSON command and response bodies
for 100 warm unchanged polls against a roughly 475 KB synthetic gzip envelope.
It asserts over **99% fewer body bytes** than the former whole-root reads,
while asserting one fresh primary check per poll. This is not a production
bandwidth forecast: HTTP/TLS headers, cold starts, changed roots, full/shard
reads, whole-state writes, other clients and provider accounting remain.
Storage is unchanged, and busy writes may still exceed free-tier capacity.

The regressions also cover same-revision warm/cold gzip and sharded revocation,
role demotion/private-password gates, CAS races, store isolation, failed or
missing primary reads, quota wording, refusal without a shard retry cascade,
non-overlapping polls/heartbeats, retry recovery and held-work replay. Existing
admission, clinical scope and owner-recovery suites remain required. Optional
real-Chromium checks use only an isolated synthetic fixture API:

```sh
npm run test:browser:phase1
```

Provider references: [billing](https://upstash.com/docs/redis/overall/billing),
[pricing](https://upstash.com/pricing/redis). The console/support determine this
installation's applicable limits and restoration timing; do not infer them
from a generic error string. None of these tests certify a real patient
identity workbook or the suitability of a provider for clinical data.
