#!/usr/bin/env bash
# Rebuilds js/vendor/firebase.js (Firebase SDK + QR code library in one file).
# Only needed when upgrading Firebase. Run from the repo root.
set -euo pipefail
TMP=$(mktemp -d)
cp tools/vendor-entry.js "$TMP/entry.js"
(cd "$TMP" && npm init -y >/dev/null && npm i firebase@11 qrcode-generator@1.4.4 esbuild@0.24 >/dev/null)
"$TMP/node_modules/.bin/esbuild" "$TMP/entry.js" --bundle --format=esm --minify --target=safari15 --outfile=js/vendor/firebase.js
rm -rf "$TMP"
