#!/usr/bin/env bash
# Pull latest from all three agentic OS repos

set -e

echo "🔄 Syncing all three agentic-os repos..."

git submodule update --remote aios-kernel/AIOS
echo "  ✓ ksoza/AIOS"

git submodule update --remote eliza-runtime
echo "  ✓ ksoza/eliza-AGENTIC-OS"

git submodule update --remote agentic-os/governance
echo "  ✓ ksoza/agentic-os"

git submodule update --remote github-mcp-server
echo "  ✓ ksoza/github-mcp-server"

git submodule update --remote ghostface
echo "  ✓ ksoza/GhOSTface"

echo
echo "✅ All repos synced. Restart stack to apply:"
echo "  docker-compose -f docker-compose.agentic-os.yml up -d --build"
