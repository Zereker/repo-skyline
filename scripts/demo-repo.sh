#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/demo-repo.sh <git-url-or-local-path> [max-buildings]"
  exit 1
fi

SOURCE="$1"
MAX_BUILDINGS="${2:-2500}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$ROOT/apps/web/public/city.json"
CACHE_ROOT="$ROOT/.demo-cache"

mkdir -p "$CACHE_ROOT"

if [[ -d "$SOURCE/.git" ]]; then
  REPO_PATH="$(cd "$SOURCE" && pwd)"
else
  NAME="$(basename "$SOURCE")"
  NAME="${NAME%.git}"
  REPO_PATH="$CACHE_ROOT/$NAME"

  if [[ -d "$REPO_PATH/.git" ]]; then
    echo "==> Updating cached repository: $NAME"
    git -C "$REPO_PATH" fetch --all --tags --prune
    git -C "$REPO_PATH" pull --ff-only || true
  else
    echo "==> Cloning repository: $SOURCE"
    git clone --filter=blob:none "$SOURCE" "$REPO_PATH"
  fi
fi

echo "==> Analyzing: $REPO_PATH"
cd "$ROOT"

cargo run -p repo-skyline-cli -- analyze "$REPO_PATH"   -o "$OUTPUT"   --max-buildings "$MAX_BUILDINGS"

echo
echo "Demo data ready: $OUTPUT"
echo "Rendered building cap: $MAX_BUILDINGS"
echo
echo "Start the UI:"
echo "  cd apps/web"
echo "  npm install"
echo "  npm run dev"
