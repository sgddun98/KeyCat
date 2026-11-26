#!/bin/sh
# Builds a universal (Apple silicon + Intel) build/KeyCat.app at the repo root. Usage: sh mac/build.sh
# macOS 13 is the floor: the x86_64 Swift compatibility libraries are not shipped for 12.
set -eu
cd "$(dirname "$0")/.."
APP=build/KeyCat.app
rm -rf "$APP" build/arch
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web" build/arch
for arch in arm64 x86_64; do
    xcrun swiftc -O -swift-version 5 -target "$arch-apple-macosx13.0" \
        -framework Cocoa -framework WebKit -o "build/arch/KeyCat-$arch" mac/*.swift
done
lipo -create build/arch/KeyCat-arm64 build/arch/KeyCat-x86_64 -output "$APP/Contents/MacOS/KeyCat"
cp mac/Info.plist "$APP/Contents/Info.plist"
cp mac/icons/KeyCat.icns mac/icons/MenuBar.png "$APP/Contents/Resources/"
cp web/*.html web/*.js web/THREE_LICENSE "$APP/Contents/Resources/web/"
sh mac/sign.sh "$APP"
echo "built $APP"
