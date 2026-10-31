#!/usr/bin/env bash
# Back up everything the Kura stack uses in the SOURCE project to a local
# folder (plus a GCS bucket for the SQL dump):
#   - project metadata, enabled APIs, IAM policy, service accounts
#   - Cloud Run services (JSON + YAML), their IAM policies, domain mappings
#   - Cloud SQL instance/database/user metadata + full SQL export per database
#   - container images referenced by Cloud Run (tag/digest list, optional tar)
#   - Secret Manager, Cloud Scheduler, Cloud DNS, buckets (inventory)
#
# Read-only against the source project except for: creating BACKUP_BUCKET and
# granting the Cloud SQL service account write access to it.
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_var SRC_PROJECT_ID
require_cmd python3
require_gcloud_auth
project_exists "$SRC_PROJECT_ID" || die "Cannot read project $SRC_PROJECT_ID"

BACKUP_BUCKET="${BACKUP_BUCKET:-${SRC_PROJECT_ID}-migration-backup}"
TS="$(timestamp)"
BACKUP_DIR="$BACKUP_ROOT/$TS"
mkdir -p "$BACKUP_DIR"/{project,run,sql,images,secrets,misc}
chmod 700 "$BACKUP_ROOT" "$BACKUP_DIR"
info "Backup directory: $BACKUP_DIR"

G="gcloud --project=$SRC_PROJECT_ID --quiet"
pushd "$BACKUP_DIR" >/dev/null

# ---------------------------------------------------------------------------
step "Project metadata"
$G projects describe "$SRC_PROJECT_ID" --format=json > project/project.json
$G services list --enabled --format=json > project/enabled-services.json
$G projects get-iam-policy "$SRC_PROJECT_ID" --format=json > project/iam-policy.json
$G iam service-accounts list --format=json > project/service-accounts.json
$G compute project-info describe --format=json > project/compute-project-info.json 2>/dev/null || true
ok "project/*.json"

# ---------------------------------------------------------------------------
step "Cloud Run"
$G run services list --format=json > run/services.json
mapfile -t SVC_LINES < <(python3 - run/services.json <<'PY'
import json, sys
for s in json.load(open(sys.argv[1])):
    md = s["metadata"]
    print(md["name"], md["labels"]["cloud.googleapis.com/location"])
PY
)
: > run/service-list.txt
for line in "${SVC_LINES[@]:-}"; do
  [ -n "$line" ] || continue
  name="${line%% *}"; region="${line##* }"
  if [ -n "$RUN_SERVICES" ] && ! grep -qw "$name" <<<"$RUN_SERVICES"; then
    info "Skipping service $name (not in RUN_SERVICES)"; continue
  fi
  info "Service $name ($region)"
  $G run services describe "$name" --region "$region" --format=json   > "run/$name.json"
  $G run services describe "$name" --region "$region" --format=export > "run/$name.yaml"
  $G run services get-iam-policy "$name" --region "$region" --format=json > "run/$name.iam.json"
  $G run revisions list --service "$name" --region "$region" --format=json > "run/$name.revisions.json"
  echo "$name $region" >> run/service-list.txt
done
# Domain mappings live per region; collect for every region we saw.
# (REST, so the gcloud `beta` component is not required.)
for region in $(awk '{print $2}' run/service-list.txt | sort -u); do
  curl -sSf -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    "https://$region-run.googleapis.com/apis/domains.cloudrun.com/v1/namespaces/$SRC_PROJECT_ID/domainmappings" \
    > "run/domain-mappings.$region.json" 2>/dev/null || echo '{}' > "run/domain-mappings.$region.json"
done
$G run jobs list --format=json > run/jobs.json 2>/dev/null || echo '[]' > run/jobs.json
ok "run/* ($(wc -l < run/service-list.txt) service(s))"
warn "run/<service>.json|yaml contain the plaintext env vars (JWT_SECRET, DB_PASSWORD, partner keys). Keep this folder private."

# ---------------------------------------------------------------------------
step "Cloud SQL"
$G sql instances list --format=json > sql/instances.json
mapfile -t SQL_INSTANCES < <(python3 -c 'import json,sys; [print(i["name"]) for i in json.load(open(sys.argv[1]))]' sql/instances.json)
if [ "${#SQL_INSTANCES[@]}" -eq 0 ]; then
  warn "No Cloud SQL instances found in $SRC_PROJECT_ID"
else
  if [ -n "${SQL_INSTANCE:-}" ]; then SQL_INSTANCES=("$SQL_INSTANCE"); fi
  ensure_bucket "$SRC_PROJECT_ID" "$BACKUP_BUCKET" "$REGION"
  for inst in "${SQL_INSTANCES[@]}"; do
    info "Instance $inst"
    $G sql instances describe "$inst" --format=json > "sql/$inst.json"
    $G sql databases list --instance "$inst" --format=json > "sql/$inst.databases.json"
    $G sql users list --instance "$inst" --format=json > "sql/$inst.users.json"
    $G sql backups list --instance "$inst" --format=json > "sql/$inst.backups.json" 2>/dev/null || true
    sa_email="$(json_get "sql/$inst.json" 'd.get("serviceAccountEmailAddress","")')"
    [ -n "$sa_email" ] || die "Could not read serviceAccountEmailAddress for $inst"
    gcloud storage buckets add-iam-policy-binding "gs://$BACKUP_BUCKET" \
      --member "serviceAccount:$sa_email" --role roles/storage.objectAdmin --quiet >/dev/null
    mapfile -t DBS < <(python3 -c 'import json,sys; [print(x["name"]) for x in json.load(open(sys.argv[1])) if x["name"] not in ("postgres","template0","template1","cloudsqladmin")]' "sql/$inst.databases.json")
    for db in "${DBS[@]}"; do
      obj="gs://$BACKUP_BUCKET/sql/$TS/$inst-$db.sql.gz"
      info "Exporting $inst/$db → $obj (serverless offload)"
      $G sql export sql "$inst" "$obj" --database "$db" --offload
      gcloud storage cp "$obj" "sql/$inst-$db.sql.gz" --quiet
      ok "sql/$inst-$db.sql.gz ($(du -h "sql/$inst-$db.sql.gz" | cut -f1))"
    done
  done
fi

# ---------------------------------------------------------------------------
step "Container images"
$G container images list --repository "gcr.io/$SRC_PROJECT_ID" --format=json > images/gcr-images.json 2>/dev/null || echo '[]' > images/gcr-images.json
$G artifacts repositories list --format=json > images/artifact-repositories.json 2>/dev/null || echo '[]' > images/artifact-repositories.json
# Images actually running right now (one per service) — these are what 20-rebuild.sh copies.
python3 - run/service-list.txt <<'PY' > images/running-images.txt
import json, sys
for line in open(sys.argv[1]):
    name, region = line.split()
    s = json.load(open(f"run/{name}.json"))
    print(name, s["spec"]["template"]["spec"]["containers"][0]["image"])
PY
while read -r name img; do
  [ -n "$name" ] || continue
  # Resolve the digest so the copy is byte-exact even if :latest moves.
  digest="$($G container images describe "$img" --format='value(image_summary.digest)' 2>/dev/null || true)"
  echo "$name $img ${digest:-unknown}" >> images/running-images.resolved.txt
  if [ "$SAVE_IMAGES" = "true" ] && have_cmd docker; then
    info "docker save $img → images/$name.tar"
    gcloud auth configure-docker gcr.io --quiet >/dev/null 2>&1 || true
    if docker pull "$img" >/dev/null; then
      docker save "$img" -o "images/$name.tar"
      ok "images/$name.tar ($(du -h "images/$name.tar" | cut -f1))"
    else
      warn "docker pull failed for $img — skipped tar (rebuild will try registry-to-registry copy)"
    fi
  fi
done < images/running-images.txt
ok "images/running-images.txt"

# ---------------------------------------------------------------------------
step "Other resources (inventory)"
$G secrets list --format=json > secrets/secrets.json 2>/dev/null || echo '[]' > secrets/secrets.json
for s in $(python3 -c 'import json,sys; [print(x["name"].split("/")[-1]) for x in json.load(open(sys.argv[1]))]' secrets/secrets.json); do
  $G secrets versions access latest --secret "$s" > "secrets/$s.latest" 2>/dev/null && ok "secrets/$s.latest" || warn "Could not read secret $s"
done
$G scheduler jobs list --format=json > misc/scheduler-jobs.json 2>/dev/null || echo '[]' > misc/scheduler-jobs.json
$G storage buckets list --format=json > misc/buckets.json 2>/dev/null || echo '[]' > misc/buckets.json
$G dns managed-zones list --format=json > misc/dns-zones.json 2>/dev/null || echo '[]' > misc/dns-zones.json
for z in $(python3 -c 'import json,sys; [print(x["name"]) for x in json.load(open(sys.argv[1]))]' misc/dns-zones.json); do
  $G dns record-sets export "misc/dns-$z.yaml" --zone "$z" 2>/dev/null || true
done
$G pubsub topics list --format=json > misc/pubsub-topics.json 2>/dev/null || echo '[]' > misc/pubsub-topics.json
$G functions list --format=json > misc/functions.json 2>/dev/null || echo '[]' > misc/functions.json
ok "secrets/* misc/*"

# ---------------------------------------------------------------------------
cat > manifest.json <<JSON
{
  "created_at": "$TS",
  "source_project": "$SRC_PROJECT_ID",
  "region": "$REGION",
  "backup_bucket": "gs://$BACKUP_BUCKET/sql/$TS/",
  "gcloud_account": "$(gcloud_account)",
  "gcloud_version": "$(gcloud version --format='value(\"Google Cloud SDK\")' 2>/dev/null)"
}
JSON
chmod -R go-rwx .
popd >/dev/null

echo
ok "Backup complete → $BACKUP_DIR"
echo "   SQL dump copy also in gs://$BACKUP_BUCKET/sql/$TS/"
echo "   Next: review $BACKUP_DIR, then run ./20-rebuild.sh"
