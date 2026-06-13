#!/usr/bin/env bash
# Spiktor — Push to GitHub
# Run this on your machine with your GitHub PAT
#
# Usage:
#   chmod +x push.sh
#   GITHUB_TOKEN=ghp_your_token_here ./push.sh
#
# Or inline:
#   GITHUB_TOKEN=ghp_xxx bash push.sh

set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ Set GITHUB_TOKEN first:"
  echo "   export GITHUB_TOKEN=ghp_your_token"
  exit 1
fi

REPO_URL="https://${GITHUB_TOKEN}@github.com/ksoza/Spiktor.git"

cd "$(dirname "$0")"

echo "→ Pushing to github.com/ksoza/Spiktor..."
git remote set-url origin "$REPO_URL"
git push origin main

echo "✅ Pushed successfully"
echo "   View: https://github.com/ksoza/Spiktor"
