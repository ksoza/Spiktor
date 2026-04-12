// Spiktor Slack Bot Upgrade — Action blocks, thread memory, daily digests
// Wires into Gobii's existing Slack integration for richer interactions

export interface SlackMessage {
  channel: string;
  threadTs?: string;
  text: string;
  blocks?: SlackBlock[];
}

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: any[];
  accessory?: any;
}

export interface ActionBlock extends SlackBlock {
  type: 'actions';
  elements: SlackBlockElement[];
}

export interface SlackBlockElement {
  type: 'button' | 'static_select' | 'overflow';
  text?: { type: 'mrkdwn'; text: string };
  action_id?: string;
  value?: string;
  url?: string;
}

// ─── Rich Message Builder ─────────────────────────────────

export class SlackMessageBuilder {
  private blocks: SlackBlock[] = [];
  private text = '';

  text(t: string): this { this.text = t; return this; }

  /** Section with markdown text */
  section(markdown: string, accessory?: any): this {
    const block: SlackBlock = { type: 'section', text: { type: 'mrkdwn', text: markdown } };
    if (accessory) block.accessory = accessory;
    this.blocks.push(block);
    return this;
  }

  /** Divider */
  divider(): this { this.blocks.push({ type: 'divider' }); return this; }

  /** Action buttons row */
  actions(buttons: Array<{ label: string; value: string; style?: 'primary' | 'danger'; actionId: string }>): this {
    const block: ActionBlock = {
      type: 'actions',
      elements: buttons.map(b => ({
        type: 'button',
        text: { type: 'mrkdwn', text: b.label },
        action_id: b.actionId,
        value: b.value,
        ...(b.style ? { style: b.style } : {}),
      })),
    };
    this.blocks.push(block);
    return this;
  }

  /** Context block for metadata */
  context(text: string): this {
    this.blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text }] });
    return this;
  }

  build(): SlackMessage {
    return { text: this.text, blocks: this.blocks, channel: '' };
  }
}

// ─── Thread Memory ────────────────────────────────────────

export interface ThreadContext {
  channelId: string;
  threadTs: string;
  summary: string;
  keyDecisions: string[];
  lastUpdated: number;
  messageCount: number;
}

export class SlackThreadMemory {
  private threads = new Map<string, ThreadContext>();

  key(channelId: string, threadTs: string) {
    return `${channelId}:${threadTs}`;
  }

  get(channelId: string, threadTs: string): ThreadContext | undefined {
    return this.threads.get(this.key(channelId, threadTs));
  }

  update(ctx: ThreadContext): void {
    this.threads.set(this.key(ctx.channelId, ctx.threadTs), ctx);
  }

  /** Summarize a thread when it gets long (every N messages) */
  async summarizeThread(
    channelId: string,
    threadTs: string,
    recentMessages: string[],
    summarizeFn: (msgs: string[]) => Promise<string>
  ): Promise<string> {
    const key = this.key(channelId, threadTs);
    const existing = this.threads.get(key);
    const summary = await summarizeFn(recentMessages);

    const ctx: ThreadContext = {
      channelId,
      threadTs,
      summary,
      keyDecisions: existing?.keyDecisions || [],
      lastUpdated: Date.now(),
      messageCount: (existing?.messageCount || 0) + recentMessages.length,
    };

    this.threads.set(key, ctx);
    return summary;
  }

  /** Build a thread context prompt for the agent */
  buildContextPrompt(channelId: string, threadTs: string): string {
    const ctx = this.threads.get(this.key(channelId, threadTs));
    if (!ctx) return '';

    return [
      '=== Previous Thread Context ===',
      `Summary so far: ${ctx.summary}`,
      ctx.keyDecisions.length ? `Key decisions: ${ctx.keyDecisions.join(', ')}` : '',
      `Messages in thread: ${ctx.messageCount}`,
      '===',
    ].join('\n');
  }
}

// ─── Daily Digest ─────────────────────────────────────────

export interface DailyDigest {
  date: string;
  channelSummaries: Record<string, string>; // channel -> summary
  actionItems: string[];
  decisions: string[];
}

export class DailyDigestBuilder {
  private summaries: Record<string, string> = {};
  private actions: string[] = [];
  private decisions: string[] = [];

  addChannelSummary(channel: string, summary: string): this {
    this.summaries[channel] = summary;
    return this;
  }

  addActionItem(item: string): this {
    this.actions.push(item);
    return this;
  }

  addDecision(decision: string): this {
    this.decisions.push(decision);
    return this;
  }

  build(): DailyDigest {
    return {
      date: new Date().toISOString().split('T')[0],
      channelSummaries: { ...this.summaries },
      actionItems: [...this.actions],
      decisions: [...this.decisions],
    };
  }

  formatSlack(): SlackMessage {
    const digest = this.build();

    const builder = new SlackMessageBuilder()
      .text(`*Daily Standup — ${digest.date}*`)
      .divider();

    for (const [channel, summary] of Object.entries(digest.channelSummaries)) {
      builder.section(`*#${channel}*\n${summary}`);
    }

    if (digest.actionItems.length) {
      builder.divider().section('*Action Items*\n' + digest.actionItems.map(a => `> ${a}`).join('\n'));
    }

    if (digest.decisions.length) {
      builder.divider().section('*Decisions*\n' + digest.decisions.map(d => `> ${d}`).join('\n'));
    }

    return builder.build();
  }
}

// ─── Spiktor Block Kit Primitives ─────────────────────────

export const APPROVE_BUTTON = { label: ':white_check_mark: Approve', value: 'approve', actionId: 'spiktor_approve', style: 'primary' as const };
export const REJECT_BUTTON = { label: ':x: Reject', value: 'reject', actionId: 'spiktor_reject', style: 'danger' as const };
export const EDIT_BUTTON = { label: ':pencil2: Edit', value: 'edit', actionId: 'spiktor_edit' };
export const VIEW_CODE_BUTTON = { label: ':eyes: View Code', value: 'view', actionId: 'spiktor_view_code' };
export const DEPLOY_BUTTON = { label: ':rocket: Deploy', value: 'deploy', actionId: 'spiktor_deploy', style: 'primary' as const };
export const CANCEL_BUTTON = { label: ':no_entry_sign: Cancel', value: 'cancel', actionId: 'spiktor_cancel' };

/** Standard code review message with action buttons */
export function codeReviewMessage(repo: string, pr: string, summary: string, author: string): SlackMessage {
  return new SlackMessageBuilder()
    .text(`*:rotating_light: Code Review: ${repo}*`)
    .section(`*PR:* <${pr}|${pr.split('/').pop()}>  \n*Author:* ${author}\n${summary}`)
    .divider()
    .actions([APPROVE_BUTTON, REJECT_BUTTON, VIEW_CODE_BUTTON])
    .context(`Requested by Spiktor • ${new Date().toLocaleTimeString()}`)
    .build();
}

/** Task completion message with deploy option */
export function taskCompleteMessage(taskId: string, summary: string, files: string[]): SlackMessage {
  return new SlackMessageBuilder()
    .text(`*:white_check_mark: Task Complete — ${taskId}*`)
    .section(summary)
    .section(`*Files modified (${files.length}):*\n${files.slice(0, 5).map(f => `> \`${f}\``).join('\n')}${files.length > 5 ? `\n> ...and ${files.length - 5} more` : ''}`)
    .actions([DEPLOY_BUTTON, VIEW_CODE_BUTTON, EDIT_BUTTON])
    .build();
}

/** Confirmation dialog for destructive actions */
export function confirmActionMessage(action: string, reason: string): SlackMessage {
  return new SlackMessageBuilder()
    .text(`*:warning: Confirm: ${action}*`)
    .section(reason)
    .actions([APPROVE_BUTTON, CANCEL_BUTTON])
    .build();
}
