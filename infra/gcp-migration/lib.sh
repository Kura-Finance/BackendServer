#!/usr/bin/env bash
# Shared helpers for the GCP migration scripts. Source, do not execute.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${CONFIG_FILE:-$SCRIPT_DIR/config.env}"

# ---------- output -----------------------------------------------------------
if [ -t 1 ]; then
  C_INFO=$'\033[1;34m'; C_OK=$'\033[1;32m'; C_WARN=$'\033[1;33m'; C_ERR=$'\033[1;31m'; C_OFF=$'\033[0m'
else
  C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""; C_OFF=""
fi
info() { echo "${C_INFO}▶${C_OFF} $*"; }
ok()   { echo "${C_OK}✔${C_OFF} $*"; }
warn() { echo "${C_WARN}⚠${C_OFF} $*" >&2; }
die()  { echo "${C_ERR}✖${C_OFF} $*" >&2; exit 1; }
step() { echo; echo "${C_INFO}== $* ==${C_OFF}"; }

# ---------- config -----------------------------------------------------------
[ -f "$CONFIG_FILE" ] || die "Missing $CONFIG_FILE — run: cp config.env.example config.env"
# shellcheck source=/dev/null
set -a; . "$CONFIG_FILE"; set +a

REGION="${REGION:-us-central1}"
DB_NAME="${DB_NAME:-kura_db}"
DB_USER="${DB_USER:-postgres}"
BACKUP_ROOT="${BACKUP_ROOT:-$SCRIPT_DIR/backups}"
case "$BACKUP_ROOT" in /*) ;; *) BACKUP_ROOT="$SCRIPT_DIR/$BACKUP_ROOT" ;; esac
SAVE_IMAGES="${SAVE_IMAGES:-true}"
DEPLOY_SA_NAME="${DEPLOY_SA_NAME:-github-deploy}"
RUN_SERVICES="${RUN_SERVICES:-}"
DOMAINS="${DOMAINS:-}"

require_var() {
  local name="$1"
  [ -n "${!name:-}" ] || die "config.env: $name is required for this step"
}

require_cmd() {
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || die "Required command not found: $c"
  done
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }

confirm() {
  # confirm "question" — aborts unless the user answers y/yes (or AUTO_YES=1).
  if [ "${AUTO_YES:-0}" = "1" ]; then return 0; fi
  read -r -p "$1 [y/N] " ans
  case "$ans" in y|Y|yes|YES) return 0 ;; *) die "Aborted." ;; esac
}

# ---------- gcloud -----------------------------------------------------------
gcloud_account() {
  gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1
}

require_gcloud_auth() {
  require_cmd gcloud
  local acct; acct="$(gcloud_account)"
  [ -n "$acct" ] || die "No active gcloud account. Run: gcloud auth login"
  ok "gcloud account: $acct"
}

project_exists() { gcloud projects describe "$1" --format='value(projectId)' >/dev/null 2>&1; }

# Enable services only if not already enabled (idempotent, quiet).
enable_apis() {
  local project="$1"; shift
  local enabled; enabled="$(gcloud services list --enabled --project "$project" --format='value(config.name)' 2>/dev/null || true)"
  local todo=()
  for api in "$@"; do
    grep -qx "$api" <<<"$enabled" || todo+=("$api")
  done
  if [ "${#todo[@]}" -gt 0 ]; then
    info "Enabling APIs on $project: ${todo[*]}"
    gcloud services enable "${todo[@]}" --project "$project"
  else
    ok "All requested APIs already enabled on $project"
  fi
}

ensure_bucket() {
  # ensure_bucket PROJECT BUCKET LOCATION
  local project="$1" bucket="$2" location="$3"
  if gcloud storage buckets describe "gs://$bucket" --project "$project" >/dev/null 2>&1; then
    ok "Bucket gs://$bucket exists"
  else
    info "Creating bucket gs://$bucket in $project ($location)"
    gcloud storage buckets create "gs://$bucket" --project "$project" --location "$location" \
      --uniform-bucket-level-access --public-access-prevention
  fi
}

latest_backup_dir() {
  ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | sort | tail -1 | sed 's#/$##'
}

resolve_backup_dir() {
  if [ -n "${BACKUP_DIR:-}" ]; then
    case "$BACKUP_DIR" in /*) ;; *) BACKUP_DIR="$SCRIPT_DIR/$BACKUP_DIR" ;; esac
  else
    BACKUP_DIR="$(latest_backup_dir)"
  fi
  [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ] || die "No backup directory found under $BACKUP_ROOT. Run 10-backup.sh first or set BACKUP_DIR."
  export BACKUP_DIR
}

timestamp() { date -u +%Y%m%dT%H%M%SZ; }

json_get() {
  # json_get FILE 'python expression on obj `d`'  — stdlib only, no jq needed.
  python3 - "$1" "$2" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    d = json.load(f)
v = eval(sys.argv[2], {}, {"d": d})
if isinstance(v, (dict, list)):
    print(json.dumps(v))
elif v is None:
    print("")
else:
    print(v)
PY
}
