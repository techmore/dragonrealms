#!/bin/bash
# Build Dragon Realms Admin.app (menu bar + optional Dock presence) from
# admin/main.swift. Run: ./scripts/build-admin-app.sh
set -euo pipefail
cd "$(dirname "$0")/.."

APP=bin/admin/dragonrealms-admin.app
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

swiftc -O admin/main.swift -o "$APP/Contents/MacOS/dradmin"

# Info.plist — LSUIElement=true keeps it menu-bar only (no Dock steal, per the
# 'app in the dock' request we present it as a normal app too; set false to
# get a Dock icon as well).
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Dragon Realms Admin</string>
  <key>CFBundleDisplayName</key><string>Dragon Realms Admin</string>
  <key>CFBundleIdentifier</key><string>com.dragonrealms.admin</string>
  <key>CFBundleVersion</key><string>0.1</string>
  <key>CFBundleExecutable</key><string>dradmin</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><false/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

chmod +x "$APP/Contents/MacOS/dradmin"

echo "Built $APP"
echo "Open:  open bin/admin/dragonrealms-admin"
