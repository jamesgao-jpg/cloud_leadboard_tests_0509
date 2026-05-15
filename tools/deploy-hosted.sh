#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: tools/deploy-hosted.sh [--page leaderboard|release|all] [--host HOST] [--dest PATH] [--dry-run]

Deploy the static leaderboard artifacts to the internal host.

Options:
  --page    Which page to deploy. Defaults to all.
            leaderboard: cloudleadboard.html plus shared assets/data/raw results.
            release: cloudleadboard_release_report.html plus shared assets.
            all: both pages plus shared assets/data/raw results.
  --host    SSH host. Defaults to 172.16.70.6.
  --dest    Remote web root. Defaults to /var/www/html/cloud-leaderboard.
  --dry-run Print rsync changes without modifying the remote host.
  -h, --help Show this help.
EOF
}

page="all"
host="172.16.70.6"
dest="/var/www/html/cloud-leaderboard"
dry_run=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --page)
      page="${2:-}"
      shift 2
      ;;
    --host)
      host="${2:-}"
      shift 2
      ;;
    --dest)
      dest="${2:-}"
      shift 2
      ;;
    --dry-run)
      dry_run=(--dry-run)
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$page" in
  leaderboard|release|all) ;;
  *)
    echo "--page must be leaderboard, release, or all" >&2
    exit 2
    ;;
esac

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

ssh "$host" "sudo mkdir -p '$dest' && sudo chown \$(id -un):\$(id -gn) '$dest'"

rsync_common=(-az --delete "${dry_run[@]}")

deploy_assets() {
  rsync "${rsync_common[@]}" cloudleadboard_assets/ "$host:$dest/cloudleadboard_assets/"
}

deploy_leaderboard() {
  rsync "${rsync_common[@]}" cloudleadboard.html "$host:$dest/cloudleadboard.html"
  rsync "${rsync_common[@]}" cloudleadboard_data/ "$host:$dest/cloudleadboard_data/"
  rsync "${rsync_common[@]}" cloud_insert/ "$host:$dest/cloud_insert/"
  rsync "${rsync_common[@]}" cloud_payload_search/ "$host:$dest/cloud_payload_search/"
  rsync "${rsync_common[@]}" cloud_multi_tenant_search/ "$host:$dest/cloud_multi_tenant_search/"
  rsync "${rsync_common[@]}" cloud_cold_latency/ "$host:$dest/cloud_cold_latency/"
}

deploy_release() {
  rsync "${rsync_common[@]}" cloudleadboard_release_report.html "$host:$dest/cloudleadboard_release_report.html"
}

deploy_assets

case "$page" in
  leaderboard)
    deploy_leaderboard
    ;;
  release)
    deploy_release
    ;;
  all)
    deploy_leaderboard
    deploy_release
    ;;
esac

echo "Deployed page=$page to $host:$dest"
