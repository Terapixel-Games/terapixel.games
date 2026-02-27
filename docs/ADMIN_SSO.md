# Access SSO (Cloudflare Access + Google Workspace)

This repo includes automation to configure protected paths with Cloudflare Access.

## What it configures

- Finds or creates a Google Workspace identity provider in Cloudflare Zero Trust.
- Finds or creates self-hosted Access apps for protected paths.
- Finds or creates an Access policy that allows only a specified email domain.

Script:
- `scripts/cloudflare/setup-admin-access.sh`

Workflow:
- `.github/workflows/setup-admin-access.yml`
- `.github/workflows/setup-zero-trust-access.yml`

## Required token scopes

Create a scoped API token with at least:

- `Account -> Access: Organizations, Identity Providers, and Groups -> Edit`
- `Account -> Access: Apps and Policies -> Edit`
- `Account -> Access: Apps and Policies -> Read`
- `Account -> Access: Organizations, Identity Providers, and Groups -> Read`

Resource scope:
- Account: your Cloudflare account that owns `terapixel.games`.

## GitHub configuration

Required secrets:

- `CLOUDFLARE_API_TOKEN_ACCESS`
- `CLOUDFLARE_ACCOUNT_ID`

Optional secrets (needed only when creating a new Google IdP):

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Optional variable:

- `GOOGLE_APPS_DOMAIN` (defaults to `terapixel.games`)

## Protected path defaults

`Setup Zero Trust Access` configures:

- `terapixel.games/admin`
- `terapixel.games/staging`
- `terapixel.games/nakama/lumarush/console`
- `terapixel.games/nakama/color-crunch/console`

## Run from CLI

Example (apply):

```bash
export CLOUDFLARE_API_TOKEN='<token>'
export CLOUDFLARE_ACCOUNT_ID='945482779cce20ab534c3ea82deb55e4'
export ACCESS_APP_DOMAIN='terapixel.games/staging'
export ACCESS_ALLOWED_EMAIL_DOMAIN='terapixel.games'
export ACCESS_IDP_TYPE='google-apps'
export GOOGLE_APPS_DOMAIN='terapixel.games'
export GOOGLE_OAUTH_CLIENT_ID='<google-client-id>'
export GOOGLE_OAUTH_CLIENT_SECRET='<google-client-secret>'

bash scripts/cloudflare/setup-admin-access.sh
```

Example (dry run):

```bash
DRY_RUN=true bash scripts/cloudflare/setup-admin-access.sh
```

## Run from GitHub Actions

Use workflow **Setup Admin Access** and provide:

- `app_domain` (default `terapixel.games/admin`)
- `allowed_email_domain` (default `terapixel.games`)
- `idp_type` (`google-apps` recommended for Workspace)
- `dry_run` if you want preview mode.

Use workflow **Setup Zero Trust Access** to configure all standard protected paths in one run.
