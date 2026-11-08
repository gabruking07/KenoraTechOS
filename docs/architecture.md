# Architecture

`client/` is a React 19, TypeScript, Vite SPA. `server/` is an Express 5 API with Mongoose models and services kept out of client code. Requests use `/api/v1`; the client sends same-origin credentials to the configured API. The API rejects protected calls without a database-backed admin session. MongoDB stores records and sessions. The 23-project seed uses unique slugs and `$setOnInsert`.

## Request path

React Query → `client/src/services/api.ts` → Express security/session middleware → versioned router and Zod validation → Mongoose → MongoDB.

## Deliberate unknowns

Seeded projects have names, slugs, default planning status and “Not Assessed” quality fields. No project progress, cost, revenue, deployment or test result is inferred.
