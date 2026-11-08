# Provider integrations

## Provider-native resource management

The primary development integrations are GitHub, Vercel, and Render. The API discovers provider resources directly and persists a cache keyed by provider, account context, resource type, and stable provider ID. Internal KenoraTechOS projects and manual links are not required. Existing project-based integrations remain available for compatibility.

The API process synchronizes providers at startup and on `PROVIDER_SYNC_INTERVAL_MS` (default 900000 ms, minimum 300000 ms). A manual Sync now action is available in each provider page. Provider failures are isolated; existing cached resources are retained after failed or partial discovery. No provider resource is automatically deleted. Sync history and provider health are stored in MongoDB.

Authenticated API endpoints (the existing admin and CSRF rules apply):

- `GET /api/v1/providers/health` and `GET /api/v1/providers/overview` report cached integration health and counts.
- `GET /api/v1/providers/resources` supports provider/type/search/status filters and bounded pagination.
- `GET /api/v1/providers/resources/:provider/:type/:externalId` loads a provider resource; GitHub repository detail includes actual branches, commits, issues, and pull requests.
- `POST /api/v1/providers/sync` syncs all providers or one provider; `GET /api/v1/providers/sync-history` returns recent runs.
- `POST /api/v1/providers/:provider/:externalId/redeploy` triggers a Vercel or Render deployment after explicit frontend confirmation. It returns the provider's accepted state, not a claim of success.

GitHub access is read-only. Vercel and Render deployment permissions should be limited to the intended projects/services. Tokens remain server-side.

## Backward-compatible project activity

The authenticated `GET /api/v1/provider-activity` endpoint reads provider metadata and maps it to linked projects. It checks provider identity before reporting a connection as connected, caches successful reads briefly, applies bounded request timeouts/retries/concurrency, caps the project scan at 50 projects per request, and returns redacted provider errors. Provider results may still be subject to the provider's own scopes, plan limits, and API rate limits.

The authenticated legacy `GET /api/v1/provider-projects` endpoint lists repositories, Vercel projects, and Render services visible to the configured credentials. The provider pages now use the persisted provider-native resource APIs above.

Configure provider credentials in the server's secret manager (or server process environment); do not place tokens in the browser build or project records:

- `GITHUB_TOKEN`: read access to repositories, branches, commits, issues, and pull requests.
- `VERCEL_ACCESS_TOKEN`: access to projects and deployments; redeploy requests require deploy permissions. `VERCEL_TEAM_ID` is optional for team resources.
- `RENDER_API_KEY`: access to services and deploy history; deploy requests require deploy permissions.
- `CLOUDFLARE_API_TOKEN`: token verification plus read access to zones and DNS records. Only zone names/status and DNS record type/name/proxy state are returned; record values are intentionally omitted.

No repository, Vercel project, or Render service needs to be linked to an internal project for discovery or provider-page actions. The legacy admin-only `POST /api/v1/projects/:id/deploy` endpoint remains for existing project workflows. KenoraTechOS does not push commits to GitHub; Git pushes remain part of your Git workflow, and connected hosts may auto-deploy after a push. Configuration presence alone is not a successful connection.

Provider credentials are configured as deployment secrets. This release does not provide a database credential editor or encrypted-at-rest provider credential store. The application never returns configured token values.

## Kenora AI Hub

The repository contains no Kenora AI Hub endpoint contract, SDK, request/response schema, or authentication specification. The current AI page reports the Hub as unavailable; no model requests or AI-generated content are made. Do not configure a guessed endpoint. Integration requires the official endpoint contract, authentication method, supported models, and usage metadata semantics.

The existing Gemini environment-key presence check was removed from user-visible status because no Gemini request adapter exists. No secrets or business records are sent to an AI provider.

## Email

SMTP is currently used only by the password-reset flow. Business notifications are in-app; reminder responses do not claim email delivery. Notification email delivery, retry state, and delivery history require a separate outbox implementation before being enabled.
