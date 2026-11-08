# KenoraTech OS — Phase 1 report

## 1. Existing architecture inspected

- Client: React 19, TypeScript, Vite, React Router, and React Query under `client/src`.
- API: Express 5, TypeScript, Zod validation, session authentication, and versioned routes under `server/src`.
- Persistence: Mongoose models in `server/src/models/index.ts`; MongoDB sessions through `connect-mongo`.
- Document flow: Multer accepted one 10 MB PDF/TXT/MD/PNG/JPEG file into a process-local `uploads` directory. MongoDB stored document metadata and embedded prior-version metadata. Authenticated routes handled download, replacement, and deletion.
- Backup/import flow: `/export` and `/import` handled metadata JSON. Earlier backups stored metadata snapshots in MongoDB and restored additively while silently skipping invalid rows.
- Relationships: Project→Category/Folder; Folder→parent Folder/Project; Task→Project/Milestone; Milestone→Project/dependent Milestones; WorkspaceRecord→project ID in mixed fields; StoredDocument→Project and embedded versions; ActivityLog→entity type/ID.
- Deletion behavior: Project and folder removal had partial restrict checks. Task and milestone deletes did not check incoming references.
- Deployment: Vercel static client and Render/Node API assumptions were documented, but no deployment manifests or configured production object-storage provider were present. The API previously assumed a local filesystem for document bytes.

## 2. Issues identified

- API-local document bytes could disappear on service replacement.
- Backups omitted users, activity, document metadata, version metadata, and document bytes; they had no checksum or integrity manifest.
- Restore had no preview or reference validation, and invalid rows could be skipped without a failure report.
- Task/milestone/folder/project relationship checks were inconsistent.
- Tasks, workspace records, documents, folders, milestones, and activity used unpaginated or fixed-size reads; the dashboard loaded every active project to calculate aggregates.
- Health reported success without checking database readiness or whether production document storage was ephemeral.
- No SPA rewrite was present for direct Vercel route refreshes.

## 3. Features implemented

- Added local and authenticated HTTP object-storage adapters. Existing upload, replacement, download, and version-download routes remain authenticated and keep their MongoDB metadata/version fields. Storage keys are UUID-validated; external storage credentials remain server-side.
- Added a dry-run-first legacy upload migration. Apply verifies each new object before changing its MongoDB reference and retains originals.
- Added compressed JSON Lines full backups with a versioned manifest, archive checksum, per-file checksums, byte counts, success/failure status, and a 256 MB uncompressed safety limit. They include all current operational models except backup-history snapshots; sessions and password hashes are excluded.
- Added archive, checksum, duplicate-ID, reference, file-integrity, and unique-value validation before restore. The UI previews changes and confirmed restore is additive. Existing IDs are skipped; conflicting unique values stop restore. Legacy metadata backups remain restorable with explicit failed-row reporting.
- Added relationship checks for project/folder/milestone deletion and validation for task, folder, workspace-record, and import references.
- Added server pagination and allowlisted sorting for projects, tasks, folders, milestones, documents, workspace records, and activity. The client now has pagination controls for these views. Dashboard aggregation no longer loads every active project.
- Added database/storage readiness reporting, clear database startup failure handling, Vercel SPA rewrites, and deployment/operations documentation.

## 4. Files created and modified

Created:

- `PHASE-1-CHECKLIST.md`
- `docs/phase-1-reliability.md`
- `client/vercel.json`
- `client/src/features/workspace/Pager.tsx`
- `server/src/services/documentStorage.ts`
- `server/src/services/backupArchive.ts`
- `server/src/services/migrateDocuments.ts`
- `server/tests/integration/reliability.test.ts`
- `PHASE-1-REPORT.md`

Modified:

- `server/src/routes/api.ts`
- `server/src/models/index.ts`
- `server/src/server.ts`
- `server/package.json`
- `server/tests/integration/api.test.ts`
- `client/src/services/api.ts`
- `client/src/features/workspace/Documents.tsx`
- `client/src/features/workspace/Tasks.tsx`
- `client/src/features/workspace/Collections.tsx`
- `client/src/features/workspace/RecordPage.tsx`
- `client/src/features/workspace/SystemPages.tsx`
- `docs/database-schema.md`
- `docs/deployment.md`

No `.env` or `.env.example` file was opened, printed, or modified. No production configuration was changed.

## 5. Database schema changes

- Extended the existing `Backup` schema with storage key, checksum, schema version, manifest, status, and failure fields. Existing inline metadata snapshots remain supported.
- Added list-query indexes for task updates, activity chronology, document names, and backup chronology/storage keys. Existing unique project slug, folder parent/name, catalog names, and document storage-key constraints remain.
- No collections were dropped, reset, or migrated. Index creation was not manually run against a database; deployments with automatic index creation disabled should review and add missing indexes with `createIndex`, never `syncIndexes`.

## 6. Migration instructions

1. Configure the private durable HTTP storage gateway and server process environment as described in [Phase 1 reliability operations](docs/phase-1-reliability.md).
2. Point `MONGODB_URI` at the intended database and set the correct `LEGACY_UPLOAD_DIR` if the old upload directory differs from the API working directory's `uploads` folder.
3. Run `npm run migrate:documents --workspace server` for a dry run.
4. Review missing-file counts and source paths. Then run `npm run migrate:documents --workspace server -- --apply`.
5. Verify current and prior-version downloads before any separately planned cleanup. The script does not delete originals.

The migration was not run here because it requires the user's actual database and storage endpoint.

## 7. Required production configuration

- Existing API settings: `MONGODB_URI`, a 32+ character `SESSION_SECRET`, `CLIENT_URL`, `NODE_ENV=production`, and `PORT`.
- Durable document storage: `STORAGE_PROVIDER=http`, `STORAGE_ENDPOINT`, and `STORAGE_TOKEN`.
- The configured private gateway must support bearer-authenticated `PUT /{uuid}`, `GET /{uuid}`, and `DELETE /{uuid}`. PUT must honor `If-None-Match: *` and return 412 for an existing key. Its backing objects must be durable.
- Existing client build setting: `VITE_API_BASE_URL` pointing at the API `/api/v1` URL.

The HTTP gateway adapter is implemented, but no vendor gateway, credentials, bucket, or production storage have been configured or verified. It is a gateway contract, not a direct S3/R2 vendor integration.

## 8. Existing data preservation measures

- No production database was connected to or modified, and no migration was run.
- No `.env` files were inspected or changed.
- Schema changes are additive. Existing metadata backups continue through the legacy restore path.
- Restore is additive only, checks for existing IDs and unique-value conflicts, and never replaces a matching record.
- Migration copies and verifies objects before changing references and never removes source files.
- Restore writes file objects with create-if-absent semantics and rejects different bytes at an existing key.
- Full backups omit password hashes, active sessions, and backup-history snapshots. User identity/role metadata is included but is not recreated during restore because login credentials are intentionally absent.

## 9. Tests executed and results

- `npm.cmd run typecheck` — passed for client and server.
- `npm.cmd test --workspace server` — passed: 2 test files, 6 tests.
- Tests cover local storage read/write/delete and path traversal rejection, backup checksum/envelope validation, unauthenticated document-route rejection, and degraded health without a database.

The repository has no isolated MongoDB test fixture. Authenticated upload/download/replacement/versioning, database-backed backup/restore, deletion dependency behavior, connection-failure recovery, and pagination queries were not exercised against an isolated database. The external HTTP gateway adapter was not tested against a configured gateway.

## 10. Build results

- `npm.cmd run build --workspace server` — passed.
- `npm.cmd run build --workspace client` — passed. Vite emitted a Node `module.register()` deprecation warning; the build completed successfully.

## 11. Remaining limitations

- Production requires an independently configured durable object-storage gateway. Until configured, health correctly reports production local storage as degraded.
- The backup archive is capped at 256 MB uncompressed. Restore validation materializes the bounded archive in memory; larger datasets need a future streaming restore implementation or partitioned archives.
- Additive restore is retryable and avoids overwrites, but it is not wrapped in a cross-collection transaction. A database failure can leave some newly added rows; retry skips created IDs. Review the result and retry after correcting the failure.
- User metadata is preserved in archives, but user accounts/password credentials cannot be restored by this backup format.
- Legacy `/export` remains metadata-only; full backups are available in the Backups workflow.
- The integration test suite does not yet cover authenticated document version operations or database-backed restore/deletion/pagination paths.
- No production storage migration, real backup/restore rehearsal, or deployment verification was performed.

## 12. Rollback and recovery

- Retain the legacy upload directory and storage objects until all migrated current/version downloads have been verified.
- To switch back to local storage, point the API to the prior local directory and confirm each document reference resolves. Files already moved to external storage must first be copied back and verified.
- Do not replace the live database wholesale with a backup. Restore into an isolated recovery environment first; use additive restore preview for targeted recovery.
- If additive restore stops after writing some records, retain the archive and objects, fix the reported conflict/connectivity issue, then retry. Existing IDs are skipped and verified matching object keys are reused.
- Keep MongoDB and object-storage backup copies independent.

## 13. Manual verification checklist

- [ ] Configure a non-production durable gateway and check `/api/v1/health` becomes ready.
- [ ] Upload, download, replace, download an earlier version, and delete a document through an authenticated session.
- [ ] Run migration dry-run against a copied legacy upload directory and isolated database; apply and verify object bytes and metadata references.
- [ ] Create a backup containing a versioned document; verify complete status, checksum metadata, and downloaded `.jsonl.gz` archive.
- [ ] Preview restore into an isolated database/storage location; confirm existing IDs and conflicts are reported correctly.
- [ ] Perform additive restore and verify projects, folders, records, document metadata, and file downloads.
- [ ] Check project/folder/milestone deletion blockers and server pagination/search/sort across multiple pages.
- [ ] Refresh a nested Vercel route directly in the browser.

## 14. Phase 1 completion status

**Implementation is in place, but Phase 1 is not fully production-verified.** Type checks, tests, and builds pass. Production storage configuration and isolated MongoDB integration/recovery tests remain necessary before declaring the reliability work fully accepted.
