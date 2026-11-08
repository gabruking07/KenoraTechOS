# Deployment

Deploy the Vite client as a static app and the Express API as a Node service. Create a MongoDB Atlas database and allow only the backend's network path. Set `MONGODB_URI`, a random `SESSION_SECRET` (32+ characters), `CLIENT_URL` to the exact HTTPS client origin, `NODE_ENV=production`, and `PORT` in the backend environment. Set `VITE_API_BASE_URL` at client build time to the HTTPS API `/api/v1` URL. Enable HTTPS and verify Secure cookies and CORS. Configure MongoDB backups before storing business records.

For production document storage, also set `STORAGE_PROVIDER=http`, `STORAGE_ENDPOINT`, and `STORAGE_TOKEN` for a durable object-storage gateway that implements the authenticated API described in [Phase 1 reliability operations](phase-1-reliability.md). The local filesystem adapter is intended for development; health returns `503 degraded` in production when it is selected. Keep all storage credentials in the API service environment. The Vercel client includes a rewrite for SPA route refreshes. No production environment or deployment settings were changed as part of this work.

PowerShell build: `npm.cmd install; npm.cmd run build`. No provider deployment has been performed from this workspace.

## Phase 4 integrations and automation worker

The API exposes bounded read-only provider activity for GitHub, Vercel, Render, and Cloudflare. Configure only the required provider tokens in the backend host's secret manager. A configured token is not proof of access: provider status becomes connected only after the provider identity check succeeds. The feed is capped and cached; it is not a complete historical synchronization. Cloudflare access requires the minimum zone and DNS read permissions needed for the configured account. No provider writes are performed.

AI Hub is not enabled by setting credentials alone. The repository has no defined AI Hub API contract or SDK, so no model request or assistant workflow is available. Do not label the AI Hub as connected until an agreed contract is implemented and verified.

Deploy the automation scheduler as a separate Node worker using the same backend release, database, and server-side environment as the API. Build with `npm.cmd run build:server`, then use `npm.cmd run worker --workspace server` as the worker start command. The worker polls every 30 seconds and uses MongoDB leases and unique run keys to coordinate replicas. The API does not start the worker implicitly. Monitor `/api/v1/health` for `automationWorker`; `not-running` means scheduled work is not being processed. Verify MongoDB connectivity and worker heartbeat in a staging environment before enabling workflows. Workflow actions are limited to in-app notifications and task creation; email, push, arbitrary scripts, and external write actions are not implemented.

Global search queries operational records through the authenticated API. It returns bounded results and omits sensitive fields such as contact email and invoice notes. Validate query latency against representative staging data before enabling high-volume use; deep pages are limited and the search is not a dedicated indexed search service.

## Phase 2 security settings

Set `SESSION_SECRET` to a random value with at least 32 characters and `CLIENT_URL` to the exact HTTPS client origin. Set `CORS_ALLOWED_ORIGINS` only for additional exact trusted origins; never use `*`. Keep `SameSite=Lax` and Secure cookies in production. For reliable cross-origin sessions across browser privacy modes, put the frontend and API on custom subdomains of the same registrable domain (for example, `app.example.com` and `api.example.com`) and set the exact client origin. Do not weaken cookie or CSRF settings for unrelated hosted domains.

Password recovery is unavailable until `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM` are configured; if SMTP authentication is used, set both `SMTP_USER` and `SMTP_PASS`. Optional TOTP enrollment also requires a persistent `MFA_ENCRYPTION_KEY` containing 32 random bytes encoded as hex. Store the key in the hosting secret manager and in a secure independent recovery location. Optional malware scanning requires `FILE_SCANNER_URL` and `FILE_SCANNER_TOKEN`; without those values, uploads are not malware-scanned.

The built-in IP rate limiter uses per-process memory. If the API is run on multiple replicas, configure a shared rate-limit store at the hosting layer before relying on aggregate IP limits. Account-level MFA lockout remains database-backed.
# Phase 3 business operations

Financial payment recording uses MongoDB transactions so concurrent payments cannot over-apply an invoice balance. Configure MongoDB as a replica set or transaction-capable cluster before enabling these workflows. Review schema indexes and add them with additive `createIndex` operations; do not use `syncIndexes` on a production database.

Legacy business conversion is opt-in. First point the application to an isolated database copy and run `npm run migrate:business --workspace server` for a dry run. Review `review` entries; supported rows are copied with their `WorkspaceRecord` ID as `legacySourceId`, and originals remain untouched. To apply only to that isolated copy, use `npm run migrate:business --workspace server -- --apply --confirm-isolated-database --database-name=<expected-name>`. Proposals, invoices, and unverified legacy income are left for manual review. No migration is run during application startup.

Email/push delivery is unavailable in Phase 3. In-app reminders are created only when an administrator selects Prepare reminders; delivery is not claimed.
