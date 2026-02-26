# Edge Routing (Cloudflare)

This repo now manages a Cloudflare Worker that routes traffic for both:
- `terapixel.games`
- `www.terapixel.games`

## Routing Table

- `/api/*` -> `EDGE_PROD_API_ORIGIN`
- `/staging/api/*` -> `EDGE_STAGING_API_ORIGIN`
- `/admin*` -> `EDGE_PROD_SITE_ORIGIN/index.html` (SPA fallback)
- `/staging/admin*` -> `EDGE_STAGING_SITE_ORIGIN/staging/index.html` (SPA fallback)
- `/staging/*` -> `EDGE_STAGING_SITE_ORIGIN`
- everything else -> `EDGE_PROD_SITE_ORIGIN`

The Worker route is configured in:
- `cloudflare/edge-router/wrangler.toml`

The Worker source is:
- `cloudflare/edge-router/src/index.js`

## Required GitHub Configuration

Repository secrets:
- `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit + Zone Workers Routes Edit + Zone Read)
- `CLOUDFLARE_ACCOUNT_ID`

Repository variables:
- `EDGE_PROD_SITE_ORIGIN` (Google Cloud prod site origin, e.g. `https://terapixel-games-web-xxxxx-uc.a.run.app`)
- `EDGE_STAGING_SITE_ORIGIN` (GitHub Pages origin that contains `/staging/`, e.g. `https://terapixelgames.github.io/terapixel.games`)
- `EDGE_PROD_API_ORIGIN` (prod terapixel-platform endpoint, e.g. `https://terapixel-control-plane-xxxxx-uc.a.run.app`)
- `EDGE_STAGING_API_ORIGIN` (staging terapixel-platform endpoint, e.g. `https://terapixel-control-plane-xxxxx-uc.a.run.app`)

## Deploy

Automatic:
- Push to `main` with changes in `cloudflare/edge-router/**` triggers `.github/workflows/deploy-edge-router.yml`.

Manual:
```bash
wrangler deploy --config cloudflare/edge-router/wrangler.toml \
  --var "PROD_SITE_ORIGIN:https://<prod-site-origin>" \
  --var "STAGING_SITE_ORIGIN:https://<gh-pages-origin>" \
  --var "PROD_API_ORIGIN:https://<prod-api-origin>" \
  --var "STAGING_API_ORIGIN:https://<staging-api-origin>"
```

## Verification

Check route behavior after deploy:
```bash
curl -I https://www.terapixel.games/
curl -I https://www.terapixel.games/staging/
curl -I https://www.terapixel.games/api/health
curl -I https://www.terapixel.games/staging/api/health
curl -I https://www.terapixel.games/admin
curl -I https://www.terapixel.games/_edge/health
```

Expected:
- `/_edge/health` returns JSON from the Worker.
- `/staging/` serves staging site content from GitHub Pages origin.
- `/api/*` and `/staging/api/*` are proxied to prod/staging platform endpoints.
- `/admin*` resolves through the site SPA entrypoint instead of returning origin 404.
