# KenoraTech OS — final test plan (Phases 1–4)

Status definitions: **PASS** means the stated check was executed successfully; **FAIL** means it demonstrated a defect; **BLOCKED** means an external service or isolated infrastructure is required but unavailable; **NOT TESTED** means no execution was performed. A code review alone is not a PASS.

## Executed regression commands

| Command | Result |
|---|---|
| `npm.cmd run typecheck` | PASS — client and server. |
| `npm.cmd test --workspace server` | PASS — 9 files, 44 tests. |
| `npm.cmd run build` | PASS — production client and server builds. Node emitted a Vite `module.register()` deprecation warning. |

No lint script exists. Do not run migration, seed, or worker commands against production. For integration rows below, create a disposable isolated MongoDB database and temporary object-storage namespace, then use dummy credentials only.

## Phase 1 — reliability, storage, backup, migration

| ID | Feature / test | Preconditions and steps | Expected result | Priority | Status |
|---|---|---|---|---|---|
| P1-01 | Local storage round-trip and invalid key | Temp directory; run isolated reliability tests for write/read/delete and path-like keys. | Bytes round-trip; invalid keys rejected; deletion does not escape storage root. | Critical | PASS |
| P1-02 | Duplicate local object key preservation | Attempt different bytes at an existing key in temp storage. | Conflict; original bytes retained. | Critical | PASS |
| P1-03 | HTTP adapter status behavior | Mock fetch for duplicate, 404, 503, invalid key. | Duplicate semantics, missing-file mapping, and errors are handled safely. | High | PASS |
| P1-04 | Real durable gateway | Provision isolated gateway and dummy token; PUT/GET/DELETE, 412 conflict, auth failure, timeout, and persistence across restart. | Gateway honors contract and preserves bytes durably. | Critical | BLOCKED |
| P1-05 | Authenticated document lifecycle | Isolated DB/storage; upload, download, replace, old-version download, delete via authenticated routes. | Metadata/version behavior compatible; access requires auth; bytes correct. | Critical | BLOCKED |
| P1-06 | Unauthorized document access | Existing API integration requests without session. | Upload and download return 401. | Critical | PASS |
| P1-07 | Full archive dataset | Isolated DB/storage; create projects, nested folders, records, activity, docs and versions; create and extract full backup. | Manifest, counts, archive and per-file checksums match; sensitive credentials absent. | Critical | BLOCKED |
| P1-08 | Invalid archive and restore validation | Isolated DB; mutate checksum, duplicate IDs, references, unique fields, and missing objects. | Preview rejects invalid/conflicting rows and reports failures without overwriting existing data. | Critical | BLOCKED |
| P1-09 | Additive restore and retry | Restore into isolated DB, inject partial write failure, correct cause, retry. | Existing IDs remain unchanged; retry is safe and reports outcomes. | Critical | BLOCKED |
| P1-10 | Backup exclusions | Inspect generated archive for sessions/password hashes/backup snapshots and identity metadata. | Sessions, hashes, and backup-history snapshots omitted; user credentials are not recreated. | Critical | NOT TESTED |
| P1-11 | Document migration dry run | Copy legacy uploads; isolated DB; dry-run migration including missing files. | No DB refs change; missing items reported; originals retained. | Critical | BLOCKED |
| P1-12 | Document migration apply/failure matrix | Isolated DB, temp storage; valid file, duplicate run, existing key, mismatch, gateway failure, Mongo update failure. | Verify bytes before ref update; on failure retain source and old ref; rerun is safe. | Critical | BLOCKED |
| P1-13 | Migration checksum helper | Mock destination returning mismatched bytes. | Mismatch rejected and source retained. | High | PASS |
| P1-14 | Production local-storage health | Production-mode isolated health test with local storage. | Reports ephemeral/degraded readiness. | Critical | NOT TESTED |
| P1-15 | Vercel SPA route configuration | Parse `client/vercel.json`; visit nested route on deployed preview and refresh. | Rewrite targets client entry and nested route loads. | High | NOT TESTED |

## Phase 2 — security and access control

| ID | Feature / test | Preconditions and steps | Expected result | Priority | Status |
|---|---|---|---|---|---|
| P2-01 | Authentication/session lifecycle | Execute isolated auth integration suite. | Login/session/logout and unauthorized behavior correct. | Critical | PASS |
| P2-02 | Password reset and change | Execute isolated auth tests for expired/one-use tokens and password change. | Invalid/expired/reused tokens rejected; session revocation works. | Critical | PASS |
| P2-03 | MFA enrollment and recovery | Execute isolated auth tests for TOTP and one-time recovery codes. | Enrollment requires verification; recovery codes are single-use; invalid attempts rate-limited. | Critical | PASS |
| P2-04 | Role and origin enforcement | Execute isolated auth tests for restricted user and unsafe origins. | Privileged routes and cross-origin requests are rejected. | Critical | PASS |
| P2-05 | Security audit behavior | Execute security audit tests for failed authentication/security events. | Security events recorded without exposing secrets. | High | PASS |
| P2-06 | Production cookie/CORS configuration | Test hosted HTTPS app/API on intended domains and browser privacy modes. | Secure cookies, exact CORS origin, and CSRF protections work in deployment. | Critical | BLOCKED |
| P2-07 | Shared rate limiter at scale | Run multi-replica staging test with shared rate-limit store. | Aggregate IP limits hold across replicas. | High | NOT TESTED |
| P2-08 | Malware scanner integration | Configure isolated scanner endpoint/token and upload benign/infected test files. | Scanner integration blocks/reports infected files safely. | High | BLOCKED |

## Phase 3 — business management and relationships

| ID | Feature / test | Preconditions and steps | Expected result | Priority | Status |
|---|---|---|---|---|---|
| P3-01 | Business finance unit behavior | Execute `businessFinance.test.ts`. | Currency minor units and invoice/payment calculations behave as specified. | Critical | PASS |
| P3-02 | Concurrent payment transaction | Replica-set isolated DB; race payments near invoice balance. | No overpayment; transaction rollback is atomic. | Critical | BLOCKED |
| P3-03 | Business migration dry run/apply | Disposable isolated DB copy; run dry-run, inspect review rows, then explicit apply. | Supported rows copied with source IDs; source rows untouched; unsupported finance remains review-only. | Critical | BLOCKED |
| P3-04 | Project/folder/milestone deletion constraints | Isolated DB with dependent records; attempt deletes and legal deletes. | Dependencies block unsafe deletes; permitted deletions leave no orphans. | Critical | NOT TESTED |
| P3-05 | Task/document deletion constraints | Isolated DB with references and versioned document objects. | Rules are consistent; metadata and file deletion failures are recoverable. | Critical | NOT TESTED |
| P3-06 | Invalid business references | Isolated DB; submit references to missing project/client/milestone/etc. | Validation rejects invalid references before persistence. | High | NOT TESTED |
| P3-07 | Business pagination/search/sort | Dataset larger than each endpoint page limit. | Stable counts, page boundaries, allowlisted sorts, and filters. | High | NOT TESTED |
| P3-08 | Business UI workflows | Browser with isolated DB; exercise clients, leads, proposals, invoices, payments, QA, infrastructure, deployments. | Forms, validation, navigation, empty/loading/error states function. | High | NOT TESTED |

## Phase 4 — providers, AI, automation, search, operations

| ID | Feature / test | Preconditions and steps | Expected result | Priority | Status |
|---|---|---|---|---|---|
| P4-01 | Provider request timeout/retry/cache/pagination | Execute mocked provider HTTP integration tests. | Bounded retries, timeout/cache behavior and pagination caps work. | High | PASS |
| P4-02 | Provider live access | Dummy least-privilege GitHub/Vercel/Render/Cloudflare staging credentials; run identity check and inspect feed. | Connected only after successful identity check; errors redacted; no provider writes. | High | BLOCKED |
| P4-03 | Provider permission failures and secret redaction | Mock unauthorized/error responses and inspect API/client payloads. | No token, raw DNS content, or raw build logs are returned. | Critical | NOT TESTED |
| P4-04 | AI Hub contract/assistant | Obtain approved API contract, dummy endpoint/token; test connection, context permissions, filtering, timeout, usage and history. | Suggestions are permission-scoped and never mutate business data automatically. | High | BLOCKED |
| P4-05 | Automation timezone calculations | Execute scheduler unit tests covering daily, weekly, monthly, DST gap, invalid zone. | Next occurrence respects configured time zone and DST. | High | PASS |
| P4-06 | Worker leases/idempotency/action history | Disposable MongoDB; start two worker processes, schedule same trigger, force action and DB failures. | One logical execution; safe retry; history and heartbeat accurate. | Critical | BLOCKED |
| P4-07 | Automation event hooks | Isolated DB; create/update supported events and await worker processing. | Only supported trigger/action combinations execute; duplicates do not create duplicate tasks/notifications. | Critical | BLOCKED |
| P4-08 | Automation restore safety | Full backup with enabled and running workflows; restore to isolated database. | Workflows disabled and running executions marked failed for review. | Critical | BLOCKED |
| P4-09 | Notifications workflow | Isolated DB/browser; mark single/all read, filter categories, archive, navigate relation. | State persists and archived items leave default inbox. | High | NOT TESTED |
| P4-10 | SMTP/push delivery | Approved test mail/push provider and sandbox recipient. | Delivery queue/retry/deduplication/status visible. | Medium | NOT TESTED |
| P4-11 | Search input and authentication checks | Run isolated search service/API tests for bounded literal query handling and unauthenticated access. | Query normalization is bounded/literal and unauthenticated requests are rejected. | High | PASS |
| P4-12 | Search database coverage/performance | Large representative isolated DB; exercise all entity types and pages under query profiling. | Counts and result ordering correct; latency and query load within agreed bounds. | High | BLOCKED |
| P4-13 | Search command-center browser behavior | Browser; keyboard shortcut, debounce, arrows, Enter, pagination, route navigation, mobile width. | Keyboard and pointer navigation work without focus or overflow defects. | Medium | NOT TESTED |
| P4-14 | Health readiness matrix | Isolated test matrix: DB absent/present, local/http storage, gateway absent/present, worker heartbeat stale/fresh. | HTTP status and component statuses accurately distinguish application and dependency readiness. | Critical | NOT TESTED |
| P4-15 | Production logs and errors | Staging requests with malformed input and upstream failures; inspect logs/response. | Correlation ID present; secrets and raw exception details absent. | Critical | NOT TESTED |
| P4-16 | Worker deployment | Deploy API and separate worker to staging with same release/DB; restart worker and inspect health. | Worker starts independently, leases recover, heartbeat changes; no production settings changed during test. | Critical | BLOCKED |
| P4-17 | Dashboard correctness | Isolated records in multiple currencies/date ranges; compare dashboard aggregates and navigation. | Totals, currency, date filtering, empty states, and links match source records. | High | NOT TESTED |

## Final release gate

Do not mark production acceptance until every critical blocked row has passed in isolated staging, the owner has reviewed test evidence, recovery and migration rehearsals are successful, the real storage durability contract is verified, and production configuration is reviewed separately. Missing AI Hub and email contracts must remain unavailable rather than being represented as working features.
