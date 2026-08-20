# Deploying the backend to Vercel

This backend is an Express app adapted to run as a **Vercel serverless function**.
Everything needed is already in the repo — follow the steps below.

## How it works

The whole app is **pre-bundled into a single file** with esbuild, so the deployed
function has no relative `../src/...` imports for Node's ESM loader to fail on
(that was the cause of the earlier `ERR_MODULE_NOT_FOUND` crashes). Third-party
packages stay external and load from `node_modules`.

| File | Purpose |
|------|---------|
| `src/vercel.ts` | Bundle entry — `import app from "./app"; export default app;`. |
| `api/index.js` | The **bundled** function esbuild produces (rebuilt on every install). This is what Vercel runs. |
| `build:vercel` (package.json) | `esbuild src/vercel.ts --bundle --format=esm --packages=external → api/index.js`. |
| `postinstall` (package.json) | `prisma generate && npm run build:vercel` — regenerates the client and rebuilds the bundle on Vercel. |
| `vercel.json` | Routes every path to `api/index.js` and bundles the Prisma engine (`includeFiles`). |
| `src/lib/prisma.ts` | Reuses one Pool + PrismaClient across warm invocations (won't exhaust DB connections). |
| `prisma/schemas/base.prisma` | `binaryTargets` includes `rhel-openssl-3.0.x` so the query engine matches Vercel's runtime. |
| `src/config/env.ts` | Invalid env no longer crashes the function — it returns a readable `500` (env-guard in `app.ts`). |

Local development is unchanged: `npm run dev` still uses `src/server.ts` (which calls `app.listen()`).

## Step 1 — Import the project

1. In Vercel, **New Project → import this Git repo**.
2. **Set the Root Directory to `backend`. This is REQUIRED and non-negotiable.** The repo is a monorepo (it also contains the frontends), so Vercel must build from `backend/` — that's where `package.json` (deps), `vercel.json`, and `api/` live. If the deploy logs show paths like `/var/task/**backend**/...`, the Root Directory is still wrong.
   - Path in the dashboard: **Settings → General → Root Directory → Edit → type `backend` → Save**, then redeploy.
3. Leave the **Build Command** and **Output Directory** empty — `vercel.json` drives the build. (Do **not** set the build command to `npm run build`; that script runs `prisma migrate deploy`, which you don't want here.)

## Step 2 — Environment variables

Add these under **Project → Settings → Environment Variables** (Production, and Preview if you use it). They must be available at **build time too** (Vercel's default), because `prisma generate` reads `DATABASE_URL`.

**Required:**

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Use the Neon **pooled** connection string (the host with `-pooler`). Serverless opens many short-lived connections; the pooler prevents exhausting the DB. |
| `CLIENT_URL` | Your production frontend origin (e.g. `https://app.example.com`) — used by CORS. |
| `JWT_SECRET` | ≥ 32 chars. |
| `ACCESS_TOKEN_SECRET` | ≥ 32 chars. |
| `REFRESH_TOKEN_SECRET` | ≥ 32 chars. |

**Optional (sensible defaults if omitted):** `ACCESS_TOKEN_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`, `JWT_EXPIRES_IN`, `BCRYPT_SALT_ROUNDS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `TRUST_PROXY_HOPS` (default `1`, correct for Vercel), `DB_POOL_MAX`, `LOG_LEVEL`.

> `NODE_ENV` is set to `production` automatically by Vercel for production deployments — you don't need to add it. The error handler only exposes internal messages/stack when `NODE_ENV === "development"`, so production stays safe by default.

## Step 3 — Deploy

Push to the connected branch (or click **Deploy**). Vercel will:

1. `npm install` → `postinstall` runs `prisma generate` (produces the Linux engine on Vercel).
2. Build `api/index.ts` with `@vercel/node`, bundling `src/generated/prisma/**` (engine included).
3. Route all traffic to the function.

## Step 4 — Verify

- `GET https://<your-deployment>/health` → `{ "status": "ok", ... }`
- `GET https://<your-deployment>/api/v1/admin/overview` → `401` (auth required — proves routing + guards work).

## Troubleshooting

### `500: FUNCTION_INVOCATION_FAILED`
The function crashed **during initialization**. The entry point now catches init
failures and returns a readable JSON body instead of an opaque crash, so hit the
URL again and read the `error` field, e.g.:
```json
{ "success": false, "message": "Backend failed to initialize.",
  "error": "Invalid or missing environment variables: {\"JWT_SECRET\":[\"String must contain at least 32 character(s)\"]}" }
```
Also check **Deployments → [latest] → Runtime Logs** for the full stack.

Most common causes:
1. **Missing/invalid env var** — the `error` field names the field(s). Fix: add
   it under Settings → Environment Variables for the **Production** environment
   (secrets must be ≥ 32 chars; `DATABASE_URL` must be a valid URL). Re-deploy.
2. **Wrong Root Directory** — must be `backend` (see Step 1).
3. **Prisma engine** — if the error mentions the query engine, confirm the build
   ran `prisma generate` (it's in `postinstall`) and that `vercel.json`'s
   `includeFiles` is present.

> **Region:** on the Hobby plan the function deploys to your account's default
> region regardless of `regions` in `vercel.json`. For lowest DB latency, keep
> the app and the Neon database in the same region (this app targets `iad1` /
> Neon `us-east-1`).

## Notes & caveats

- **Database:** always point `DATABASE_URL` at the **pooled** Neon endpoint for serverless. Run schema changes with `npm run migrate` (`prisma db push`) from your machine, **not** during the Vercel build.
- **Rate limiting** uses an in-memory store, so limits are **per serverless instance**, not global. That's fine for basic abuse protection; for strict global limits, back the limiter with Redis/Upstash (`@upstash/redis` is already a dependency).
- **Cookies** are `Secure` + `SameSite=None` — they work over Vercel's HTTPS. The frontend must call the API with credentials (`fetch(url, { credentials: "include" })`), and `CLIENT_URL` must match its origin.
- **Cold starts:** the first request after idle pays Prisma connect + pool setup; subsequent warm requests reuse them.