# API reference

All endpoints are under `/api/v1`. Successful responses use `{ data }`; list responses may include `{ meta }`. Errors use `{ error: { message } }`.

- `GET /health` public health check.
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` session lifecycle.
- `GET /dashboard` saved project aggregates, upcoming milestones, overdue tasks and integration configuration flags.
- `GET /provider-activity`, optionally `?project=<id>`, fetches recent events from configured GitHub, Vercel, and Render accounts and maps matching resources to projects.
- `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`, `POST /projects/:id/archive`, `POST /projects/:id/restore`.
- `GET/POST /folders`, `PATCH/DELETE /folders/:id` (empty folders only).
- `GET/POST /tasks`, `PATCH/DELETE /tasks/:id`.
- `GET/POST /milestones`.
- `GET/POST /categories`, `GET/POST /technologies`.
- `GET /activity`, `GET /settings`.

All except health and login are admin protected. Project listing supports `page`, `limit`, `status`, and `q`.

Phase 3 dedicated business APIs (all admin authenticated; mutations require the trusted Origin/Referer check):

- `GET/POST /business/clients`, `GET/PATCH /business/clients/:id`, `POST /business/clients/:id/archive|restore`, `GET /business/clients/:id/related`, and `POST /business/clients/:id/communications`.
- `GET/POST /business/leads`, `GET/PATCH /business/leads/:id`, and explicit `POST /business/leads/:id/convert-client|convert-proposal`.
- `GET/POST /business/services`, `GET/PATCH /business/services/:id`, and service archive by `POST /business/services/:id/archive`.
- `GET/POST /business/proposals`, `GET/PATCH /business/proposals/:id`, status, duplicate, and accepted-proposal invoice conversion routes.
- `GET/POST /business/invoices`, draft update, issue, duplicate, cancellation, payment recording, and payment history routes. Payment reversal is recorded through `POST /business/payments/:id/reverse`.
- `GET/POST /business/transactions` (expense recording; verified income comes from invoice payments), transaction reversal, `GET /business/finance/summary`, project finance, and CSV export.
- `/business/test-cases`, execution history, `/business/technical-debt`, `/business/infrastructure`, `/business/deployments`, `/business/notifications`, `/business/reports/overview`, and read-only `/business/legacy-migration/preview`.
- `npm run migrate:business --workspace server` is dry-run by default. Applying requires `--apply --confirm-isolated-database`; run only with a URI for an isolated database copy, and optionally `--database-name=<expected-name>`.
