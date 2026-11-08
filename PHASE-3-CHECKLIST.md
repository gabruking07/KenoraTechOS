# Phase 3 implementation checklist

## Source inspection completed before implementation

- [x] Read Phase 1 implementation and acceptance reports and the Phase 2 report.
- [x] Inspect React app, routes, sidebar/module pages, project pages and dashboard.
- [x] Inspect Express app, authentication/authorization, API routes, validation patterns and security audit writer.
- [x] Inspect Mongoose schemas and indexes, existing project/task/milestone/document/activity/security structures.
- [x] Inspect `WorkspaceRecord` usage, module registry, allowed legacy fields, generic CRUD, and legacy export/restore behavior.
- [x] Inspect API/client package scripts and existing regression tests.
- [x] Inspect architecture, database schema, API reference and user guide.
- [x] Confirm Phase 1 and Phase 2 reports record external integration verification limits.
- [x] Do not inspect environment files or access a production database.

## Baseline findings

- Projects, tasks, milestones, folders, categories, technology, documents, activity, backups, and Phase 2 security events have dedicated MongoDB models.
- Clients, leads, proposals, invoices, finance/transactions, testing, technical debt, infrastructure, deployments, and notifications are currently generic `WorkspaceRecord` modules with mixed `fields`; no data migration or real financial ledger exists.
- Generic records use paginated list/create/update/delete endpoints; existing record IDs and arbitrary compatible field data are retained in MongoDB and full backups.
- Dashboard finance values use manually entered project budget/expense/revenue fields and are not verified financial transactions.
- Project detail tabs render business module records as generic summaries; sidebar navigation includes the existing business modules.
- API authorization is single-admin via Phase 2 middleware. Activity/security event infrastructure exists. No isolated MongoDB fixture is available.
- No `.env` file will be read, printed, modified, or included; no production database or migration will be used.

## Implementation and verification

- [x] Add dedicated, additive business models, validation, indexes and referential checks while retaining legacy records/routes (operations are single-admin and aggregate project selectors are presently limited to 100 rows).
- [x] Add safe dry-run/idempotent legacy record migration with traceable source IDs and failure reporting; do not run it automatically. Proposals, invoices and unverified legacy income are intentionally reported for manual review.
- [x] Add server-side business routes and core workflows for CRM, service catalog, proposals, invoices, transactions/payments, operations records and in-app notifications; see report for UI and workflow limitations.
- [x] Add integer-minor-unit money calculations, invoice balance/status rules and currency-isolated financial totals.
- [x] Connect business pages to dedicated endpoints while retaining legacy record routes. Some detail/history/report workflows remain limited and are listed in the report.
- [x] Add activity/security audit writes for core business changes and retain existing admin/CSRF middleware.
- [x] Add isolated calculation, mapping and unauthenticated-access tests. MongoDB-backed business, migration and financial route workflows remain blocked.
- [x] Run typechecks, all automated tests and builds; lint is not configured.
- [x] Write `PHASE-3-REPORT.md` with evidence, limits, rollback and manual checks.

## Acceptance boundaries

- [x] Preserve existing project IDs, generic records, documents, users, activity and security events through additive schemas/backups; no drops/resets or production migration was run.
- [x] No Phase 4 AI/automation work or unrelated redesign.
- [x] Do not claim production readiness or external integration verification without evidence.
