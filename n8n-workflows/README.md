# Spiktor n8n Workflows

These JSON files are importable into n8n. They bridge Gobii → Verdent → your tools.

## Import Instructions

1. Open n8n at `http://localhost:5678`
2. Click **Workflows → Import from JSON**
3. Paste the contents of each file

## Workflows

| File | Trigger | What it does |
|---|---|---|
| `slack-gobii-router.json` | Slack slash command or mention | Routes incoming Slack messages to Gobii → Verdent planning |
| `github-event-bridge.json` | GitHub webhook (issues, PRs) | Forwards GitHub events to Gobii agent for triage |
| `verdent-execute-task.json` | Webhook `/api/verdent/execute` | Takes a coding task → runs it through Verdent's Coder→Critic→Judge cycle |
| `daily-standup.json` | Schedule (9am Mon-Fri) | Collects updates, runs Verdent synthesis, posts to Slack |
| `standup-summary.json` | Manual trigger | Aggregates Notion + Linear + GitHub into a standup digest |
