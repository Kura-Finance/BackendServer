#!/usr/bin/env bash
# Move credential env vars of a Cloud Run service into Secret Manager and
# rebind the service to read them from there. Afterwards the service — not
# GitHub — is the source of truth for secrets (and for plain config, which
# `gcloud run deploy --image` leaves untouched).
#
#   ./50-secret-manager.sh                 # uses DST_PROJECT_ID + backup values
#   ./50-secret-manager.sh --from-live     # read current values from the running service instead
#
# Secrets created (only those with a non-empty value): see SECRET_KEYS.
# Env vars listed in DROP_KEYS, and any key that is not a valid identifier
# (leftovers from mangled multi-line values), are removed from the service.
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SERVICE="${BACKEND_SERVICE:-kura-backend}"
SECRET_KEYS="DB_PASSWORD JWT_SECRET ENCRYPTION_KEY PRIVY_APP_ID PRIVY_APP_SECRET PRIVY_VERIFICATION_KEY
RESEND_API_KEY PLAID_CLIENT_ID PLAID_SANDBOX_SECRET PLAID_PRODUCTION_SECRET DEBANK_ACCESS_KEY
STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET BRIDGE_API_KEY BRIDGE_WEBHOOK_PUBLIC_KEY
DINARI_API_KEY_ID DINARI_API_SECRET_KEY LIFI_API_KEY LOGO_DEV_TOKEN"
# Legacy keys no code path reads any more (see docs/SECRETS.md).
DROP_KEYS="ADMIN_SECRET_KEY APP_NAME APP_URL BACKEND_USE_HTTPS PLAID_SECRET WEB3AUTH_AUDIENCE
CODEGO_API_KEY CODEGO_API_URL CODEGO_KYC_API_KEY CODEGO_KYC_API_URL CODEGO_KYC_ORIGIN CODEGO_KYC_RETURN_URL CODEGO_WEBHOOK_SECRET
DIDIT_API_KEY DIDIT_WEBHOOK_SECRET DIDIT_WORKFLOW_ID
GNOSIS_PAY_PARTNER_ID GNOSIS_PAY_PSE_APP_ID GNOSIS_PAY_PSE_CERT_B64 GNOSIS_PAY_PSE_KEY_B64 GNOSIS_PAY_SIWE_DOMAIN
JWT_RS256_PRIVATE_KEY JWT_RS256_PRIVATE_KEY_B64 JWT_RS256_PUBLIC_KEY JWT_RS256_PUBLIC_KEY_B64
LITHIC_API_KEY LITHIC_ENV LITHIC_WEBHOOK_SECRET MAILERSEND_API_KEY MAILERSEND_FROM_EMAIL MAILERSEND_SENDER_NAME"

require_var DST_PROJECT_ID
require_cmd python3
require_gcloud_auth
G="gcloud --project=$DST_PROJECT_ID --quiet"
PROJECT_NUMBER="$(gcloud projects describe "$DST_PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
DEPLOY_SA="$DEPLOY_SA_NAME@$DST_PROJECT_ID.iam.gserviceaccount.com"
OVERRIDES_DIR="${SECRET_OVERRIDES_DIR:-$SCRIPT_DIR/secret-overrides}"   # optional: <KEY>.txt files win over env values

step "Source of values"
SRC_JSON="$(mktemp)"; trap 'rm -f "$SRC_JSON"' EXIT
if [ "${1:-}" = "--from-live" ]; then
  $G run services describe "$SERVICE" --region "$REGION" --format=json > "$SRC_JSON"
  ok "live service $SERVICE in $DST_PROJECT_ID"
else
  resolve_backup_dir
  cp "$BACKUP_DIR/run/$SERVICE.json" "$SRC_JSON"
  ok "backup $BACKUP_DIR/run/$SERVICE.json"
fi

step "Secret Manager secrets"
enable_apis "$DST_PROJECT_ID" secretmanager.googleapis.com
SET_SECRETS=(); REMOVE=()
for key in $SECRET_KEYS; do
  val=""
  if [ -f "$OVERRIDES_DIR/$key.txt" ]; then
    val="$(cat "$OVERRIDES_DIR/$key.txt")"; src="override"
  else
    val="$(python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); print(next((e.get("value","") for e in s["spec"]["template"]["spec"]["containers"][0].get("env",[]) if e["name"]==sys.argv[2]),""), end="")' "$SRC_JSON" "$key")"; src="env"
  fi
  if [ -z "$val" ]; then warn "$key: empty — not created"; continue; fi
  if $G secrets describe "$key" >/dev/null 2>&1; then
    cur="$($G secrets versions access latest --secret "$key" 2>/dev/null || true)"
    if [ "$cur" = "$val" ]; then
      ok "$key: unchanged"
    else
      printf '%s' "$val" | $G secrets versions add "$key" --data-file=- >/dev/null
      ok "$key: new version added ($src)"
    fi
  else
    printf '%s' "$val" | $G secrets create "$key" --replication-policy=automatic --data-file=- >/dev/null
    ok "$key: created ($src)"
  fi
  SET_SECRETS+=("$key=$key:latest"); REMOVE+=("$key")
done

step "IAM"
for sa in "$RUNTIME_SA" "$DEPLOY_SA"; do
  $G projects add-iam-policy-binding "$DST_PROJECT_ID" --member "serviceAccount:$sa" \
    --role roles/secretmanager.secretAccessor --condition=None >/dev/null && ok "secretAccessor → $sa"
done

step "Rebind $SERVICE"
# Drop legacy keys and any malformed key (fragments of split multi-line values).
mapfile -t GARBAGE < <(python3 -c 'import json,sys,re; s=json.load(open(sys.argv[1])); [print(e["name"]) for e in s["spec"]["template"]["spec"]["containers"][0].get("env",[]) if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", e["name"])]' "$SRC_JSON")
for key in $DROP_KEYS; do REMOVE+=("$key"); done
LIVE_KEYS="$($G run services describe "$SERVICE" --region "$REGION" --format=json | python3 -c 'import json,sys; s=json.load(sys.stdin); print("\n".join(e["name"] for e in s["spec"]["template"]["spec"]["containers"][0].get("env",[])))')"
TO_REMOVE=()
for k in "${REMOVE[@]}" "${GARBAGE[@]}"; do grep -qxF -- "$k" <<<"$LIVE_KEYS" && TO_REMOVE+=("$k"); done
info "removing ${#TO_REMOVE[@]} env var(s) (${#GARBAGE[@]} malformed), binding ${#SET_SECRETS[@]} secret(s)"
# --remove-env-vars is comma-separated; malformed keys may contain commas, so
# remove those one at a time via the YAML path instead.
# Remove and bind in ONE revision, otherwise the intermediate revision has no
# JWT_SECRET/DB_PASSWORD and fails to start.
SAFE_REMOVE=(); for k in "${TO_REMOVE[@]}"; do case "$k" in *,*) ;; *) SAFE_REMOVE+=("$k");; esac; done
UPDATE_FLAGS=()
[ "${#SAFE_REMOVE[@]}" -gt 0 ] && UPDATE_FLAGS+=(--remove-env-vars "$(IFS=,; echo "${SAFE_REMOVE[*]}")")
[ "${#SET_SECRETS[@]}" -gt 0 ] && UPDATE_FLAGS+=(--update-secrets "$(IFS=,; echo "${SET_SECRETS[*]}")")
if [ "${#UPDATE_FLAGS[@]}" -gt 0 ]; then
  $G run services update "$SERVICE" --region "$REGION" "${UPDATE_FLAGS[@]}" >/dev/null
fi
# Keys containing commas: strip through a YAML round-trip.
COMMA_KEYS=(); for k in "${TO_REMOVE[@]}"; do case "$k" in *,*) COMMA_KEYS+=("$k");; esac; done
if [ "${#COMMA_KEYS[@]}" -gt 0 ]; then
  Y="$(mktemp)"; $G run services describe "$SERVICE" --region "$REGION" --format=export > "$Y"
  python3 - "$Y" "${COMMA_KEYS[@]}" <<'PY'
import sys, yaml
p=sys.argv[1]; bad=set(sys.argv[2:]); d=yaml.safe_load(open(p))
c=d["spec"]["template"]["spec"]["containers"][0]; c["env"]=[e for e in c.get("env",[]) if e["name"] not in bad]
yaml.safe_dump(d, open(p,"w"), sort_keys=False)
PY
  $G run services replace "$Y" --region "$REGION" >/dev/null; rm -f "$Y"
fi
ok "$SERVICE updated"

step "Result"
$G run services describe "$SERVICE" --region "$REGION" --format=json | python3 -c '
import json,sys; s=json.load(sys.stdin); c=s["spec"]["template"]["spec"]["containers"][0]
env=[e for e in c.get("env",[]) if "value" in e]; sec=[e for e in c.get("env",[]) if "valueFrom" in e]
print("plain env vars:", len(env)); print("from Secret Manager:", ", ".join(sorted(e["name"] for e in sec)))
print("ready:", s["status"]["conditions"][0]["status"])'
