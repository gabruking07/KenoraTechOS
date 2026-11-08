# Phase 1 reliability operations

## Document storage

Development uses `STORAGE_PROVIDER=local` (the default) and `LOCAL_STORAGE_DIR` (default: `uploads` under the API process working directory; set an explicit path if the service is launched from different directories). Production should use `STORAGE_PROVIDER=http`, `STORAGE_ENDPOINT`, and `STORAGE_TOKEN`. The configured endpoint is a private object-storage gateway: it must implement `PUT /{uuid}`, `GET /{uuid}`, and `DELETE /{uuid}` with a Bearer token. It must honor `If-None-Match: *` on PUT and return 412 if that key already exists. Store its objects in durable object storage; the API never sends the token to the browser. This adapter is a gateway contract, not a direct integration for a specific vendor.

The API health route reports `503 degraded` in production if local ephemeral storage is selected or the HTTP storage configuration is incomplete. Set the storage configuration before routing production traffic. `/api/v1/health` also reports the MongoDB connection state.

### Migrate legacy uploads

Run from the server workspace with `MONGODB_URI`, `STORAGE_PROVIDER=http`, `STORAGE_ENDPOINT`, and `STORAGE_TOKEN` supplied to the process environment. Do not put credentials in command history or source control.

```powershell
npm run migrate:documents --workspace server
npm run migrate:documents --workspace server -- --apply
```

The first command is a dry run. Apply uploads each current and versioned local file, verifies that the target can be read, and only then updates that file's MongoDB reference. Missing files are reported and left unchanged. Original local files are deliberately retained; review the output and verify downloads before any separately planned cleanup. Dry-run does not mutate data. If apply stops after an upload but before its database reference is updated, a retry may create an unreferenced extra object; the original remains available and no existing object is overwritten.

## Backups and restore

New backups are compressed JSON Lines archives stored through the configured document storage adapter. A SHA-256 digest covers the archive records; each included file has its own SHA-256 digest and byte count. The uncompressed archive is capped at 256 MB; a larger backup fails explicitly and is recorded as failed. Backups include projects, folders, catalogs, tasks, milestones, workspace records, activity, document metadata and versions, and user identity/role metadata. Password hashes, sessions, and provider credentials are excluded. User accounts are not recreated during additive restore because backups intentionally do not contain login credentials.

Create a backup and confirm its status is `complete`. Download and retain a copy outside the application database. Restore first calls the preview endpoint (the UI does this automatically); it validates the archive, IDs, references, and file hashes. Confirmed restore is additive and skips IDs already present. It never replaces an existing row. If a database failure interrupts a restore, the archive can be applied again; created rows are skipped, and original file keys are reused only when their contents match. A conflict with different bytes stops restore without overwriting the existing object. Inspect the restore response and verify the affected records and document downloads.

Legacy metadata-only backups remain additive and do not contain uploaded bytes. They are retained for compatibility and are labeled by their existing `kind` in history.

## Index and schema changes

The code adds non-destructive indexes for task/document/activity/backup list queries and optional backup metadata. No collections are dropped or reset. Existing unique slug, folder, category, technology, and storage-key constraints remain. Before deploying, check existing data for duplicate values if the deployment has disabled automatic Mongoose index creation. Create missing indexes with MongoDB `createIndex` after review; do not use `syncIndexes` because it may drop indexes.

## Rollback and recovery

1. Keep the legacy upload directory until every migrated document and version has been downloaded and verified.
2. To roll back the storage provider, restore the prior storage configuration and retain metadata references to their original local files. For files already migrated, use a verified download from the object gateway before switching back.
3. Do not roll back database records by replacing the live database with a backup automatically. Use the additive restore preview and restore into a separately reviewed recovery environment when broad recovery is needed.
4. If an additive restore stops partway through, keep the archive and the object-storage contents. Correct the reported unique-key or connectivity issue, then retry; matching record IDs are skipped.
5. Preserve the MongoDB backup and the external object-storage backup independently. The API archive alone does not protect against loss of both its database metadata and storage object.

## Manual checks

- Verify upload, replacement, current download, prior-version download, and deletion with a non-production account.
- Test migration against a copied upload directory and isolated database; inspect dry-run output before `--apply`.
- Create a backup with at least one versioned document; download it and run preview restore against an isolated database and storage bucket.
- Confirm a missing local file stops backup creation with a failed history entry and no completed partial backup.
- Confirm production health is degraded until durable storage is configured, then ready after MongoDB and storage are available.
- Refresh a nested client route such as `/projects` on the deployed Vercel static app.
