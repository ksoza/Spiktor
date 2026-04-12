#!/bin/bash
# Spiktor — Full Android SDK Install + APK Build
# Run this on any Linux machine with internet
set -e

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/android-sdk}"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
export PATH="$PATH:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools"

echo "🤖 Spiktor Android Build — Starting..."

# === STEP 1: Install Android SDK ===
if [ ! -d "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "📥 Installing Android SDK..."
  mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"
  cd "$ANDROID_SDK_ROOT/cmdline-tools"
  curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -o cmdline-tools.zip
  unzip -q cmdline-tools.zip && mv cmdline-tools latest && rm cmdline-tools.zip
  echo "✅ SDK downloaded"
else
  echo "✅ Android SDK already installed"
fi

# === STEP 2: Accept licenses & install components ===
echo "📦 Installing SDK components..."
yes | "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null 2>&1 || true
"$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" \
  "platform-tools" "platforms;android-34" "build-tools;34.0.0" --channel=0
echo "✅ SDK components ready"

# === STEP 3: Verify tools ===
echo "🔍 Verifying tools..."
which java && java -version 2>&1 | head -1 || echo "⚠️ Java not found"
"$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --list_installed | grep -E "platform-tools|build-tools|platforms"

# === STEP 4: Install Node deps ===
echo "📦 Installing Node dependencies..."
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/config-dialog @capacitor/preferences

# === STEP 5: Init Capacitor ===
echo "⚙️ Initializing Capacitor..."
npx cap init Spiktor com.spiktor.app --web-dir=../verdent-mcp/out -- CI || true

# === STEP 6: Build web app ===
echo "🔨 Building web app..."
cd ../verdent-mcp
npm install
npm run build

# === STEP 7: Sync to Android ===
echo "🔄 Syncing to Android..."
cd ../android
npx cap sync android

# === STEP 8: Build APK ===
echo "📱 Building APK..."
cd app/build/outputs/apk/debug
./gradlew assembleDebug --no-daemon 2>&1 | tail -5

# === DONE ===
APK=$(find "$ANDROID_SDK_ROOT/../.." -name "app-debug.apk" 2>/dev/null | head -1)
echo ""
echo "🎉 BUILD COMPLETE"
echo "APK location: $APK"
echo "Or find it at: android/app/build/outputs/apk/debug/app-debug.apk"
