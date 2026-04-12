# Verdent MCP Integration — Verdict Agent Tools for Gobii

This is the Verdent multi-agent coding brain with MCP (Model Context Protocol) tools
that Gobii agents can call during autonomous task execution.

## Architecture

```
Slack @mention → Gobii Agent → Verdent MCP Tools → n8n → 400+ integrations
                                     ↓
                            ┌─────────────────┐
                            │  VERDENT BRAIN  │
                            │ Supervisor      │
                            │   → Planner     │
                            │     → Coder     │
                            │       → Critic  │
                            │         → Judge │
                            └─────────────────┘
```

## Quick Start

### 1. Start n8n
```bash
docker compose up --build
# open http://localhost:5678
```

### 2. Import workflows
See `../n8n-workflows/README.md`

### 3. Configure Gobii
See `../gobii-integration/agent-setup.md`

## MCP Tools Available

- `github_create_issue`, `github_submit_pr`, `github_review_pr`, `github_list_workflows`
- `notion_create_page`, `notion_update_page`, `notion_query_database`
- `linear_create_issue`, `linear_list_issues`, `linear_update_issue`
- `slack_post_message`, `slack_search_messages`
- `gdrive_upload_file`, `gdrive_find_file`
- `n8n_trigger_workflow`

## Environment Variables

```bash
# Gobii
GOBII_API_KEY=your_gobii_key

# GitHub
GITHUB_TOKEN=ghp_xxx

# Notion
NOTION_API_KEY=secret_xxx

# Linear
LINEAR_API_KEY=lin_api_xxx

# Slack
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_SIGNING_SECRET=xxx

# n8n
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=xxx

# Google Drive
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```
