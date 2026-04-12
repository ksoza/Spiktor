# Spiktor Mobile — Build Specification

## What We're Building
Android APK wrapping the Spiktor Next.js web app with a Settings page for all API keys and integrations.

## APK Info
- **App ID:** com.spiktor.app  
- **Min SDK:** Android 8.0 (API 26)  
- **Target SDK:** Android 14 (API 34)

## Build Machine Requirements
- Ubuntu/Debian Linux (or macOS)  
- Node.js 20+  
- ANDROID_HOME set  
- 4GB+ RAM  
- 10GB disk free

## Build Time
~15-20 minutes on a fresh machine

## What Gets Installed
- Capacitor core + CLI  
- Android platform  
- ~500MB Android SDK components  
- Final APK: ~25-40MB

## Settings Page Tabs
1. **AI Models** — Gemini key, Ollama URL
2. **Slack** — Bot token, Signing secret  
3. **GitHub** — PAT token  
4. **Notion** — API key  
5. **Browser** — Browserbase key  
6. **Memory** — OpenMemory URL  
7. **Nexus** — Nexus agent URL  
8. **n8n** — n8n instance URL  
9. **Gobii** — Gobii URL  

## After APK is Built
Upload to Google Play or install directly:
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```
