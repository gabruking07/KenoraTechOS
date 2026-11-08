# KenoraTech OS — combined audit bug report

Only defects confirmed by source review with a clear unsafe behavior or an executed reproduction are listed here. Potential risks and unverified requirements belong in the audit and readiness reports, not this confirmed-bug list.

## KT-AUD-001 — Request logs retained query-string content

- **Severity:** Medium
- **Affected phase/module:** Phase 4 operations / Phase 2 privacy logging
- **Status:** Fixed; regression test added and passed.
- **Reproduction:** Send an API request with private text in the query string (for example the global search term) and inspect the Morgan request log.
- **Root cause:** Morgan's `:url` token includes the query string, so search terms and other query values were written to request logs.
- **Fix:** Request logging now uses a bounded path token based on `originalUrl` with everything after `?` removed. It retains the route path and omits query parameters.
- **Regression test:** `server/tests/integration/requestContext.test.ts` verifies that a URL containing a private query value logs only `/api/v1/search`.
- **Data impact:** No stored user data was changed. No production logs were accessed.
