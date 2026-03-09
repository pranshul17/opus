import { App, LogLevel } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { setSlackClient } from '../services/channel-monitor';
import { setSlackPostFn } from '../services/scheduler';
import { evaluateAutoReplies, createTaskFromMention, SlackEvent } from '../services/auto-responder';
import { dispatchCommand, processOwnerMention } from '../services/bot-commands';
import { channelQueries } from '../db/database';

let botUserId: string | undefined;

export function createSlackApp(): App {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
    logLevel: process.env.NODE_ENV === 'development' ? LogLevel.WARN : LogLevel.ERROR,
  });

  return app;
}

// ─── Register event handlers ──────────────────────────────────────────────────

export function registerHandlers(app: App) {
  // Helper: get a human-readable channel name for any channel the bot is in.
  // Checks the Opus DB first (instant), then falls back to the Slack API.
  async function resolveChannelName(client: any, channelId: string): Promise<string> {
    const tracked = channelQueries.getBySlackId(channelId);
    if (tracked) return tracked.slack_channel_name;
    try {
      const info = await client.conversations.info({ channel: channelId });
      return (info.channel as any)?.name ?? channelId;
    } catch {
      return channelId; // last resort: use raw channel ID
    }
  }

  // ── app.message: listen to all channels the bot is a member of ────────────
  app.message(async ({ message, client }) => {
    const msg = message as any;
    if (!msg.ts || !msg.channel || msg.bot_id || msg.subtype) return;

    // Skip if this is a bot @mention — app_mention handler takes care of it
    if (botUserId && msg.text?.includes(`<@${botUserId}>`)) return;

    const ownerSlackId = process.env.OWNER_SLACK_ID;
    const isOwnerMentioned = !!(ownerSlackId && msg.text?.includes(`<@${ownerSlackId}>`));

    // Owner @mention → classify and log in ANY channel the bot is in (tracked or not)
    if (isOwnerMentioned) {
      const channelName = await resolveChannelName(client, msg.channel);
      processOwnerMention({
        channelId: msg.channel,
        channelName,
        senderUserId: msg.user || '',
        text: msg.text || '',
        ts: msg.ts,
        threadTs: msg.thread_ts,
      }).catch(err => console.error('[Bot] processOwnerMention error:', err));
    }

    // Auto-reply rules only apply to Opus-tracked channels
    const channel = channelQueries.getBySlackId(msg.channel);
    if (!channel) return;

    const event: SlackEvent = {
      channelId: msg.channel,
      text: msg.text || '',
      userId: msg.user || '',
      ts: msg.ts,
      threadTs: msg.thread_ts,
      botUserId,
    };

    const replies = evaluateAutoReplies(event);
    for (const reply of replies) {
      try {
        if (reply.ruleName === 'Bot Mention') {
          createTaskFromMention(event, channel.slack_channel_name);
        }
        await client.chat.postMessage({
          channel: msg.channel,
          thread_ts: msg.ts,
          text: reply.replyText,
        });
        console.log(`[Bot] Auto-replied in #${channel.slack_channel_name} (rule: ${reply.ruleName})`);
      } catch (err) {
        console.error('[Bot] Failed to send auto-reply:', err);
      }
    }
  });

  // ── app_mention: bot @mention — responds in ANY channel the bot is in ──────
  app.event('app_mention', async ({ event, client }) => {
    try {
      const channelName = await resolveChannelName(client, event.channel);

      const result = await dispatchCommand({
        text: event.text,
        channelId: event.channel,
        channelName,
        userId: event.user ?? '',
        ts: event.ts,
      });

      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: result.text,
      });

      console.log(`[Bot] Command handled in #${channelName} from ${event.user}`);
    } catch (err) {
      console.error('[Bot] Failed to handle app_mention:', err);
      try {
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: event.ts,
          text: '❌ Something went wrong processing your command. Check the Opus dashboard.',
        });
      } catch { /* ignore secondary failure */ }
    }
  });
}

// ─── Initialize and start the Slack app ──────────────────────────────────────

export async function startSlackApp(app: App): Promise<WebClient> {
  await app.start();

  // Get bot user ID for mention detection
  try {
    const auth = await app.client.auth.test();
    botUserId = (auth.user_id as string | undefined) ?? undefined;
    console.log(`[Slack] Bot started as @${auth.user} (${botUserId})`);
  } catch (err) {
    console.warn('[Slack] Could not get bot user ID:', err);
  }

  // Share the WebClient with the channel monitor
  setSlackClient(app.client as unknown as WebClient);

  // Share post function with scheduler
  setSlackPostFn(async (channelId: string, text: string) => {
    try {
      const result = await app.client.chat.postMessage({ channel: channelId, text });
      return result.ts as string | undefined;
    } catch (err) {
      console.error('[Bot] Failed to post message:', err);
      return undefined;
    }
  });

  return app.client as unknown as WebClient;
}

// ─── Standalone post message (for dashboard push) ────────────────────────────

export async function postToChannel(app: App, channelId: string, text: string): Promise<string | undefined> {
  try {
    const result = await app.client.chat.postMessage({ channel: channelId, text });
    return result.ts as string | undefined;
  } catch (err) {
    console.error('[Bot] Failed to post to channel:', err);
    throw err;
  }
}

// ─── List available channels (for channel setup) ──────────────────────────────

export async function listSlackChannels(app: App): Promise<Array<{ id: string; name: string }>> {
  try {
    const result = await app.client.conversations.list({
      types: 'public_channel,private_channel',
      limit: 200,
      exclude_archived: true,
    });

    return ((result.channels as any[]) || [])
      .filter(c => c.is_member)
      .map(c => ({ id: c.id, name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('[Bot] Failed to list channels:', err);
    return [];
  }
}
