import cron from 'node-cron';
import { channelQueries, taskQueries, digestQueries } from '../db/database';
import { generateDigest } from './claude';
import { processAllChannels, processChannel } from './channel-monitor';

let slackPostFn: ((channelId: string, text: string) => Promise<string | undefined>) | null = null;

export function setSlackPostFn(fn: typeof slackPostFn) {
  slackPostFn = fn;
}

// ─── Run digest for a channel ─────────────────────────────────────────────────

async function runDigest(channelId: string, channelName: string, priority: string) {
  if (!slackPostFn) return;

  const openTasks = taskQueries.getAll({ slack_channel_id: channelId, status: 'open' });

  // For digest, we pass recent tasks instead of fetching fresh messages
  // (messages were already processed by the monitor)
  const digestText = await generateDigest(channelName, priority, [], openTasks);

  const slackTs = await slackPostFn(channelId, digestText);
  digestQueries.save(channelId, digestText, slackTs);

  console.log(`[Scheduler] Digest sent to #${channelName}`);
}

// ─── Channel polling jobs ─────────────────────────────────────────────────────

const activeCronJobs = new Map<string, cron.ScheduledTask>();

// Default intervals by priority (minutes)
const DEFAULT_INTERVALS: Record<string, number> = {
  p0: parseInt(process.env.P0_POLL_INTERVAL || '10'),
  p1: parseInt(process.env.P1_POLL_INTERVAL || '30'),
};

// ─── Per-channel polling jobs ─────────────────────────────────────────────────

export function refreshPollingSchedules() {
  // Stop and remove all existing per-channel poll jobs
  for (const [key, job] of activeCronJobs.entries()) {
    if (key.startsWith('poll_ch_')) {
      job.stop();
      activeCronJobs.delete(key);
    }
  }

  const channels = channelQueries.getActive();

  for (const channel of channels) {
    const intervalMinutes = channel.poll_interval ?? DEFAULT_INTERVALS[channel.priority] ?? 30;
    const cronExpr = `*/${intervalMinutes} * * * *`;
    const jobKey = `poll_ch_${channel.slack_channel_id}`;

    if (!cron.validate(cronExpr)) {
      console.warn(`[Scheduler] Invalid cron expression for #${channel.slack_channel_name}: ${cronExpr}`);
      continue;
    }

    const job = cron.schedule(cronExpr, async () => {
      try {
        const latest = channelQueries.getBySlackId(channel.slack_channel_id);
        if (!latest || !latest.is_active) return; // channel was removed/paused
        await processChannel(latest);
      } catch (err) {
        console.error(`[Scheduler] Error polling #${channel.slack_channel_name}:`, err);
      }
    });

    activeCronJobs.set(jobKey, job);
    console.log(`[Scheduler] #${channel.slack_channel_name} polling every ${intervalMinutes} min`);
  }
}

// ─── Dynamic digest jobs (per channel schedule) ───────────────────────────────

function scheduleChannelDigests() {
  // Stop all digest jobs
  for (const [key, job] of activeCronJobs.entries()) {
    if (key.startsWith('digest_')) {
      job.stop();
      activeCronJobs.delete(key);
    }
  }

  const channels = channelQueries.getActive().filter(c => c.digest_enabled);

  for (const channel of channels) {
    const jobKey = `digest_${channel.slack_channel_id}`;

    if (!cron.validate(channel.digest_schedule)) {
      console.warn(`[Scheduler] Invalid cron for #${channel.slack_channel_name}: ${channel.digest_schedule}`);
      continue;
    }

    const job = cron.schedule(channel.digest_schedule, async () => {
      try {
        await runDigest(channel.slack_channel_id, channel.slack_channel_name, channel.priority);
      } catch (err) {
        console.error(`[Scheduler] Digest error for #${channel.slack_channel_name}:`, err);
      }
    });

    activeCronJobs.set(jobKey, job);
    console.log(`[Scheduler] Digest scheduled for #${channel.slack_channel_name}: ${channel.digest_schedule}`);
  }
}

// ─── Start all scheduled jobs ─────────────────────────────────────────────────

export function startScheduler() {
  refreshPollingSchedules();
  scheduleChannelDigests();
  console.log('[Scheduler] All jobs started');
}

// ─── Re-schedule digests when channels change ─────────────────────────────────

export function refreshDigestSchedules() {
  scheduleChannelDigests();
}

// ─── Manual digest trigger (from dashboard) ───────────────────────────────────

export async function triggerManualDigest(channelId: string): Promise<string> {
  const channel = channelQueries.getBySlackId(channelId);
  if (!channel) throw new Error('Channel not found');

  const openTasks = taskQueries.getAll({ slack_channel_id: channelId, status: 'open' });
  return generateDigest(channel.slack_channel_name, channel.priority, [], openTasks);
}
