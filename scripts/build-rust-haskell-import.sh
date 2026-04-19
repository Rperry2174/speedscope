#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$ROOT_DIR/rust/haskell-import"
PKG_DIR="$CRATE_DIR/pkg"
TARGET_DIR="$CRATE_DIR/target"

cargo build \
  --manifest-path "$CRATE_DIR/Cargo.toml" \
  --target wasm32-unknown-unknown \
  --release
mkdir -p "$PKG_DIR"
cp "$TARGET_DIR/wasm32-unknown-unknown/release/haskell_import.wasm" \
  "$PKG_DIR/haskell_import_bg.wasm"
