#!/bin/bash
# Grably release pipeline — sign, package, sign-for-updater, notarize, upload.
# Produces 3 artifacts on each release:
#   1. Grably_<version>_aarch64_signed.dmg  — fresh-install download
#   2. Grably.app.tar.gz                    — payload the auto-updater fetches
#   3. latest.json                          — manifest the updater polls
#
# Usage: bash scripts/release.sh <tag>  e.g. bash scripts/release.sh v1.0.20260512
#
# Requirements (already set up on this Mac):
#   - npm run tauri:build has just finished and produced the .app
#   - Apple Developer ID cert in keychain (Femi Akindehinde, DN478SNPML)
#   - Keychain profile `grably-notarize` for xcrun notarytool
#   - Tauri updater private key at ~/.tauri/grably-updater.key
#   - gh CLI authenticated as ceorkm

set -euo pipefail
TAG="${1:?usage: release.sh <tag>  e.g. v1.0.20260512}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP="src-tauri/target/release/bundle/macos/Grably.app"
RES="$APP/Contents/Resources/resources"
CERT="Developer ID Application: Femi Akindehinde (DN478SNPML)"
ENT="src-tauri/entitlements.plist"
PRIV_KEY="$HOME/.tauri/grably-updater.key"

VERSION_NUM="${TAG#v}"                 # 1.0.20260512
DMG="Grably_0.1.1_aarch64_signed.dmg"  # filename matches tauri.conf.json bundle version
TAR="Grably.app.tar.gz"
SIG="Grably.app.tar.gz.sig"
MANIFEST="latest.json"
PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "▸ 1/8 Copying 6 whisper dylibs into bundle"
cp src-tauri/resources/lib*.dylib "$RES/"

echo "▸ 2/8 Signing every native binary inside the bundle"
for f in libggml-base.0.dylib libggml-blas.0.dylib libggml-cpu.0.dylib libggml-metal.0.dylib libggml.0.dylib libwhisper.1.dylib yt-dlp ffmpeg whisper deno; do
  codesign --force --options runtime --sign "$CERT" --entitlements "$ENT" "$RES/$f" 2>&1 | tail -1
done

echo "▸ 3/8 Sealing .app bundle"
codesign --force --options runtime --sign "$CERT" --entitlements "$ENT" "$APP" 2>&1 | tail -1
codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 | tail -2

echo "▸ 4/8 Building DMG with Applications symlink"
STAGING="/tmp/grably-dmg-staging"
rm -rf "$STAGING" && mkdir -p "$STAGING"
cp -R "$APP" "$STAGING/"
ln -s /Applications "$STAGING/Applications"
rm -f "$DMG"
hdiutil create -volname "Grably" -srcfolder "$STAGING" -ov -format UDZO "$DMG" 2>&1 | tail -3
codesign --force --sign "$CERT" "$DMG" 2>&1 | tail -1

echo "▸ 5/8 Notarizing DMG via grably-notarize keychain profile (Apple may take a few min)"
xcrun notarytool submit "$DMG" --keychain-profile grably-notarize --wait 2>&1 | tail -10
xcrun stapler staple "$DMG" 2>&1 | tail -2
spctl -a -t open --context context:primary-signature -v "$DMG" 2>&1 | tail -2

echo "▸ 6/8 Building auto-update payload (.app.tar.gz)"
rm -f "$TAR" "$SIG"
tar -czf "$TAR" -C "src-tauri/target/release/bundle/macos" "Grably.app"

echo "▸ 7/8 Signing payload with Tauri updater key"
# `signer sign` takes -f for the private key file path and -p for the password.
npx --yes @tauri-apps/cli signer sign -f "$PRIV_KEY" -p "" "$TAR" 2>&1 | tail -5

if [ ! -f "$SIG" ]; then
  echo "✗ Signature file not produced. Aborting."; exit 1
fi
SIGNATURE="$(cat "$SIG")"

echo "▸ 8/8 Writing $MANIFEST"
NOTES="${RELEASE_NOTES:-Maintenance release.}"
DL_URL="https://github.com/ceorkm/grably/releases/download/$TAG/$TAR"
cat > "$MANIFEST" <<JSON
{
  "version": "$VERSION_NUM",
  "notes": $(printf '%s' "$NOTES" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
  "pub_date": "$PUB_DATE",
  "platforms": {
    "darwin-aarch64": {
      "signature": $(printf '%s' "$SIGNATURE" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
      "url": "$DL_URL"
    }
  }
}
JSON
cat "$MANIFEST"

echo
echo "✓ Build artifacts ready:"
ls -lh "$DMG" "$TAR" "$SIG" "$MANIFEST"
echo
echo "Next:  gh release create $TAG \"$DMG\" \"$TAR\" \"$SIG\" \"$MANIFEST\" --title \"...\" --notes \"...\""
