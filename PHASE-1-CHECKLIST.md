# Phase 1 implementation checklist

## Existing behavior and compatibility notes

- [x] Inspected the React 19/Vite client, Express 5/TypeScript API, Mongoose models, routes, middleware, test setup, and Render/Vercel deployment notes.
- [x] Identified document upload, replacement, current/version download, and deletion. Bytes currently live in `server/uploads`; metadata and prior versions live in MongoDB.
- [x] Identified existing data transfer: `/export` and `/import` handle metadata only; `/backups` stores metadata snapshots in MongoDB and restores additively, skipping failures silently.
- [x] Mapped references: Project→Category/Folder; Folder→parent Folder and optional Project; Task→Project/Milestone; Milestone→Project/dependent Milestones; WorkspaceRecord→project ID in mixed `fields`; StoredDocument→Project and embedded versions; ActivityLog→entity type/id. There is no enforced FK layer in MongoDB.
- [x] Recorded current safeguards: project/folder deletion has partial restrict checks; task and milestone deletes do not check incoming references; document deletion removes all local file versions.
- [x] Recorded fixed reads: tasks 200, activity 100, workspace records 500, projects 25 default/100 max, dashboard all active projects, documents/folders/catalogs unpaginated.
- [x] Deployment uses Vite static hosting and a Node API; sessions use MongoDB when configured, while document storage assumes a local writable filesystem.
- [x] Compatibility constraints: preserve `/api/v1` routes, existing `data` envelopes, current document metadata/version shapes, and clients that expect arrays; add pagination metadata while retaining arrays.

## Implementation

- [x] Add configurable local storage and a persistent authenticated HTTP object-storage gateway adapter; retain authenticated download/replacement behavior and add dry-run-first, verify-before-reference-update legacy migration.
- [x] Add integrity-checked schema-versioned full archive history, file checksums, backup validation, restore preview, and additive restore. Exclude active sessions/password hashes; do not recreate users from metadata-only identities.
- [x] Add relationship validation, protective project/folder/milestone deletion checks, safe import validation, and query indexes without destructive migrations.
- [x] Add compatible server-side pagination/search/sort and frontend controls for projects, tasks, folders, milestones, documents, activity, and workspace records.
- [x] Improve readiness reporting and deployment configuration guidance; add Vercel SPA fallback.
- [x] Add isolated storage/archive/access tests. Full database-backed route coverage remains limited because the repository has no isolated MongoDB test fixture.
- [x] Run type checks, tests, and production builds; report actual outcomes and remaining limitations.
- [x] Create `PHASE-1-REPORT.md` with configuration, migration, preservation, rollback, and manual verification instructions. Phase acceptance remains pending production storage configuration and isolated MongoDB verification.

## Data safety rules

- Never inspect or change `.env` files.
- Never drop collections, reset databases, or run destructive migrations.
- Migration tools must offer dry-run and verify-before-delete behavior.
- Restore remains additive by default and never overwrites a matching ID.
