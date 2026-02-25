# Releases

## URLs
- Staging: https://www.terapixel.games/staging/
- Production: https://www.terapixel.games/

## Deployment Model
- Push to `main` triggers `Deploy Staging`, which publishes build output to `/staging/` on `gh-pages`.
- Production site origin is hosted on Google Cloud and served at `/` through Cloudflare edge routing.
- `/api/*` routes to prod `terapixel-platform`; `/staging/api/*` routes to staging `terapixel-platform`.
- `/staging/*` remains served from `gh-pages` for rehearsal.

## Cut a Release
1. Ensure the target commit is on `main` and verified on staging (`/staging/`).
2. Deploy/update the Google Cloud production site origin.
3. Confirm Cloudflare edge router points `/` to prod origin and `/staging` to `gh-pages`.
4. Verify production URL and capture verification notes in the related Issue/PR.

## Failure Handling
- If staging deploy fails, `Deploy Failure To Issue` creates or updates a staging failure Issue.
- If prod origin deploy fails, `Deploy Failure To Issue` creates or updates a prod failure Issue.
- Incident owner defaults to `agent:devops`.
