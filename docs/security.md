# Security

No public registration. Admin credentials are supplied only to the seed script through environment variables; password hashes use bcrypt. Sessions are stored in MongoDB, use an HttpOnly cookie, SameSite=Lax, 12-hour expiry, and Secure in production. Helmet, credentialed origin allowlisting, login rate limiting, bounded JSON input, Zod request validation and centralized error responses are enabled. Set a long random `SESSION_SECRET` and use HTTPS in production.

Unsafe authenticated requests require an exact `Origin` match to `CLIENT_URL`, in addition to SameSite=Lax cookies and credentialed CORS. This is the current CSRF mitigation and requires browser clients to send the expected Origin header. Never commit `.env` files.

## Phase 2 controls

- The administrator role is enforced by centralized authentication and permission middleware. The current role map grants workspace, security, backup, settings, and document permissions only to `admin`; user registration and multi-tenant access are not enabled.
- Login returns the same failure response for unknown and incorrect credentials, performs dummy bcrypt work, regenerates the session after successful authentication, and is limited to 8 attempts per IP per 15 minutes. MFA verification has a per-IP rate limit and a per-user lock after 5 bad codes for 15 minutes. The express-rate-limit store is process-local; deployments with multiple API processes need a shared rate-limit store to enforce IP limits across replicas.
- Session cookies remain HttpOnly, Secure in production, SameSite=Lax, and expire after 12 hours. Sessions are stored in MongoDB when the API connects. Password changes retain the current session and revoke the account's other sessions; resets invalidate all sessions. Session references shown in the security screen are HMAC-derived and cannot be used as session IDs.
- Mutating authenticated routes require an exact allowlisted Origin or Referer. `CLIENT_URL` is the primary client origin; optional `CORS_ALLOWED_ORIGINS` is a comma-separated list of additional exact origins. Do not use wildcards. Use HTTPS.
- Production frontend/API origins on unrelated registrable domains (for example, the default Vercel and Render hostnames) can be treated as third-party by browser cookie policies. Use custom domains under the same registrable domain, such as `app.example.com` and `api.example.com`, and keep `SameSite=Lax`; do not change cookies to `SameSite=None` to work around unrelated domains.

### Password recovery and MFA configuration

Password changes require the current password and a minimum 12-character mixed-case, numeric, and symbol policy. Reset requests return the same public response for eligible and ineligible accounts. Reset mail is sent only when SMTP is completely configured; otherwise no token is generated or disclosed and no email is claimed as sent.

Configure the API process with `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and optionally both `SMTP_USER` and `SMTP_PASS`. Set `SMTP_SECURE=true` for implicit TLS (port 465 is also treated as secure); submission ports such as 587 use STARTTLS. Provide SMTP credentials through the hosting secret manager. Delivery is not considered tested until a non-production mailbox receives a reset message.

Optional TOTP MFA requires `MFA_ENCRYPTION_KEY`, a persistent 32-byte key represented as 64 hexadecimal characters. Generate and store this key in the server secret manager before enabling MFA. Back it up securely and retain it across deploys: replacing it makes existing encrypted MFA secrets and recovery-code hashes unreadable. Enrollment requires the current password and a valid TOTP before activation. Existing users are not automatically enrolled. Recovery codes are shown once and stored only as keyed hashes.

Optional malware scanning uses `FILE_SCANNER_URL` and `FILE_SCANNER_TOKEN`. The API sends file bytes to that configured endpoint and accepts an upload only when the service returns a successful response with `{ "clean": true }`. If scanner settings are absent, uploads are signature-checked but not malware-scanned. No scanner is configured or considered verified by this repository.

Security events are append-only through the application API and include event type, actor/target where available, result, generated request correlation ID, and bounded non-secret metadata. Passwords, reset tokens, MFA/recovery codes, session IDs, and credentials are not stored in event metadata. Database administrators can still alter collections directly; protect the MongoDB account and audit backups accordingly.

### Schema and rollback

Phase 2 adds optional user security fields and a `SecurityEvent` collection/indexes. Existing administrator identity and password hash are preserved; no user migration, collection drop, reset, or credential replacement is required. Mongoose can create indexes automatically; if automatic index creation is disabled, review the schema and create the additive indexes explicitly with `createIndex`. Do not use `syncIndexes`.

Rollback the application code only after deciding how to handle newly stored MFA fields and security events. Do not remove the new fields/collection during rollback. If an administrator enables MFA before code rollback, use the still-running Phase 2 security UI to disable it first; otherwise roll forward to restore the compatible MFA routes. Preserve the encryption key and MongoDB records until recovery is verified.
