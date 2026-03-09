import { WebClient } from '@slack/web-api';
import { channelQueries, processedQueries, taskQueries, linkQueries, summaryQueries } from '../db/database';
import { parseChannelMessages, generateChannelSummary, SlackMessage } from './claude';

let slackClient: WebClient | null = null;

export function setSlackClient(client: WebClient) {
  slackClient = client;
}

// ─── Fetch new messages ───────────────────────────────────────────────────────

async function fetchNewMessages(
  channelId: string,
  hoursBack: number
): Promise<SlackMessage[]> {
  if (!slackClient) throw new Error('Slack client not initialized');

  const oldest = String(Date.now() / 1000 - hoursBack * 3600);

  try {
    const result = await slackClient.conversations.history({
      channel: channelId,
      oldest,
      limit: 200,
    });

    const messages = (result.messages || []) as Array<{
      ts?: string; user?: string; text?: string; username?: string; subtype?: string; bot_id?: string;
    }>;

    return messages
      .filter(m => m.ts && m.text && !m.bot_id && !m.subtype)
      .filter(m => !processedQueries.isProcessed(channelId, m.ts!))
      .map(m => ({ ts: m.ts!, user: m.user, text: m.text!, username: m.username }));
  } catch (err: any) {
    if (err?.data?.error === 'not_in_channel') {
      console.warn(`[Monitor] Bot not in channel ${channelId}, skipping`);
      return [];
    }
    throw err;
  }
}

// ─── Resolve user IDs to display names ───────────────────────────────────────

const userCache = new Map<string, string>();

async function resolveUserName(userId: string): Promise<string> {
  if (userCache.has(userId)) return userCache.get(userId)!;
  if (!slackClient) return userId;
  try {
    const info = await slackClient.users.info({ user: userId });
    const name = (info.user as any)?.display_name || (info.user as any)?.real_name || userId;
    userCache.set(userId, name);
    return name;
  } catch { return userId; }
}

async function enrichMessages(messages: SlackMessage[]): Promise<SlackMessage[]> {
  return Promise.all(
    messages.map(async m => ({
      ...m,
      username: m.user ? await resolveUserName(m.user) : m.username || 'Unknown',
    }))
  );
}

// ─── Process a single channel ─────────────────────────────────────────────────

export async function processChannel(channel: {
  slack_channel_id: string;
  slack_channel_name: string;
  priority: string;
  channel_type?: string;
  history_hours?: number | null;
}) {
  const channelType = (channel.channel_type as 'work' | 'learning' | 'mixed') ?? 'work';
  const globalHours = parseInt(process.env.HISTORY_HOURS || '24');
  const hoursBack = channel.history_hours ?? globalHours;

  console.log(`[Monitor] Processing #${channel.slack_channel_name} (${channel.priority}, ${channelType}, ${hoursBack}h window)`);

  const rawMessages = await fetchNewMessages(channel.slack_channel_id, hoursBack);
  if (rawMessages.length === 0) {
    console.log(`[Monitor] No new messages in #${channel.slack_channel_name}`);
    channelQueries.updateLastPolled(channel.slack_channel_id);
    return;
  }

  const messages = await enrichMessages(rawMessages);
  console.log(`[Monitor] Found ${messages.length} new messages, sending to Claude...`);

  const parsed = await parseChannelMessages(
    channel.slack_channel_name,
    channel.priority,
    messages,
    channelType,
    process.env.OWNER_SLACK_ID || undefined
  );

  // Store extracted tasks (only for non-learning channels)
  for (const task of parsed.tasks) {
    taskQueries.create({
      title: task.title,
      description: task.description ?? null,
      slack_channel_id: channel.slack_channel_id,
      assignee: task.assignee ?? null,
      due_date: task.due_date ?? null,
      status: 'open',
      priority: task.priority ?? 'medium',
      task_category: task.task_category ?? 'action_item',
      source_type: 'slack_batch',
      source_message: null,
      source_ts: task.source_ts ?? null,
      template_id: null,
    });
  }

  // Store extracted links
  for (const link of parsed.links) {
    linkQueries.create({
      url: link.url,
      title: link.title ?? null,
      description: link.description ?? null,
      slack_channel_id: channel.slack_channel_id,
      source_ts: link.source_ts ?? null,
      source_message: null,
      is_read: 0,
      notes: null,
      category: link.category ?? 'other',
    });
  }

  // Generate and store channel summary
  try {
    const summaryResult = await generateChannelSummary(
      channel.slack_channel_name,
      messages,
      parsed.tasks.length,
      parsed.links.length
    );
    const now = new Date().toISOString();
    const periodStart = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();
    summaryQueries.upsert({
      slack_channel_id: channel.slack_channel_id,
      summary_text: summaryResult.summary,
      key_topics: JSON.stringify(summaryResult.key_topics),
      top_contributors: JSON.stringify(summaryResult.top_contributors),
      task_count: parsed.tasks.length,
      link_count: parsed.links.length,
      period_start: periodStart,
      period_end: now,
    });
  } catch (err) {
    console.error(`[Monitor] Error generating summary for #${channel.slack_channel_name}:`, err);
  }

  // Mark all messages as processed
  for (const msg of messages) {
    processedQueries.markProcessed(channel.slack_channel_id, msg.ts);
  }

  // Update last polled timestamp
  channelQueries.updateLastPolled(channel.slack_channel_id);

  console.log(`[Monitor] #${channel.slack_channel_name}: ${parsed.tasks.length} tasks, ${parsed.links.length} links extracted`);
}

// ─── Process all active channels ─────────────────────────────────────────────

export async function processAllChannels() {
  const channels = channelQueries.getActive();
  console.log(`[Monitor] Starting poll cycle for ${channels.length} active channels`);

  for (const channel of channels) {
    try {
      await processChannel(channel);
    } catch (err) {
      console.error(`[Monitor] Error processing #${channel.slack_channel_name}:`, err);
    }
  }
}
