#!/bin/bash

echo "🚀 Creating Universal DMG for Grably..."

# Build for Intel (x86_64)
echo "📦 Building for Intel (x86_64)..."
npm run tauri build -- --target x86_64-apple-darwin --bundles app

# Build for Apple Silicon (aarch64)
echo "📦 Building for Apple Silicon (aarch64)..."
npm run tauri build -- --target aarch64-apple-darwin --bundles app

# Create universal binary
echo "🔧 Creating universal binary..."
mkdir -p universal-app
cp -R src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Grably.app universal-app/

# Combine the binaries using lipo
lipo -create \
  src-tauri/target/x86_64-apple-darwin/release/bundle/macos/Grably.app/Contents/MacOS/tauri-app \
  src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Grably.app/Contents/MacOS/tauri-app \
  -output universal-app/Grably.app/Contents/MacOS/tauri-app

# Sign the universal binary
echo "✍️ Signing universal binary..."
codesign --force --deep --sign "Developer ID Application" \
  --options runtime \
  --entitlements entitlements.plist \
  universal-app/Grably.app

# Create DMG
echo "📀 Creating DMG..."
rm -f Grably-Universal.dmg
create-dmg \
  --volname "Grably" \
  --window-pos 200 120 \
  --window-size 600 400 \
  --icon-size 100 \
  --icon "Grably.app" 175 120 \
  --hide-extension "Grably.app" \
  --app-drop-link 425 120 \
  --no-internet-enable \
  "Grably-Universal.dmg" \
  "universal-app/"

echo "✅ Universal DMG created: Grably-Universal.dmg"