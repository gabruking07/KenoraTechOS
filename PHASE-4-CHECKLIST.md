# KenoraTech OS — Phase 4 checklist

This checklist records the source review and verification work for Phase 4. Statuses are updated as work proceeds; source inspection alone does not count as a test pass.

## Existing application inspection

- [x] Read the Phase 1–3 reports and existing architecture, deployment, security, integration, and schema documentation.
- [x] Inspect React routes/navigation, API client, dashboard, and major workspace pages.
- [x] Inspect Express middleware, authentication/CSRF, API/business/security routers, models, storage/backup, security crypto, email, provider activity, and tests.
- [ ] Review every API endpoint and user workflow for Phase 4 compatibility and defects.
- [x] Record exact available checks and run regression suite.

## Provider integration framework

- [x] Central provider status, connection checks, timeout, pagination, retry/rate limit handling, caching, concurrency limits, and redacted errors (unit mocks only).
- [x] GitHub repositories, branches, commits, issues, pull requests, and sync status (bounded read-only feed; not full synchronization).
- [x] Vercel projects and deployment metadata/status (bounded recent feed).
- [x] Render services and deployment metadata/status (bounded recent feed).
- [x] Cloudflare account/zone/DNS status, limited to granted permissions (bounded read-only feed).
- [x] Keep credentials server-side and never claim connection without a successful check.
- [x] Mark live credentials and external integration verification explicitly.

## Kenora AI Hub

- [x] Inspect the available Kenora AI Hub contract/SDK in repository and docs; none is defined.
- [ ] Server adapter, connection test, timeout, error handling, usage tracking, and request history.
- [ ] Permission-checked assistant context and secret filtering.
- [ ] Suggestions clearly labeled; no automatic data mutation.
- [ ] Mark missing endpoint/configuration as blocked.

## Automation and notifications

- [x] Safe workflow models and validation for triggers/actions; no arbitrary code execution.
- [x] Time-zone aware scheduling, idempotency, duplicate protection, concurrency, retry, and history (timezone tests; DB worker paths unverified).
- [x] Event triggers and supported safe in-app actions (database execution unverified).
- [x] Notification read/unread, categories, priority, relation, history, bulk read, and archive.
- [ ] SMTP delivery status/retry/deduplication when configured; otherwise explicit unavailable status.

## Search, dashboard, monitoring, and UX

- [x] Permission-aware server-side cross-entity search with pagination and safe query handling (unit/auth tests; DB behavior unverified).
- [x] Command-center navigation and keyboard behavior (source implemented; browser interaction not exercised).
- [ ] Dashboard metrics sourced from records with currency/date correctness, empty states, and navigation.
- [x] Safe dependency health, correlation IDs, operational history, provider/worker status, and errors without secrets (health tested only without database).
- [ ] Review performance, bounded database reads, indexes, query caching, bundle, loading/error/empty states, mobile and keyboard behavior, and broken routes.

## Deployment, tests, and deliverables

- [x] Review Vercel/Render/Atlas/storage/CORS/cookies/sessions/health/worker requirements; do not change production settings.
- [x] Add isolated mocked tests where possible; run typecheck, existing/new tests, builds, and configured lint (no lint script exists).
- [x] Create `PHASE-4-REPORT.md` with verified facts, exact commands, limitations, rollback, and status.
- [x] Create `KENORATECH-OS-FINAL-TEST-PLAN.md` covering all four phases with requested test matrix fields and statuses.
- [ ] Leave production integrations/database and `.env` files untouched.
