#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="${1:-}"

function info() {
  printf '[INFO] %s\n' "$1"
}

function warn() {
  printf '[WARN] %s\n' "$1" >&2
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ -z "$CONFIG_PATH" ]]; then
  CONFIG_PATH="$SCRIPT_DIR/.env.deploy"
fi

declare -A SETTINGS

load_config() {
  local file="$1"
  if [[ -f "$file" ]]; then
    info "Loading configuration from $file"
    while IFS='=' read -r key value; do
      [[ -z "$key" ]] && continue
      [[ "$key" =~ ^\s*# ]] && continue
      key="$(echo "$key" | xargs)"
      value="$(echo "$value" | xargs)"
      [[ -z "$key" ]] && continue
      SETTINGS["$key"]="$value"
    done < "$file"
  else
    warn "Config file $file not found. Falling back to environment variables."
  fi
}

get_setting() {
  local key="$1"
  local default="${2:-}"
  local required="${3:-}"

  if [[ -n "${SETTINGS[$key]:-}" ]]; then
    echo "${SETTINGS[$key]}"
    return
  fi

  local env_value="${!key:-}"
  if [[ -n "$env_value" ]]; then
    echo "$env_value"
    return
  fi

  if [[ -n "$default" ]]; then
    echo "$default"
    return
  fi

  if [[ "$required" == "required" ]]; then
    printf 'Missing required setting "%s". Add it to the config file or export it.\n' "$key" >&2
    exit 1
  fi

  echo ""
}

ensure_doctl() {
  if command -v doctl >/dev/null 2>&1; then
    info "Found existing doctl: $(command -v doctl)"
    DOCTL_BIN="$(command -v doctl)"
    return
  fi

  info "doctl not found. Downloading..."
  local version="1.111.0"
  local os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  local archive_url=""
  local archive_name=""

  case "$os" in
    linux)
      archive_name="doctl-${version}-linux-amd64.tar.gz"
      archive_url="https://github.com/digitalocean/doctl/releases/download/v${version}/${archive_name}"
      ;;
    darwin)
      archive_name="doctl-${version}-darwin-amd64.tar.gz"
      archive_url="https://github.com/digitalocean/doctl/releases/download/v${version}/${archive_name}"
      ;;
    *)
      printf 'Unsupported OS for automatic doctl installation: %s\n' "$os" >&2
      exit 1
      ;;
  esac

  local bin_dir="$SCRIPT_DIR/bin"
  mkdir -p "$bin_dir"
  local archive_path="$bin_dir/$archive_name"

  curl -sSL "$archive_url" -o "$archive_path"
  tar -xzf "$archive_path" -C "$bin_dir"
  rm -f "$archive_path"

  DOCTL_BIN="$bin_dir/doctl"
  chmod +x "$DOCTL_BIN"
  info "doctl downloaded to $DOCTL_BIN"
}

generate_spec() {
  local template="$1"
  local output="$2"
  local app_name="$3"
  local region="$4"
  local aftership_key="$5"
  local github_repo="$6"
  local github_branch="$7"

  if [[ ! -f "$template" ]]; then
    printf 'Spec template not found at %s\n' "$template" >&2
    exit 1
  fi

  sed \
    -e "s|__APP_NAME__|${app_name}|g" \
    -e "s|__REGION__|${region}|g" \
    -e "s|__VITE_AFTERSHIP_API_KEY__|${aftership_key}|g" \
    -e "s|__GITHUB_REPO__|${github_repo}|g" \
    -e "s|__GITHUB_BRANCH__|${github_branch}|g" \
    "$template" > "$output"

  info "Generated spec file at $output"
}

load_config "$CONFIG_PATH"

DO_ACCESS_TOKEN="$(get_setting 'DO_ACCESS_TOKEN' '' 'required')"
VITE_AFTERSHIP_API_KEY="$(get_setting 'VITE_AFTERSHIP_API_KEY' '' 'required')"
DO_APP_NAME="$(get_setting 'DO_APP_NAME' 'cursor-test-project')"
DO_REGION="$(get_setting 'DO_REGION' 'nyc')"
DO_GITHUB_REPO="$(get_setting 'DO_GITHUB_REPO' '' 'required')"
DO_GITHUB_BRANCH="$(get_setting 'DO_GITHUB_BRANCH' 'main')"

export DIGITALOCEAN_ACCESS_TOKEN="$DO_ACCESS_TOKEN"

ensure_doctl

cd "$REPO_ROOT"

info "Installing dependencies (npm install)"
npm install >/dev/null

info "Running build (npm run build)"
npm run build >/dev/null

SPEC_TEMPLATE="$SCRIPT_DIR/digitalocean-app-spec.template.yaml"
SPEC_GENERATED="$SCRIPT_DIR/digitalocean-app-spec.generated.yaml"
APP_ID_FILE="$SCRIPT_DIR/.do-app-id"

generate_spec "$SPEC_TEMPLATE" "$SPEC_GENERATED" "$DO_APP_NAME" "$DO_REGION" "$VITE_AFTERSHIP_API_KEY" "$DO_GITHUB_REPO" "$DO_GITHUB_BRANCH"

if [[ -f "$APP_ID_FILE" ]]; then
  APP_ID="$(head -n 1 "$APP_ID_FILE" | tr -d '[:space:]')"
  if [[ -z "$APP_ID" ]]; then
    rm -f "$APP_ID_FILE"
    printf 'Stored app ID is empty. Removed %s. Re-run the script to recreate the app.\n' "$APP_ID_FILE" >&2
    exit 1
  fi
  info "Updating existing DigitalOcean App ($APP_ID)"
  "$DOCTL_BIN" apps update "$APP_ID" --spec "$SPEC_GENERATED" >/dev/null
else
  info "Creating new DigitalOcean App ($DO_APP_NAME in $DO_REGION)"
  APP_ID="$("$DOCTL_BIN" apps create --spec "$SPEC_GENERATED" --format ID --no-header | tr -d '[:space:]')"
  if [[ -z "$APP_ID" ]]; then
    printf 'Failed to create DigitalOcean App. Check output above for errors.\n' >&2
    exit 1
  fi
  echo "$APP_ID" > "$APP_ID_FILE"
  info "Created App with ID $APP_ID (stored in $APP_ID_FILE)"
fi

info "Waiting for deployment to finish..."
"$DOCTL_BIN" apps wait "$APP_ID" >/dev/null

DEFAULT_INGRESS="$("$DOCTL_BIN" apps get "$APP_ID" --format DefaultIngress --no-header | tr -d '[:space:]')"
if [[ -n "$DEFAULT_INGRESS" ]]; then
  info "Deployment complete. Live URL: https://$DEFAULT_INGRESS"
else
  warn "Deployment finished, but the live URL could not be retrieved. Check the DigitalOcean dashboard."
fi

