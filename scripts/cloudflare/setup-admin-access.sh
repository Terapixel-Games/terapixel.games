#!/usr/bin/env bash
set -euo pipefail

API_BASE="https://api.cloudflare.com/client/v4"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required env var: $key" >&2
    exit 1
  fi
}

bool_true() {
  local v="${1:-}"
  [[ "$v" == "1" || "$v" == "true" || "$v" == "TRUE" || "$v" == "yes" || "$v" == "YES" ]]
}

api_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local url="${API_BASE}${path}"
  local raw_response
  local response
  local http_code

  if bool_true "${DRY_RUN:-false}" && [[ "$method" != "GET" ]]; then
    echo "[dry-run] ${method} ${url}" >&2
    if [[ -n "$body" ]]; then
      echo "$body" | jq . >&2
    fi
    echo '{"success":true,"result":{}}'
    return 0
  fi

  if [[ -n "$body" ]]; then
    raw_response="$(curl -sS -X "$method" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$body" \
      "$url" \
      -w $'\n%{http_code}')"
  else
    raw_response="$(curl -sS -X "$method" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      "$url" \
      -w $'\n%{http_code}')"
  fi

  http_code="$(tail -n 1 <<<"$raw_response" | tr -d '\r')"
  response="$(sed '$d' <<<"$raw_response")"

  if [[ "$http_code" -lt 200 || "$http_code" -gt 299 ]]; then
    echo "Cloudflare API request failed: ${method} ${path} (HTTP ${http_code})" >&2
    if [[ -n "$response" ]]; then
      if jq -e . >/dev/null 2>&1 <<<"$response"; then
        echo "$response" | jq . >&2
      else
        echo "$response" >&2
      fi
    fi
    exit 1
  fi

  if [[ "$(jq -r '.success // false' <<<"$response")" != "true" ]]; then
    echo "Cloudflare API request failed: ${method} ${path}" >&2
    echo "$response" | jq . >&2
    exit 1
  fi

  echo "$response"
}

require_cmd curl
require_cmd jq

require_env CLOUDFLARE_API_TOKEN
require_env CLOUDFLARE_ACCOUNT_ID

ACCESS_APP_DOMAIN="${ACCESS_APP_DOMAIN:-terapixel.games/admin}"
ACCESS_APP_NAME="${ACCESS_APP_NAME:-TeraPixel Admin}"
ACCESS_SESSION_DURATION="${ACCESS_SESSION_DURATION:-12h}"
ACCESS_POLICY_NAME="${ACCESS_POLICY_NAME:-TeraPixel Admin - Workspace Only}"
ACCESS_POLICY_DECISION="${ACCESS_POLICY_DECISION:-allow}"
ACCESS_POLICY_PRECEDENCE="${ACCESS_POLICY_PRECEDENCE:-}"
ACCESS_ALLOWED_EMAIL_DOMAIN="${ACCESS_ALLOWED_EMAIL_DOMAIN:-terapixel.games}"
ACCESS_IDP_NAME="${ACCESS_IDP_NAME:-Google Workspace}"
ACCESS_IDP_TYPE="${ACCESS_IDP_TYPE:-google-apps}"
GOOGLE_APPS_DOMAIN="${GOOGLE_APPS_DOMAIN:-terapixel.games}"
ACCESS_IDP_ID="${ACCESS_IDP_ID:-}"

echo "Resolving Access identity provider..."

if [[ -z "$ACCESS_IDP_ID" ]]; then
  idp_list="$(api_request GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/identity_providers")"
  ACCESS_IDP_ID="$(jq -r --arg name "$ACCESS_IDP_NAME" --arg type "$ACCESS_IDP_TYPE" '
    .result
    | (map(select(.name == $name)) + map(select(.type == $type)))
    | .[0].id // empty
  ' <<<"$idp_list")"
fi

if [[ -z "$ACCESS_IDP_ID" ]]; then
  if [[ -n "${GOOGLE_OAUTH_CLIENT_ID:-}" && -n "${GOOGLE_OAUTH_CLIENT_SECRET:-}" ]]; then
    if [[ "$ACCESS_IDP_TYPE" == "google-apps" ]]; then
      idp_payload="$(jq -n \
        --arg name "$ACCESS_IDP_NAME" \
        --arg type "$ACCESS_IDP_TYPE" \
        --arg client_id "$GOOGLE_OAUTH_CLIENT_ID" \
        --arg client_secret "$GOOGLE_OAUTH_CLIENT_SECRET" \
        --arg apps_domain "$GOOGLE_APPS_DOMAIN" '
          {
            name: $name,
            type: $type,
            config: {
              client_id: $client_id,
              client_secret: $client_secret,
              apps_domain: $apps_domain
            }
          }
        ')"
    else
      idp_payload="$(jq -n \
        --arg name "$ACCESS_IDP_NAME" \
        --arg type "$ACCESS_IDP_TYPE" \
        --arg client_id "$GOOGLE_OAUTH_CLIENT_ID" \
        --arg client_secret "$GOOGLE_OAUTH_CLIENT_SECRET" '
          {
            name: $name,
            type: $type,
            config: {
              client_id: $client_id,
              client_secret: $client_secret
            }
          }
        ')"
    fi

    idp_create="$(api_request POST "/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/identity_providers" "$idp_payload")"
    ACCESS_IDP_ID="$(jq -r '.result.id // empty' <<<"$idp_create")"
    echo "Created identity provider: ${ACCESS_IDP_ID}"
  else
    echo "No existing IdP found and GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET not set." >&2
    echo "Proceeding without allowed_idps pinning; app login will use account default IdP config." >&2
  fi
else
  echo "Using existing identity provider: ${ACCESS_IDP_ID}"
fi

echo "Resolving Access application for ${ACCESS_APP_DOMAIN}..."
app_list="$(api_request GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps")"
app_id="$(jq -r --arg domain "$ACCESS_APP_DOMAIN" '.result[] | select(.domain == $domain) | .id' <<<"$app_list" | head -n 1)"

if [[ -z "$app_id" ]]; then
  if [[ -n "$ACCESS_IDP_ID" ]]; then
    app_payload="$(jq -n \
      --arg domain "$ACCESS_APP_DOMAIN" \
      --arg type "self_hosted" \
      --arg name "$ACCESS_APP_NAME" \
      --arg session_duration "$ACCESS_SESSION_DURATION" \
      --arg idp "$ACCESS_IDP_ID" '
        {
          domain: $domain,
          type: $type,
          name: $name,
          app_launcher_visible: false,
          session_duration: $session_duration,
          auto_redirect_to_identity: true,
          allowed_idps: [$idp]
        }
      ')"
  else
    app_payload="$(jq -n \
      --arg domain "$ACCESS_APP_DOMAIN" \
      --arg type "self_hosted" \
      --arg name "$ACCESS_APP_NAME" \
      --arg session_duration "$ACCESS_SESSION_DURATION" '
        {
          domain: $domain,
          type: $type,
          name: $name,
          app_launcher_visible: false,
          session_duration: $session_duration
        }
      ')"
  fi

  app_create="$(api_request POST "/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps" "$app_payload")"
  app_id="$(jq -r '.result.id // empty' <<<"$app_create")"
  echo "Created app: ${app_id}"
else
  echo "Using existing app: ${app_id}"
fi

if [[ -z "$app_id" ]]; then
  echo "Unable to resolve app id; aborting." >&2
  exit 1
fi

echo "Ensuring app policy '${ACCESS_POLICY_NAME}'..."
policy_list="$(api_request GET "/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps/${app_id}/policies")"
policy_id="$(jq -r --arg name "$ACCESS_POLICY_NAME" '.result[] | select(.name == $name) | .id' <<<"$policy_list" | head -n 1)"

if [[ -z "$ACCESS_POLICY_PRECEDENCE" ]]; then
  max_precedence="$(jq -r '[.result[]?.precedence // 0] | max // 0' <<<"$policy_list")"
  ACCESS_POLICY_PRECEDENCE="$((max_precedence + 1))"
fi

policy_payload="$(jq -n \
  --arg name "$ACCESS_POLICY_NAME" \
  --arg decision "$ACCESS_POLICY_DECISION" \
  --arg domain "$ACCESS_ALLOWED_EMAIL_DOMAIN" \
  --arg session_duration "$ACCESS_SESSION_DURATION" \
  --argjson precedence "$ACCESS_POLICY_PRECEDENCE" '
    {
      name: $name,
      decision: $decision,
      precedence: $precedence,
      session_duration: $session_duration,
      include: [
        {
          email_domain: {
            domain: $domain
          }
        }
      ]
    }
  ')"

if [[ -z "$policy_id" ]]; then
  policy_create="$(api_request POST "/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps/${app_id}/policies" "$policy_payload")"
  policy_id="$(jq -r '.result.id // empty' <<<"$policy_create")"
  echo "Created policy: ${policy_id}"
else
  api_request PUT "/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps/${app_id}/policies/${policy_id}" "$policy_payload" >/dev/null
  echo "Updated policy: ${policy_id}"
fi

echo
echo "Admin Access setup complete."
echo "App domain: ${ACCESS_APP_DOMAIN}"
echo "App id: ${app_id}"
echo "Policy id: ${policy_id:-unknown}"
echo "IdP id: ${ACCESS_IDP_ID:-not-set}"
