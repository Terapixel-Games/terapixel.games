# Edge Routing (Cloudflare)

This repo now manages a Cloudflare Worker that routes selected paths for both:
- `terapixel.games`
- `www.terapixel.games`

Legacy note:
- `terapixel-api-proxy` is retired. Do not attach any routes to it.
- Active production worker is `terapixel-edge-router` only.

Worker route scope:
- `/*`

## Routing Table

- `/api/*` -> `EDGE_PROD_API_ORIGIN`
- `/nakama/lumarush/*` -> `EDGE_NAKAMA_LUMARUSH_ORIGIN`
- `/nakama/color-crunch/*` -> `EDGE_NAKAMA_COLOR_CRUNCH_ORIGIN`
- `/nakama/speedsolitaire/*` -> `EDGE_NAKAMA_SPEEDSOLITAIRE_ORIGIN`
- `/v1/admin*` -> `EDGE_CONTROL_PLANE_ORIGIN`
- `/staging/api/*` -> `EDGE_STAGING_API_ORIGIN`
- `/staging/nakama/lumarush/*` -> `EDGE_STAGING_NAKAMA_LUMARUSH_ORIGIN`
- `/staging/nakama/color-crunch/*` -> `EDGE_STAGING_NAKAMA_COLOR_CRUNCH_ORIGIN`
- `/staging/nakama/speedsolitaire/*` -> `EDGE_STAGING_NAKAMA_SPEEDSOLITAIRE_ORIGIN`
- `/admin*` -> `EDGE_CONTROL_PLANE_ORIGIN` (production control-plane admin UI/API)
- `/staging/admin*` -> `EDGE_STAGING_CONTROL_PLANE_ORIGIN` (staging control-plane admin UI/API)
- `/staging/v1/admin*` -> `EDGE_STAGING_CONTROL_PLANE_ORIGIN`
- `/staging/*` -> `EDGE_STAGING_SITE_ORIGIN`
- everything else -> `EDGE_PROD_SITE_ORIGIN`

Caching policy:
- `/staging/*`, `/staging/admin*`, `/nakama/*`, and API routes are returned with `Cache-Control: no-store` to avoid stale artifacts.
- `/admin*` is also forced `Cache-Control: no-store`.

Ingress guard:
- Edge router attaches `x-terapixel-origin-secret` when proxying:
  - `/api/*`, `/staging/api/*`
  - `/admin*`, `/staging/admin*`, `/v1/admin*`, `/staging/v1/admin*`
- Platform origins should reject direct requests that do not include a valid secret.

The Worker route is configured in:
- `cloudflare/edge-router/wrangler.toml`

The Worker source is:
- `cloudflare/edge-router/src/index.js`

## Required GitHub Configuration

Repository secrets:
- `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit + Zone Workers Routes Edit + Zone Read)
- `CLOUDFLARE_ACCOUNT_ID`
- `EDGE_ORIGIN_AUTH_SECRET_PROD` (origin guard secret for prod API/control-plane)
- `EDGE_ORIGIN_AUTH_SECRET_STAGING` (origin guard secret for staging API/control-plane)

Repository variables:
- `EDGE_PROD_SITE_ORIGIN` (Google Cloud prod site origin, e.g. `https://terapixel-games-web-xxxxx-uc.a.run.app`)
- `EDGE_STAGING_SITE_ORIGIN` (GitHub Pages origin that contains `/staging/`, e.g. `https://terapixel-games.github.io/terapixel.games`)
- `EDGE_PROD_API_ORIGIN` (prod terapixel-platform endpoint, e.g. `https://terapixel-control-plane-xxxxx-uc.a.run.app`)
- `EDGE_STAGING_API_ORIGIN` (staging terapixel-platform endpoint, e.g. `https://terapixel-control-plane-xxxxx-uc.a.run.app`)
- `EDGE_CONTROL_PLANE_ORIGIN` (production control-plane admin endpoint)
- `EDGE_STAGING_CONTROL_PLANE_ORIGIN` (staging control-plane admin endpoint)
- `EDGE_NAKAMA_LUMARUSH_ORIGIN` (LumaRush Nakama origin)
- `EDGE_NAKAMA_COLOR_CRUNCH_ORIGIN` (Color Crunch Nakama origin)
- `EDGE_NAKAMA_SPEEDSOLITAIRE_ORIGIN` (SpeedSolitaire Nakama origin)
- `EDGE_STAGING_NAKAMA_LUMARUSH_ORIGIN` (staging LumaRush Nakama origin)
- `EDGE_STAGING_NAKAMA_COLOR_CRUNCH_ORIGIN` (staging Color Crunch Nakama origin)
- `EDGE_STAGING_NAKAMA_SPEEDSOLITAIRE_ORIGIN` (staging SpeedSolitaire Nakama origin)

## Deploy

Automatic:
- Push to `main` with changes in `cloudflare/edge-router/**` triggers `.github/workflows/deploy-edge-router.yml`.

Manual:
```bash
wrangler deploy --config cloudflare/edge-router/wrangler.toml \
  --var "PROD_SITE_ORIGIN:https://<prod-site-origin>" \
  --var "STAGING_SITE_ORIGIN:https://<gh-pages-origin>" \
  --var "PROD_API_ORIGIN:https://<prod-api-origin>" \
  --var "STAGING_API_ORIGIN:https://<staging-api-origin>" \
  --var "CONTROL_PLANE_ORIGIN:https://<prod-control-plane-origin>" \
  --var "STAGING_CONTROL_PLANE_ORIGIN:https://<staging-control-plane-origin>" \
  --var "NAKAMA_LUMARUSH_ORIGIN:https://<lumarush-nakama-origin>" \
  --var "NAKAMA_COLOR_CRUNCH_ORIGIN:https://<color-crunch-nakama-origin>" \
  --var "NAKAMA_SPEEDSOLITAIRE_ORIGIN:https://<speedsolitaire-nakama-origin>" \
  --var "STAGING_NAKAMA_LUMARUSH_ORIGIN:https://<staging-lumarush-nakama-origin>" \
  --var "STAGING_NAKAMA_COLOR_CRUNCH_ORIGIN:https://<staging-color-crunch-nakama-origin>" \
  --var "STAGING_NAKAMA_SPEEDSOLITAIRE_ORIGIN:https://<staging-speedsolitaire-nakama-origin>"
```

## Verification

Check route behavior after deploy:
```bash
curl -I https://www.terapixel.games/
curl -I https://www.terapixel.games/staging/
curl -I https://www.terapixel.games/api/health
curl -I https://www.terapixel.games/v1/admin/me
curl -I https://www.terapixel.games/staging/api/health
curl -I https://www.terapixel.games/admin
curl -I https://www.terapixel.games/nakama/lumarush/healthcheck
curl -I https://www.terapixel.games/nakama/color-crunch/healthcheck
curl -I https://www.terapixel.games/nakama/speedsolitaire/healthcheck
curl -I https://www.terapixel.games/staging/nakama/lumarush/healthcheck
curl -I https://www.terapixel.games/staging/nakama/color-crunch/healthcheck
curl -I https://www.terapixel.games/staging/nakama/speedsolitaire/healthcheck
curl -I https://www.terapixel.games/_edge/health
```

Expected:
- `/_edge/health` returns JSON from the Worker.
- `/staging/` serves staging site content from GitHub Pages origin.
- `/api/*` and `/staging/api/*` are proxied to prod/staging platform endpoints.
- `/nakama/*` and `/staging/nakama/*` are proxied to prod/staging game Nakama services.
- `/admin*` is proxied to production control-plane and protected by Cloudflare Access.
- `/staging/admin*` is proxied to staging control-plane.
