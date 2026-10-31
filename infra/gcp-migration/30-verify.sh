#!/usr/bin/env bash
# Verify the rebuilt stack: service URLs, HTTP health, Cloud SQL state, and an
# env-var key diff between the source backup and the new deployment.
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_var DST_PROJECT_ID
require_cmd python3 curl
require_gcloud_auth
resolve_backup_dir
G="gcloud --project=$DST_PROJECT_ID --quiet"
fail=0

step "Cloud Run services in $DST_PROJECT_ID"
$G run services list --format='table(metadata.name,metadata.labels."cloud.googleapis.com/location":label=REGION,status.url,status.conditions[0].status:label=READY)'

while read -r svc _; do
  [ -n "$svc" ] || continue
  if [ -n "$RUN_SERVICES" ] && ! grep -qw "$svc" <<<"$RUN_SERVICES"; then continue; fi
  step "Service $svc"
  url="$($G run services describe "$svc" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)"
  if [ -z "$url" ]; then warn "$svc not deployed in $REGION"; fail=1; continue; fi

  # Backend exposes /health; the web client answers on /.
  for path in /health /; do
    code="$(curl -s -o /tmp/verify-body.$$ -w '%{http_code}' --max-time 30 "$url$path" || echo 000)"
    if [ "$code" = "200" ]; then
      ok "GET $url$path → 200"
      if [ "$path" = "/health" ]; then head -c 400 /tmp/verify-body.$$; echo; fi
      break
    fi
    [ "$path" = "/" ] && { warn "GET $url{/health,/} did not return 200 (last: $code)"; fail=1; }
  done
  rm -f /tmp/verify-body.$$

  # Env var keys: source backup vs. live service.
  $G run services describe "$svc" --region "$REGION" --format=json > "/tmp/verify-$svc.$$.json"
  python3 - "$BACKUP_DIR/run/$svc.json" "/tmp/verify-$svc.$$.json" <<'PY' || fail=1
import json, sys
def keys(p):
    s = json.load(open(p))
    return {e["name"] for e in s["spec"]["template"]["spec"]["containers"][0].get("env", [])}
a, b = keys(sys.argv[1]), keys(sys.argv[2])
if a == b:
    print(f"✔ env var keys match ({len(a)})")
    sys.exit(0)
if a - b: print("✖ missing in new service:", ", ".join(sorted(a - b)))
if b - a: print("⚠ extra in new service:", ", ".join(sorted(b - a)))
sys.exit(1 if a - b else 0)
PY
  rm -f "/tmp/verify-$svc.$$.json"
done < "$BACKUP_DIR/run/service-list.txt"

step "Cloud SQL"
$G sql instances list --format='table(name,databaseVersion,region,settings.tier,state,connectionName)' || { warn "No Cloud SQL"; fail=1; }
inst="${DST_SQL_INSTANCE:-${SQL_INSTANCE:-}}"
if [ -z "$inst" ] && [ -f "$BACKUP_DIR/sql/instances.json" ]; then
  inst="$(python3 -c 'import json,sys; l=json.load(open(sys.argv[1])); print(l[0]["name"] if len(l)==1 else "")' "$BACKUP_DIR/sql/instances.json")"
fi
if [ -n "$inst" ]; then
  $G sql databases list --instance "$inst" --format='table(name,charset,collation)'
  $G sql users list --instance "$inst" --format='table(name,type)'
  echo
  echo "Row-count spot check (needs psql + Cloud SQL Auth Proxy; optional):"
  echo "  cloud-sql-proxy $DST_PROJECT_ID:$REGION:$inst --port 5433 &"
  echo "  psql \"postgresql://$DB_USER@127.0.0.1:5433/$DB_NAME\" -c 'select count(*) from \"User\"; select count(*) from _prisma_migrations;'"
fi

step "Project"
parent="$(gcloud projects describe "$DST_PROJECT_ID" --format='value(parent.type,parent.id)')"
if [ -z "$parent" ]; then ok "No organization parent"; else warn "Parent: $parent"; fi
gcloud billing projects describe "$DST_PROJECT_ID" --format='value(billingEnabled)' | grep -q True && ok "Billing enabled" || { warn "Billing not enabled"; fail=1; }

echo
if [ "$fail" = 0 ]; then ok "All checks passed"; else warn "Some checks failed — see above"; exit 1; fi
