#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$ROOT_DIR/rust/import-parsers"
PKG_DIR="$CRATE_DIR/pkg"
TARGET_DIR="$CRATE_DIR/target"

cargo build \
  --manifest-path "$CRATE_DIR/Cargo.toml" \
  --target wasm32-unknown-unknown \
  --release

mkdir -p "$PKG_DIR"

wasm-bindgen \
  "$TARGET_DIR/wasm32-unknown-unknown/release/import_parsers.wasm" \
  --out-dir "$PKG_DIR" \
  --target web
