#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$ROOT_DIR/rust/fuzzy-find"
PKG_DIR="$CRATE_DIR/pkg"
TARGET_DIR="$CRATE_DIR/target"

if ! rustup target list --installed | rg -x 'wasm32-unknown-unknown' >/dev/null 2>&1; then
  rustup target add wasm32-unknown-unknown
fi

if ! command -v wasm-bindgen >/dev/null 2>&1; then
  cargo install wasm-bindgen-cli --version 0.2.92 --locked
fi

cargo build \
  --manifest-path "$CRATE_DIR/Cargo.toml" \
  --target wasm32-unknown-unknown \
  --release

mkdir -p "$PKG_DIR"

wasm-bindgen \
  "$TARGET_DIR/wasm32-unknown-unknown/release/fuzzy_find.wasm" \
  --out-dir "$PKG_DIR" \
  --target web
