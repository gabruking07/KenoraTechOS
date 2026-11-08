# KenoraTech OS

A private project portfolio and business operations workspace. The client and API are separated into `client/` and `server/`. Project, folder, task, milestone, identity, and activity records are persisted in MongoDB. Unknown project details remain unassessed.

## Requirements

- Node.js 20 or newer and npm
- A MongoDB Atlas connection string or local MongoDB instance

## Windows PowerShell setup

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
# Edit server/.env: set MONGODB_URI and generate SESSION_SECRET (32+ random characters).
npm.cmd install
npm.cmd run seed:admin --workspace server
npm.cmd run seed:projects
npm.cmd run dev
```

Open <http://localhost:5173>. The application has no public registration. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env` before seeding the first admin. An existing account is never overwritten by the seed script.

## Scripts

`npm run dev`, `npm run dev:client`, `npm run dev:server`, `npm run build`, `npm run build:client`, `npm run build:server`, `npm run typecheck`, `npm run seed:projects`, and `npm run seed:admin`.

## Implemented today

- Dark and light responsive shell, sidebar navigation, admin login/logout, and MongoDB-backed dashboard metrics.
- Project list with server-side search/filter/pagination, project detail view, create/edit/archive/restore/duplicate/delete, dashboard aggregates, activity records, and idempotent import of the 23 supplied project names.
- Mongo-backed folder creation/rename/delete, task CRUD and status updates with a Kanban view, milestone CRUD/status, category and technology creation.
- Persisted record workflows for clients, leads, services, proposals, invoices, finance, security findings, technical debt, testing, documents metadata, notifications, deployments and infrastructure metadata.
- Private document upload, download, replacement/version history and deletion. Files are stored outside the public web root.
- JSON metadata export/import for projects, folders, catalogs, tasks, milestones and workspace records. Existing IDs are skipped; invalid rows are counted and skipped.
- MongoDB metadata backup creation, download and confirmed additive restore. Restore does not delete or overwrite current records.
- Session cookies use HttpOnly, SameSite=Lax; secure cookies are enabled in production. Login has rate limiting, server responses use Helmet and centralized errors, inputs are validated.
- Configurable integration states do not fabricate provider data.

## Current limitations

This does not yet implement every requirement in the master prompt. Read-only recent GitHub issue, pull request, commit, and Vercel/Render deployment feeds are implemented, with available recent build log entries; project links and server-side provider credentials are required. OAuth, webhooks, live log streaming, AI requests, automated deployment health checks, drag-and-drop Kanban, nested-folder move UI, full client/invoice relationships, CSV/ZIP import, scheduled notifications, richer finance reports, and the Windows companion remain outstanding. Integration status shows configured credentials, not a guaranteed live provider connection. The dashboard uses saved MongoDB data and does not fabricate monthly or provider metrics. MongoDB and administrator credentials must be configured locally. Uploaded file contents are stored separately and are not included in metadata exports or snapshots.

## Verification

`npm run typecheck`, `npm run build`, and `npm test` have been run successfully. The test suite currently checks public API health and protected dashboard access (2 tests). Full CRUD and authentication tests require a configured MongoDB URI and are not yet included. The client build currently emits two JavaScript chunks of about 323 kB each (before gzip).

See `docs/` for architecture, data model, API, setup, security, integrations, deployment and usage notes.
