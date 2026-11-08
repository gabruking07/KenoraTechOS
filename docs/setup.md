# Setup

1. Install Node.js 20+ and obtain a MongoDB URI.
2. From repository root: `Copy-Item server/.env.example server/.env` and `Copy-Item client/.env.example client/.env`.
3. Set `MONGODB_URI`, `SESSION_SECRET` (at least 32 characters), `ADMIN_EMAIL`, and `ADMIN_PASSWORD` (at least 12 characters) in `server/.env`.
4. Run `npm.cmd install`, `npm.cmd run seed:admin --workspace server`, `npm.cmd run seed:projects`, `npm.cmd run dev`.
5. Visit `http://localhost:5173`.

Backend environment values are listed in `server/.env.example`. Provider credentials are optional. Do not put server credentials into client environment variables.
