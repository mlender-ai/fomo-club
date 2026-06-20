# Deployment Runbook

This runbook assumes the current monorepo layout:

- web: [`apps/web`](../apps/web)
- api: [`apps/api`](../apps/api)
- shared: [`packages/shared`](../packages/shared)

## 1. Git Branch Strategy

Use the smallest workflow that still makes rollback obvious:

- `main`: production branch and only branch that should deploy to Vercel production and Railway production services
- `feature/*`: regular work branches, for example `feature/railway-runbook`
- `fix/*`: optional urgent patch branch when production needs a surgical fix

Branch rules:

- branch from `main`
- open a PR for every change, even for solo work
- merge with squash merge so production history stays easy to scan and revert

## 2. Commit and PR Convention

Recommended commit format:

- `feat(web): add agent console log stream`
- `fix(api): harden runtime state fallback`
- `docs(deploy): add rollback checklist`
- `chore(ci): split web and api build jobs`

Recommended PR flow:

1. Create `feature/*` from the latest `main`.
2. Push commits with one concern per commit.
3. Open a PR and fill the template.
4. Wait for CI to pass.
5. Validate the preview deployment and API compatibility.
6. Merge to `main`.
7. Let production deploy from `main`.

PR template: [`.github/pull_request_template.md`](../.github/pull_request_template.md)

## 3. CI Contract

Workflow file: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

CI verifies:

- install with `npm ci`
- Prisma client generation with `npm run prisma:generate`
- static repo checks with `npm run lint`
- type safety with `npm run typecheck`
- API workspace build with `npm --workspace @fomo/legacy-paper-api run build`
- web workspace build with `npm --workspace @fomo/backend run build`

This is the minimum gate before a merge to `main`.

## 4. Vercel Setup

Vercel should host only the web app.

Project settings:

- Git repository: this monorepo
- Root Directory: `apps/web`
- Production Branch: `main`
- Install Command: leave default or `npm install`
- Build Command: leave framework default or use `npm run build`
- Output: framework default for Next.js

Environment variables:

- `NEXT_PUBLIC_API_BASE_URL`: Railway API public URL, for example `https://your-api.up.railway.app`
- `API_PASSWORD`: same value as Railway `BOT_PASSWORD`
- `DASHBOARD_PASSWORD`: dashboard login password for web middleware and login page

Deploy policy:

- every non-`main` branch should create a Preview deployment
- `main` should create the Production deployment
- risky UI or contract changes should be preview-checked before merge

Operational notes:

- the web app proxies requests through `apps/web/app/api/*`, so the browser never needs the raw backend password
- if web and api change together, keep the backend contract backward-compatible for one deploy cycle when possible

## 5. Railway Setup

Create two Railway services from the same repository:

1. API service
2. Worker service

Keep the source directory as the repo root so npm workspaces resolve correctly.

### API service

- Build Command: `npm ci && npm run prisma:generate && npm --workspace @fomo/legacy-paper-api run build`
- Start Command: `npm --workspace @fomo/legacy-paper-api run start`
- Healthcheck path: `/health`

### Worker service

- Build Command: `npm ci && npm run prisma:generate && npm --workspace @fomo/legacy-paper-api run build`
- Start Command: `npm --workspace @fomo/legacy-paper-api run worker`

Recommended Railway settings:

- connect the service to the repo default branch
- use `main` as the deploy branch
- enable GitHub auto deploy only after CI is stable
- if available in your plan, enable “wait for CI” before deploy

Environment variables shared by API and worker:

- `DATABASE_URL`
- `BOT_PASSWORD`
- `CONFIG_ENCRYPTION_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_NOTIFICATIONS_ENABLED`
- `TELEGRAM_NOTIFY_SKIPPED`
- `WORKER_INTERVAL_MS`
- `LOCAL_DEMO_MODE=false`
- `REPORT_TIMEZONE`
- `DAILY_REPORT_HOUR`
- `WEEKLY_REPORT_HOUR`
- `WEEKLY_REPORT_DAY`
- `REPORT_PROVIDER`
- `MARKET_DATA_PROVIDER`

API-only environment variables:

- `PORT=4000`
- `FRONTEND_ORIGIN=https://your-web.vercel.app`

Future migration note:

- when production DB migrations are ready to automate, wire `npm run prisma:migrate:deploy` into a release or pre-deploy step before the API and worker start
- until then, run it manually before or immediately after the API deploy window

## 6. Deploy Order

Use this order for production changes:

1. Ensure `main` is green before merge.
2. Confirm the exact rollback target commit or deployment IDs.
3. If schema changed, run `npm run prisma:migrate:deploy` against production first.
4. Deploy Railway API from `main`.
5. Deploy Railway worker from `main`.
6. Verify `/health`, `/worker/status`, `/paper/status`, and Telegram notification path.
7. Let Vercel production deploy from `main`.
8. Verify the web console against the newly deployed API.

If the change is frontend-only:

1. merge after preview approval
2. let Vercel production deploy
3. smoke test the console

If the change is backend-only:

1. deploy Railway first
2. verify health and logs
3. confirm the web still works against the updated API

## 7. Seed, Migrate, Deploy Sequence

Local or staging:

1. `npm install`
2. `npm run prisma:generate`
3. `npm run prisma:migrate:dev -- --name <migration-name>`
4. `npm run prisma:seed`
5. `npm run ci`

Production:

1. `npm install`
2. `npm run prisma:generate`
3. `npm run prisma:migrate:deploy`
4. deploy Railway API
5. deploy Railway worker
6. deploy Vercel web

`prisma:seed` should not run automatically in production.

## 8. Rollback Procedure

### Vercel rollback

1. Open the affected Vercel project.
2. Find the last healthy deployment.
3. Promote that ready deployment back to production, or redeploy the last good production deployment.
4. Verify the home page, login gate, and API proxy routes.

### Railway rollback

1. Open the affected Railway service.
2. Go to Deployments.
3. Select the last healthy deployment.
4. Use Redeploy so Railway reuses the exact same code and build configuration.
5. Repeat for the worker if both services were changed.
6. Verify `/health`, worker heartbeat, and Telegram alerts.

### Database rollback

Do not assume schema rollback is safe.

- prefer additive migrations only
- if a migration breaks production, create a forward fix migration where possible
- use DB snapshot restore only when absolutely necessary and only after application rollback is blocked

## 9. Deployment Checklist

### Before deploy

- CI is green
- PR scope is understood
- preview deployment is checked
- production env diff is reviewed
- migration impact is reviewed
- rollback target deployment is identified

### Right after deploy

- Vercel production page loads
- Railway API `/health` returns `200`
- worker heartbeat updates
- `/worker/status` reports fresh timestamps
- `/paper/status` reflects live balance/equity
- main dashboard loads without proxy errors
- market overview renders
- Telegram notifications still send

### During rollback

- pause new merges to `main`
- redeploy the last healthy Railway API first if the API is broken
- redeploy worker if it shares the issue
- restore the last healthy Vercel deployment
- re-run the smoke test checklist
- document the failed commit and root cause before the next deploy

## 10. External Platform Notes

This runbook matches current official behavior:

- Vercel uses separate `Production`, `Preview`, and `Development` environments and applies `Production` env vars to the production branch deployment. Source: [Vercel environment variables](https://vercel.com/docs/environment-variables)
- Vercel production can be restored by promoting a preview deployment. Source: [Promoting a preview deployment to production](https://vercel.com/docs/deployments/promote-preview-to-production)
- Railway can redeploy an existing deployment and deploy the latest commit from the GitHub default branch. Sources: [Railway deployment actions](https://docs.railway.com/guides/deployment-actions), [Railway build and start commands](https://docs.railway.com/reference/build-and-start-commands), [Vercel project settings](https://vercel.com/docs/projects/project-configuration/project-settings)
