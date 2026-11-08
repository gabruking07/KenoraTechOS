# KenoraTech OS — production readiness

## Decision

**NOT ACCEPTED — PRODUCTION READINESS NOT VERIFIED. NO-GO for production launch.** Available local checks pass, but critical data protection, recovery, financial concurrency, and deployment requirements have not been verified against isolated staging infrastructure. No production infrastructure was accessed or modified.

## Verified locally

- `npm.cmd run typecheck` — PASS.
- `npm.cmd test --workspace server` — PASS, 45 tests across 10 files.
- `npm.cmd run build` — PASS for client and server; Vite emitted a Node deprecation warning.
- Confirmed request-query logging defect fixed with regression coverage.
- Authentication, selected security helpers, finance arithmetic primitives, storage/archive helpers, provider HTTP helpers, and scheduling calculations have isolated tests.

These checks do not equal production acceptance. See [final test report](KENORATECH-OS-FINAL-TEST-REPORT.md) and [test plan](KENORATECH-OS-FINAL-TEST-PLAN.md).

## Required infrastructure and configuration

Use a staging-only secret manager; do not put secret values in reports or client configuration. Documented environment variable **names** include:

- API/database/session: `MONGODB_URI`, `SESSION_SECRET`, `CLIENT_URL`, `CORS_ALLOWED_ORIGINS`, `NODE_ENV`, `PORT`.
- Durable storage: `STORAGE_PROVIDER`, `STORAGE_ENDPOINT`, `STORAGE_TOKEN`.
- Client build: `VITE_API_BASE_URL`.
- Optional security integrations: `MFA_ENCRYPTION_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS`, `FILE_SCANNER_URL`, `FILE_SCANNER_TOKEN`.
- Read-only provider integrations: `GITHUB_TOKEN`, `VERCEL_ACCESS_TOKEN`, `RENDER_API_KEY`, `CLOUDFLARE_API_TOKEN`.
- AI Hub configuration names are present, but there is no integration contract: `KENORA_AI_HUB_URL`, `KENORA_AI_HUB_TOKEN` must not be treated as functional connection settings.

Keep all server secrets in the hosting secret manager. Do not expose provider or storage credentials through the client. The automation worker must be deployed separately with the same release/database configuration as the API; no live worker was started or verified.

## Required staging gates before launch

1. Provision disposable MongoDB replica set and test namespace. Verify additive indexes and Connect-Mongo session behavior.
2. Provision isolated durable storage and perform authenticated upload, download, replacement, version download, delete, failure, and durability checks.
3. Run copied-file migration dry run/apply and failure matrix. Verify source retention and reference update ordering.
4. Generate and inspect a representative full backup, validate checksums/exclusions, preview restore, apply additive restore, and retry after injected partial failure.
5. Run relationship deletion/reference tests and pagination/filter/sort tests with multi-page datasets.
6. Race payment requests on a transaction-capable database; verify overpayment, duplicate reference, cancellation, reversal, currency separation, and report totals.
7. Test file signatures, scanner fail-closed behavior, authenticated access, and error cleanup with an isolated scanner/storage mock or approved staging service.
8. Run two scheduler workers against the isolated DB; verify leases, idempotency, retry, event triggers, stale lease recovery, and restore safety.
9. Exercise every client route and visible action in a browser against staging, including responsive/keyboard use and nested route refresh.
10. Deploy staging API/client/worker and verify secure cookies, exact CORS, HTTPS/proxy behavior, session persistence, health matrix, logs, and startup/restart behavior.
11. Execute mock and authorized staging provider tests with least-privilege credentials. Do not run write operations.
12. Run a dependency vulnerability review against an approved advisory source and record exact tool output without changing dependency versions automatically.

## Outstanding risks

- **Backups/recovery:** no end-to-end database/object backup/restore rehearsal. Additive restore can be partial after failure; recovery must be rehearsed and reviewed.
- **Financial integrity:** calculation helpers pass, but MongoDB transaction concurrency and full API/report workflows are unverified.
- **Document integrity:** real storage durability and database/object consistency are unverified.
- **Automation:** database leases, competing workers, recovery and action deduplication are unverified. Keep production workflows disabled until staging tests pass.
- **Security:** deployed proxy/session/CORS behavior, actual session revocation, scanner, SMTP, multi-replica limits, and key recovery/rotation are not verified.
- **Integrations:** no live provider credentials were tested. AI Hub assistant calls and business SMTP/push delivery are not implemented.
- **Observability/performance:** no production-like load/query profile or complete browser regression was run.
- **Dependencies:** no advisory scan was run; no claim of clean dependencies is made.

## Deployment checklist

- [ ] Staging environment is isolated from production data and credentials.
- [ ] Durable storage health and object durability verified.
- [ ] MongoDB replica set, backups, indexes, and session persistence verified.
- [ ] API and separate automation worker deployed and independently monitored.
- [ ] Secure cookie, HTTPS proxy, CORS, CSRF/origin, and rate-limit strategy validated.
- [ ] Full backup/restore and document migration rehearsal passed.
- [ ] Payment concurrency and financial reports validated across currencies.
- [ ] File scanning and authenticated document lifecycle passed.
- [ ] Provider identity checks pass with least-privilege test credentials.
- [ ] Browser route/action and mobile/keyboard regression passes.
- [ ] Dependency security review recorded.
- [ ] Owner has reviewed all blocked rows and evidence in the final test plan.

**Go/no-go: NO-GO.** Launch only after every critical blocked item is verified in staging and the owner reviews the evidence. AI Hub and notification delivery must remain clearly unavailable until their real contracts and implementations are tested.
