#!/usr/bin/env bash
# Preflight: confirm tooling, auth, and that the source project is reachable.
# Safe to run any number of times; it changes nothing.
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

step "Tooling"
require_cmd gcloud python3
for c in docker crane gh jq; do
  if have_cmd "$c"; then ok "$c: $(command -v "$c")"; else warn "$c not found (optional — see README for what needs it)"; fi
done
gcloud version | head -1

step "Auth"
require_gcloud_auth

step "Source project: ${SRC_PROJECT_ID:-<unset>}"
require_var SRC_PROJECT_ID
project_exists "$SRC_PROJECT_ID" || die "Cannot read project $SRC_PROJECT_ID (missing permission or wrong id)"
parent="$(gcloud projects describe "$SRC_PROJECT_ID" --format='value(parent.id)')"
ok "Project readable. Parent: ${parent:-none}"

info "Cloud Run services:"
gcloud run services list --project "$SRC_PROJECT_ID" --format='table(metadata.name,metadata.labels."cloud.googleapis.com/location":label=REGION,status.url)' || warn "run.googleapis.com not enabled or no access"

info "Cloud SQL instances:"
gcloud sql instances list --project "$SRC_PROJECT_ID" --format='table(name,databaseVersion,region,settings.tier,state)' || warn "sqladmin.googleapis.com not enabled or no access"

info "Container images (gcr.io):"
gcloud container images list --repository "gcr.io/$SRC_PROJECT_ID" --format='value(name)' 2>/dev/null || warn "No gcr.io images or no access"

info "Artifact Registry repositories:"
gcloud artifacts repositories list --project "$SRC_PROJECT_ID" --format='table(name,format,location)' 2>/dev/null || warn "artifactregistry.googleapis.com not enabled"

step "Destination project: ${DST_PROJECT_ID:-<unset>}"
if [ -n "${DST_PROJECT_ID:-}" ]; then
  if project_exists "$DST_PROJECT_ID"; then
    dparent="$(gcloud projects describe "$DST_PROJECT_ID" --format='value(parent.id)')"
    if [ -n "$dparent" ]; then
      warn "$DST_PROJECT_ID already exists and has a parent ($dparent) — it is NOT a 'No organization' project."
    else
      ok "$DST_PROJECT_ID exists with no parent (No organization)"
    fi
  else
    ok "$DST_PROJECT_ID does not exist yet — 20-rebuild.sh will create it"
  fi
else
  warn "DST_PROJECT_ID not set (only needed for 20-rebuild.sh)"
fi

step "Billing accounts visible to this account"
gcloud billing accounts list --format='table(name,displayName,open)' || warn "cloudbilling API not reachable"

echo
ok "Preflight complete"
