#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Rust tests"
cargo test --workspace

echo "==> Generate city.json from Repo Skyline itself"
cargo run -p repo-skyline-cli -- analyze "$ROOT" -o "$ROOT/apps/web/public/city.json"

echo "==> Web install"
cd "$ROOT/apps/web"
npm install

echo "==> Web build"
npm run build

echo
echo "Repo Skyline demo validation passed."
echo "Generated: apps/web/public/city.json"
echo "Run: cd apps/web && npm run dev"
