#!/bin/bash
# Spiktor Android Build Script
set -e

echo "🤖 Spiktor Android Build"

# Check SDK
if [ -z "$ANDROID_HOME" ]; then
  echo "❌ ANDROID_HOME not set"
  echo "Run: export ANDROID_HOME=~/android-sdk"
  exit 1
fi

# Install Capacitor if needed
if ! command -v npx &> /dev/null; then
  echo "❌ Node.js required"
  exit 1
fi

echo "📦 Installing Capacitor..."
npm install @capacitor/core @capacitor/cli @capacitor/android

echo "⚙️ Initializing Capacitor..."
npx cap init Spiktor com.spiktor.app --web-dir=../verdent-mcp/out

echo "🔨 Building web app..."
cd ../verdent-mcp && npm run build && cd ../android

echo "🔄 Syncing to Android..."
npx cap sync android

echo "📱 Building APK..."
cd app/build/outputs/apk/debug
./gradlew assembleDebug

APK=$(find . -name "*.apk" | head -1)
echo ""
echo "✅ Done! APK: $APK"
