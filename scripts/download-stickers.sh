#!/usr/bin/env bash
# Скачивает иллюстрированные стикеры (WhatsApp sample packs) в public/stickers/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/public/stickers"
TMP="${TMPDIR:-/tmp}/crm-stickers-src"

rm -rf "$TMP"
git clone --depth 1 https://github.com/WhatsApp/stickers.git "$TMP"

mkdir -p "$DEST/cuppy" "$DEST/together"
cp -f "$TMP/Android/app/src/main/assets/1/"*.webp "$DEST/cuppy/"
cp -f "$TMP/Android/app/src/main/assets/2/"*.webp "$DEST/together/"
rm -rf "$TMP"

echo "✓ Стикеры: $(ls -1 "$DEST/cuppy" | wc -l) cuppy, $(ls -1 "$DEST/together" | wc -l) together"
