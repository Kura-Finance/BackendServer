#!/usr/bin/env bash
# Rebuild the Kura stack from a 10-backup.sh folder into a NEW project with
# no organization parent:
#   1. create project (no --organization / --folder) + link billing
#   2. enable APIs
#   3. Artifact Registry repo named "gcr.io" so gcr.io/<DST>/... keeps working
#   4. Cloud SQL instance, database, app user, import of the SQL dump
#   5. copy container images (crane → docker → saved tar fallback)
#   6. Cloud Run services with the exported env vars (DB pointers rewritten)
#   7. GitHub Actions deploy service account + key
#   8. optional custom-domain mappings
#
# Idempotent: re-running skips resources that already exist. Steps can be
# limited with  ./20-rebuild.sh --only sql,run  (see STEPS below).
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

STEPS="project,apis,registry,sql,images,run,deploy-sa,domains"
while [ $# -gt 0 ]; do
  case "$1" in
    --only) STEPS="$2"; shift 2 ;;
    --yes)  AUTO_YES=1; shift ;;
    *) die "Unknown argument: $1 (use --only step1,step2 | --yes)" ;;
  esac
done
run_step() { case ",$STEPS," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

require_var SRC_PROJECT_ID
require_var DST_PROJECT_ID
require_cmd python3
require_gcloud_auth
resolve_backup_dir
info "Using backup: $BACKUP_DIR"
[ -f "$BACKUP_DIR/manifest.json" ] || die "$BACKUP_DIR has no manifest.json — not a 10-backup.sh folder"
SRC_IN_BACKUP="$(json_get "$BACKUP_DIR/manifest.json" 'd["source_project"]')"
[ "$SRC_IN_BACKUP" = "$SRC_PROJECT_ID" ] || die "Backup is from project $SRC_IN_BACKUP but config says SRC_PROJECT_ID=$SRC_PROJECT_ID"

DST_BUCKET="${DST_BUCKET:-${DST_PROJECT_ID}-migration-backup}"
DST_STATE="$BACKUP_DIR/dst"
mkdir -p "$DST_STATE"; chmod 700 "$DST_STATE"
G="gcloud --project=$DST_PROJECT_ID --quiet"

# ---------------------------------------------------------------------------
if run_step project; then
  step "1. Project $DST_PROJECT_ID (No organization)"
  if project_exists "$DST_PROJECT_ID"; then
    ok "Project exists"
  else
    require_var BILLING_ACCOUNT_ID
    info "Creating project without an organization parent"
    # No --organization / --folder ⇒ parent is empty ⇒ "No organization".
    # If your account belongs to a Workspace/Cloud Identity org, GCP may still
    # attach the project to that org; create from a consumer account instead.
    gcloud projects create "$DST_PROJECT_ID" --name="${DST_PROJECT_NAME:-$DST_PROJECT_ID}" --quiet
  fi
  parent="$(gcloud projects describe "$DST_PROJECT_ID" --format='value(parent.id)')"
  if [ -n "$parent" ]; then
    warn "Project parent is '$parent' — this is NOT a 'No organization' project."
    warn "Projects cannot be moved out of an organization to 'No organization'. Use a consumer (gmail.com) account to create it."
    confirm "Continue anyway?"
  else
    ok "Parent: none (No organization)"
  fi
  if [ -n "${BILLING_ACCOUNT_ID:-}" ]; then
    cur="$(gcloud billing projects describe "$DST_PROJECT_ID" --format='value(billingAccountName)' 2>/dev/null || true)"
    if [ "$cur" = "billingAccounts/$BILLING_ACCOUNT_ID" ]; then
      ok "Billing already linked"
    else
      info "Linking billing account $BILLING_ACCOUNT_ID"
      gcloud billing projects link "$DST_PROJECT_ID" --billing-account "$BILLING_ACCOUNT_ID"
    fi
  else
    warn "BILLING_ACCOUNT_ID not set — Cloud SQL / Cloud Run need billing. Link it in the console before continuing."
  fi
fi

# ---------------------------------------------------------------------------
if run_step apis; then
  step "2. APIs"
  enable_apis "$DST_PROJECT_ID" \
    serviceusage.googleapis.com cloudresourcemanager.googleapis.com iam.googleapis.com \
    iamcredentials.googleapis.com compute.googleapis.com run.googleapis.com \
    sqladmin.googleapis.com sql-component.googleapis.com artifactregistry.googleapis.com \
    containerregistry.googleapis.com cloudbuild.googleapis.com storage.googleapis.com \
    secretmanager.googleapis.com logging.googleapis.com monitoring.googleapis.com
  PROJECT_NUMBER="$(gcloud projects describe "$DST_PROJECT_ID" --format='value(projectNumber)')"
  ok "Project number: $PROJECT_NUMBER"
fi
PROJECT_NUMBER="${PROJECT_NUMBER:-$(gcloud projects describe "$DST_PROJECT_ID" --format='value(projectNumber)')}"

# ---------------------------------------------------------------------------
if run_step registry; then
  step "3. Artifact Registry (gcr.io-compatible)"
  # Container Registry is shut down; Artifact Registry serves gcr.io/<project>
  # from a Docker repository literally named "gcr.io" in the "us" multi-region.
  # Creating it explicitly keeps both deploy.yml workflows working unchanged.
  if $G artifacts repositories describe gcr.io --location us >/dev/null 2>&1; then
    ok "Repository gcr.io already exists"
  else
    $G artifacts repositories create gcr.io --repository-format=docker --location=us \
      --description="gcr.io-compatible repo (migrated from $SRC_PROJECT_ID)"
    ok "Created us/gcr.io"
  fi
  # Cloud Run pulls with the default compute SA — give it read access.
  $G artifacts repositories add-iam-policy-binding gcr.io --location us \
    --member "serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
    --role roles/artifactregistry.reader >/dev/null
fi

# ---------------------------------------------------------------------------
SRC_SQL_CONN=""; DST_SQL_CONN=""
SRC_SQL_INSTANCE="${SQL_INSTANCE:-}"
if [ -z "$SRC_SQL_INSTANCE" ] && [ -f "$BACKUP_DIR/sql/instances.json" ]; then
  SRC_SQL_INSTANCE="$(python3 -c 'import json,sys; l=json.load(open(sys.argv[1])); print(l[0]["name"] if len(l)==1 else "")' "$BACKUP_DIR/sql/instances.json")"
fi
if [ -n "$SRC_SQL_INSTANCE" ] && [ -f "$BACKUP_DIR/sql/$SRC_SQL_INSTANCE.json" ]; then
  DST_SQL_INSTANCE="${DST_SQL_INSTANCE:-$SRC_SQL_INSTANCE}"
  SRC_SQL_CONN="$(json_get "$BACKUP_DIR/sql/$SRC_SQL_INSTANCE.json" 'd["connectionName"]')"
  DST_SQL_CONN="$DST_PROJECT_ID:$REGION:$DST_SQL_INSTANCE"
fi

if run_step sql; then
  step "4. Cloud SQL"
  if [ -z "$SRC_SQL_INSTANCE" ]; then
    warn "No Cloud SQL instance in backup (or several — set SQL_INSTANCE). Skipping."
  else
    require_var DB_PASSWORD
    src_json="$BACKUP_DIR/sql/$SRC_SQL_INSTANCE.json"
    db_version="$(json_get "$src_json" 'd["databaseVersion"]')"
    tier="${DST_SQL_TIER:-$(json_get "$src_json" 'd["settings"]["tier"]')}"
    disk_type="$(json_get "$src_json" 'd["settings"].get("dataDiskType","PD_SSD")')"
    avail="$(json_get "$src_json" 'd["settings"].get("availabilityType","ZONAL")')"; avail="${avail,,}"
    edition="$(json_get "$src_json" 'd["settings"].get("edition","ENTERPRISE")')"; edition="${edition,,}"
    root_pw="${DB_ROOT_PASSWORD:-$DB_PASSWORD}"
    if $G sql instances describe "$DST_SQL_INSTANCE" >/dev/null 2>&1; then
      ok "Instance $DST_SQL_INSTANCE exists"
    else
      info "Creating $DST_SQL_INSTANCE ($db_version, $tier, $REGION, $avail) — takes several minutes"
      $G sql instances create "$DST_SQL_INSTANCE" \
        --database-version="$db_version" --tier="$tier" --region="$REGION" \
        --availability-type="$avail" --edition="$edition" --storage-type="${disk_type#PD_}" --storage-auto-increase \
        --backup-start-time=03:00 --root-password="$root_pw"
      ok "Instance created"
    fi
    if $G sql databases describe "$DB_NAME" --instance "$DST_SQL_INSTANCE" >/dev/null 2>&1; then
      ok "Database $DB_NAME exists"
    else
      $G sql databases create "$DB_NAME" --instance "$DST_SQL_INSTANCE"
      ok "Database $DB_NAME created"
    fi
    if [ "$DB_USER" = "postgres" ]; then
      $G sql users set-password postgres --instance "$DST_SQL_INSTANCE" --password "$DB_PASSWORD"
      ok "postgres password set"
    else
      if $G sql users list --instance "$DST_SQL_INSTANCE" --format='value(name)' | grep -qx "$DB_USER"; then
        $G sql users set-password "$DB_USER" --instance "$DST_SQL_INSTANCE" --password "$DB_PASSWORD"
        ok "User $DB_USER password set"
      else
        $G sql users create "$DB_USER" --instance "$DST_SQL_INSTANCE" --password "$DB_PASSWORD"
        ok "User $DB_USER created"
      fi
    fi
    # Any other roles referenced by the dump (OWNER TO ...) must exist first.
    python3 -c 'import json,sys; [print(u["name"]) for u in json.load(open(sys.argv[1])) if u["name"] not in ("postgres","cloudsqlsuperuser","cloudsqladmin", sys.argv[2])]' \
      "$BACKUP_DIR/sql/$SRC_SQL_INSTANCE.users.json" "$DB_USER" | while read -r extra; do
      [ -n "$extra" ] || continue
      if ! $G sql users list --instance "$DST_SQL_INSTANCE" --format='value(name)' | grep -qx "$extra"; then
        warn "Source had extra DB user '$extra' — creating it with the DB_PASSWORD value; rotate it afterwards"
        $G sql users create "$extra" --instance "$DST_SQL_INSTANCE" --password "$DB_PASSWORD"
      fi
    done

    dump="$BACKUP_DIR/sql/$SRC_SQL_INSTANCE-$DB_NAME.sql.gz"
    [ -f "$dump" ] || die "Dump not found: $dump"
    marker="$DST_STATE/sql-imported.$DB_NAME"
    if [ -f "$marker" ]; then
      ok "Dump already imported into $DST_SQL_INSTANCE/$DB_NAME ($(cat "$marker")); delete $marker to force"
    else
      ensure_bucket "$DST_PROJECT_ID" "$DST_BUCKET" "$REGION"
      obj="gs://$DST_BUCKET/sql/$(basename "$BACKUP_DIR")/$(basename "$dump")"
      info "Uploading dump → $obj"
      gcloud storage cp "$dump" "$obj" --quiet
      sa_email="$($G sql instances describe "$DST_SQL_INSTANCE" --format='value(serviceAccountEmailAddress)')"
      gcloud storage buckets add-iam-policy-binding "gs://$DST_BUCKET" \
        --member "serviceAccount:$sa_email" --role roles/storage.objectViewer --quiet >/dev/null
      info "Importing into $DST_SQL_INSTANCE/$DB_NAME (as postgres)"
      $G sql import sql "$DST_SQL_INSTANCE" "$obj" --database "$DB_NAME" --user postgres
      date -u +%Y-%m-%dT%H:%M:%SZ > "$marker"
      ok "Import complete"
    fi
    ok "Connection name: $DST_SQL_CONN"
  fi
fi

# ---------------------------------------------------------------------------
copy_image() {
  # copy_image SRC_REF DST_REF SERVICE_NAME
  local src="$1" dst="$2" svc="$3"
  if have_cmd crane; then
    info "crane copy $src → $dst"
    crane copy "$src" "$dst" && return 0
    warn "crane copy failed, trying docker"
  fi
  # Same registry host (gcr.io): gcloud can retag across projects without a
  # local pull — blobs are mounted server-side.
  if [ "${src%%/*}" = "${dst%%/*}" ]; then
    info "gcloud container images add-tag $src → $dst"
    gcloud container images add-tag "$src" "$dst" --quiet && return 0
    warn "add-tag failed, trying docker"
  fi
  if have_cmd docker; then
    gcloud auth configure-docker gcr.io --quiet >/dev/null 2>&1 || true
    if docker pull "$src" >/dev/null 2>&1 || { [ -f "$BACKUP_DIR/images/$svc.tar" ] && docker load -i "$BACKUP_DIR/images/$svc.tar" >/dev/null; }; then
      docker tag "$src" "$dst" && docker push "$dst" && return 0
    fi
  fi
  die "Could not copy $src. Install crane (go-containerregistry) or docker, or re-run 10-backup.sh with SAVE_IMAGES=true."
}

declare -A NEW_IMAGE
if [ -f "$BACKUP_DIR/images/running-images.txt" ]; then
  while read -r svc img; do
    [ -n "$svc" ] || continue
    if [ -n "$RUN_SERVICES" ] && ! grep -qw "$svc" <<<"$RUN_SERVICES"; then continue; fi
    # gcr.io/SRC/name:tag  or  gcr.io/SRC/name@sha256:...
    path="${img#*/}"; path="${path#*/}"                 # name:tag | name@sha256:.. | name
    if [[ "$path" == *@* ]]; then
      base="${path%%@*}"; tag="migrated-$(basename "$BACKUP_DIR")"
    elif [[ "$path" == *:* ]]; then
      base="${path%%:*}"; tag="${path##*:}"
    else
      base="$path"; tag="latest"
    fi
    NEW_IMAGE["$svc"]="gcr.io/$DST_PROJECT_ID/$base:$tag"
  done < "$BACKUP_DIR/images/running-images.txt"
fi

if run_step images; then
  step "5. Container images"
  [ "${#NEW_IMAGE[@]}" -gt 0 ] || warn "No images recorded in backup"
  while read -r svc img; do
    [ -n "$svc" ] && [ -n "${NEW_IMAGE[$svc]:-}" ] || continue
    dst="${NEW_IMAGE[$svc]}"
    if $G container images describe "$dst" >/dev/null 2>&1; then
      ok "$dst already present"; continue
    fi
    copy_image "$img" "$dst" "$svc"
    # Also tag :latest so `gcloud run deploy` defaults and humans find it.
    $G container images add-tag "$dst" "${dst%%:*}:latest" >/dev/null 2>&1 || true
    ok "$dst"
  done < "$BACKUP_DIR/images/running-images.txt"
fi

# ---------------------------------------------------------------------------
if run_step run; then
  step "6. Cloud Run services"
  while read -r svc src_region; do
    [ -n "$svc" ] || continue
    if [ -n "$RUN_SERVICES" ] && ! grep -qw "$svc" <<<"$RUN_SERVICES"; then continue; fi
    image="${NEW_IMAGE[$svc]:-}"
    [ -n "$image" ] || die "No destination image for $svc (run the images step first)"
    env_file="$DST_STATE/$svc.env.yaml"; flags_file="$DST_STATE/$svc.flags"
    python3 "$SCRIPT_DIR/rewrite_service.py" "$BACKUP_DIR/run/$svc.json" \
      --src-project "$SRC_PROJECT_ID" --dst-project "$DST_PROJECT_ID" \
      --src-sql-conn "$SRC_SQL_CONN" --dst-sql-conn "$DST_SQL_CONN" \
      --image "$image" --db-password "${DB_PASSWORD:-}" \
      --out-env "$env_file" --out-flags "$flags_file" >/dev/null
    chmod 600 "$env_file"
    mapfile -t flags < "$flags_file"
    info "Deploying $svc in $REGION (source region was $src_region)"
    $G run deploy "$svc" --image "$image" --region "$REGION" --platform managed \
      --env-vars-file "$env_file" "${flags[@]}"
    if grep -q '"allUsers"' "$BACKUP_DIR/run/$svc.iam.json"; then
      $G run services add-iam-policy-binding "$svc" --region "$REGION" \
        --member allUsers --role roles/run.invoker >/dev/null
      ok "$svc: public (allUsers → run.invoker), matching source"
    fi
    url="$($G run services describe "$svc" --region "$REGION" --format='value(status.url)')"
    echo "$svc $url" >> "$DST_STATE/service-urls.txt"
    ok "$svc → $url"
  done < "$BACKUP_DIR/run/service-list.txt"
fi

# ---------------------------------------------------------------------------
if run_step deploy-sa; then
  step "7. GitHub Actions deploy service account"
  sa="$DEPLOY_SA_NAME@$DST_PROJECT_ID.iam.gserviceaccount.com"
  if $G iam service-accounts describe "$sa" >/dev/null 2>&1; then
    ok "$sa exists"
  else
    $G iam service-accounts create "$DEPLOY_SA_NAME" --display-name "GitHub Actions deploy"
    ok "Created $sa"
  fi
  for role in roles/run.admin roles/iam.serviceAccountUser roles/cloudsql.client \
              roles/artifactregistry.writer roles/storage.objectAdmin roles/serviceusage.serviceUsageConsumer; do
    $G projects add-iam-policy-binding "$DST_PROJECT_ID" --member "serviceAccount:$sa" --role "$role" \
      --condition=None >/dev/null
  done
  ok "Roles granted (run.admin, serviceAccountUser, cloudsql.client, artifactregistry.writer, storage.objectAdmin)"
  key="$DST_STATE/$DEPLOY_SA_NAME-key.json"
  if [ -f "$key" ]; then
    ok "Key already at $key"
  else
    $G iam service-accounts keys create "$key" --iam-account "$sa"
    chmod 600 "$key"
    ok "Key written to $key — put its contents in GitHub Secrets GCP_SA_KEY (backend) and GCP_SERVICE_ACCOUNT_KEY (web)"
  fi
fi

# ---------------------------------------------------------------------------
if run_step domains; then
  step "8. Custom domains"
  if [ -z "$DOMAINS" ]; then
    ok "DOMAINS empty — skipping (Cloud Run *.run.app URLs are in $DST_STATE/service-urls.txt)"
  else
    for pair in $DOMAINS; do
      domain="${pair%%=*}"; svc="${pair##*=}"
      if $G beta run domain-mappings describe --domain "$domain" --region "$REGION" >/dev/null 2>&1; then
        ok "Mapping for $domain exists"
      else
        info "Mapping $domain → $svc"
        $G beta run domain-mappings create --service "$svc" --domain "$domain" --region "$REGION" \
          || warn "Mapping failed — verify the domain first: gcloud domains verify $domain"
      fi
      $G beta run domain-mappings describe --domain "$domain" --region "$REGION" \
        --format='table(status.resourceRecords.type,status.resourceRecords.name,status.resourceRecords.rrdata)' 2>/dev/null || true
    done
    warn "Update DNS at your registrar/Cloudflare with the records above (proxy OFF / DNS-only until the certificate is issued)."
  fi
fi

echo
ok "Rebuild finished. State: $DST_STATE"
cat <<TXT

Next steps
  1. ./30-verify.sh                       # health checks + env-var diff vs. source
  2. ./40-github-config.sh                # point GitHub Actions at $DST_PROJECT_ID
  3. Switch DNS (api./app.) to the new services, then watch logs:
       gcloud run services logs tail <service> --region $REGION --project $DST_PROJECT_ID
  4. Keep the old project read-only for a while, then delete it:
       gcloud projects delete $SRC_PROJECT_ID
TXT
