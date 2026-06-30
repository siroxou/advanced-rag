#!/bin/zsh
# Build dist/Advanced RAG.dmg - a downloadable installer for the launcher app.
# Pure hdiutil (built into macOS), no dependencies.
emulate -L zsh
set -euo pipefail

REPO="${0:A:h:h}"
cd "$REPO"
APP="Advanced RAG.app"
DMG="dist/Advanced RAG.dmg"
[ -d "$APP" ] || { print "Missing $APP at repo root"; exit 1; }

mkdir -p dist
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"   # drag-to-install target

rm -f "$DMG"
hdiutil create -volname "Advanced RAG" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
print "Built $DMG"
