# Phase 2 implementation checklist

## Inspection completed before implementation

- [x] Read the Phase 1 implementation and acceptance reports and security/deployment docs.
- [x] Inspect Express app setup, API routes, auth middleware, MongoDB models, session setup, seed behavior, document storage routes, activity records, and current tests.
- [x] Inspect client login, route shell, settings/security UI, and existing design components.
- [x] Confirm no existing isolated MongoDB fixture and no existing TOTP, QR, SMTP, or password-reset dependency.
- [x] Avoid environment files and production infrastructure.

## Implementation plan

- [x] Add centralized admin authorization, secure auth/session helpers, correlation IDs, and append-only security event records.
- [x] Harden login throttling, generic failures, cookie/session settings, CSRF origin/referer checks, and security headers.
- [x] Implement authenticated password change and hashed, expiring, single-use password reset with an explicit email adapter.
- [x] Implement optional encrypted TOTP enrollment, QR flow, login verification, recovery codes, and rate limits without enabling it for existing admins.
- [x] Add safe session listing/revocation and a security dashboard with actual status and events.
- [x] Inspect and harden upload validation/signatures, download authorization, replacement/versioning, deletion recovery, and malware scanner integration boundary.
- [x] Record security-sensitive events without credentials, tokens, or session identifiers; prevent ordinary API edits.
- [x] Add isolated automated coverage for testable behavior; database/SMTP/scanner integration remains unverified where external fixtures are unavailable.
- [x] Run type checks, tests, and builds; no lint script is configured.
- [x] Create `PHASE-2-REPORT.md` with exact verification status, configuration, rollback, risks, and manual checks.

## Acceptance boundaries

- Preserve the existing administrator account and current login/session compatibility where safe.
- No public registration, invitations, tenants, collection drops, database reset, or production migrations.
- Phase 1 remains explicitly not fully verified; do not claim otherwise.
- No Phase 3 or Phase 4 work.
