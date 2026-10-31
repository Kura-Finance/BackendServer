#!/usr/bin/env bash
# Point the GitHub Actions deploy workflows at the NEW project.
#   BackendServer/.github/workflows/deploy.yml reads Variables GCP_PROJECT_ID,
#     GCP_REGION, CLOUD_SQL_INSTANCE and Secrets GCP_SA_KEY, DB_PASSWORD.
#   WebClients/.github/workflows/deploy.yml reads GCP_PROJECT_ID / GCP_REGION
#     (Variable or Secret) and Secret GCP_SERVICE_ACCOUNT_KEY.
# Everything else (partner keys, origins, WebAuthn) is unchanged by the move.
# Requires: gh auth login (repo admin on both repos).
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_var DST_PROJECT_ID
require_cmd gh
resolve_backup_dir
gh auth status >/dev/null 2>&1 || die "Run: gh auth login"

key="$BACKUP_DIR/dst/$DEPLOY_SA_NAME-key.json"
[ -f "$key" ] || die "Deploy SA key not found at $key — run ./20-rebuild.sh --only deploy-sa"

inst="${DST_SQL_INSTANCE:-${SQL_INSTANCE:-}}"
if [ -z "$inst" ] && [ -f "$BACKUP_DIR/sql/instances.json" ]; then
  inst="$(python3 -c 'import json,sys; l=json.load(open(sys.argv[1])); print(l[0]["name"] if len(l)==1 else "")' "$BACKUP_DIR/sql/instances.json")"
fi
conn="$DST_PROJECT_ID:$REGION:$inst"

GH_BACKEND_REPO="${GH_BACKEND_REPO:-Kura-Finance/BackendServer}"
GH_WEB_REPO="${GH_WEB_REPO:-Kura-Finance/WebClients}"

cat <<TXT
About to update GitHub Actions configuration:

  $GH_BACKEND_REPO
    Variables: GCP_PROJECT_ID=$DST_PROJECT_ID  GCP_REGION=$REGION  CLOUD_SQL_INSTANCE=$conn
    Secrets:   GCP_SA_KEY=<$key>$( [ -n "${DB_PASSWORD:-}" ] && echo "  DB_PASSWORD=<config.env>")

  $GH_WEB_REPO
    Variables: GCP_PROJECT_ID=$DST_PROJECT_ID  GCP_REGION=$REGION
    Secrets:   GCP_SERVICE_ACCOUNT_KEY=<$key>

TXT
confirm "Proceed?"

step "$GH_BACKEND_REPO"
gh variable set GCP_PROJECT_ID     --repo "$GH_BACKEND_REPO" --body "$DST_PROJECT_ID"
gh variable set GCP_REGION         --repo "$GH_BACKEND_REPO" --body "$REGION"
[ -n "$inst" ] && gh variable set CLOUD_SQL_INSTANCE --repo "$GH_BACKEND_REPO" --body "$conn"
gh secret   set GCP_SA_KEY         --repo "$GH_BACKEND_REPO" < "$key"
[ -n "${DB_PASSWORD:-}" ] && gh secret set DB_PASSWORD --repo "$GH_BACKEND_REPO" --body "$DB_PASSWORD"
ok "Backend repo updated"

step "$GH_WEB_REPO"
gh variable set GCP_PROJECT_ID          --repo "$GH_WEB_REPO" --body "$DST_PROJECT_ID"
gh variable set GCP_REGION              --repo "$GH_WEB_REPO" --body "$REGION"
gh secret   set GCP_SERVICE_ACCOUNT_KEY --repo "$GH_WEB_REPO" < "$key"
# The web workflow historically read the project id from a Secret; clear the
# stale copy so the Variable wins (ignore if it does not exist).
gh secret delete GCP_PROJECT_ID --repo "$GH_WEB_REPO" >/dev/null 2>&1 || true
ok "Web repo updated"

echo
ok "Done. Trigger a deploy with an empty-ish commit or 'Run workflow' (web) and watch Actions."
echo "   Old-project copies of GCP_SA_KEY / GCP_SERVICE_ACCOUNT_KEY are now overwritten; revoke the old key in $SRC_PROJECT_ID when the cutover is confirmed."
