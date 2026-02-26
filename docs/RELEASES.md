# Releases

## URLs
- Staging: https://www.terapixel.games/staging/
- Production: https://www.terapixel.games/

## Deployment Model
- Push to `main` triggers `Deploy Staging`, which publishes build output to `/staging/` on `gh-pages`.
- Tag `v*` triggers `Deploy Production`, which deploys the static production site to Cloud Run.
- Production traffic at `/` is served from Cloud Run through Cloudflare edge routing.
- `/api/*` routes to prod `terapixel-platform`; `/staging/api/*` routes to staging `terapixel-platform`.
- `/staging/*` remains served from `gh-pages` for rehearsal.

## Cut a Release
1. Ensure the target commit is on `main` and verified on staging (`/staging/`).
2. Create and push a semantic version tag (for example: `v0.2.0`) on the target commit.
3. Confirm `Deploy Production` succeeds and note the Cloud Run service URL.
4. Confirm Cloudflare edge router points `/` to prod origin and `/staging` to `gh-pages`.
5. Verify production URL and capture verification notes in the related Issue/PR.

## Required Production Variables
- `GCP_PROJECT_ID` (prod project, e.g. `terapixel-platform`)
- `GCP_REGION` (defaults to `us-central1`)
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`
- `CLOUDRUN_PROD_SITE_SERVICE` (defaults to `terapixel-games-web`)
- `CLOUDRUN_PROD_SITE_ALLOW_UNAUTHENTICATED` (`true` or `false`)
- `CLOUDRUN_PROD_SITE_DISABLE_INVOKER_IAM_CHECK` (defaults to `true`; recommended when org policy blocks `allUsers` IAM bindings)
- `CLOUDRUN_PROD_SITE_DEPLOY_FLAGS_JSON` (optional JSON array of extra Cloud Run deploy flags)

## Failure Handling
- If staging deploy fails, `Deploy Failure To Issue` creates or updates a staging failure Issue.
- If prod origin deploy fails, `Deploy Failure To Issue` creates or updates a prod failure Issue.
- Incident owner defaults to `agent:devops`.
