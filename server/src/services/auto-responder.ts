import { ruleQueries, channelQueries, taskQueries } from '../db/database';

export interface SlackEvent {
  channelId: string;
  text: string;
  userId: string;
  ts: string;
  threadTs?: string;
  botUserId?: string;
}

// ─── Check if a message should trigger an auto-reply ─────────────────────────

function getChannelPriority(channelId: string): 'p0' | 'p1' | null {
  const channel = channelQueries.getBySlackId(channelId);
  return channel ? channel.priority : null;
}

function matchesRule(
  rule: { trigger_type: string; trigger_value: string; applies_to: string },
  event: SlackEvent,
  priority: 'p0' | 'p1' | null
): boolean {
  // Check if rule applies to this channel's priority
  if (rule.applies_to !== 'all') {
    if (!priority || rule.applies_to !== priority) return false;
  }

  const text = event.text.toLowerCase();

  switch (rule.trigger_type) {
    case 'keyword': {
      const keywords = rule.trigger_value.split('|').map(k => k.trim().toLowerCase());
      return keywords.some(kw => {
        // Word boundary matching for short words
        const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(event.text);
      });
    }
    case 'mention': {
      // Bot was @mentioned
      return event.botUserId ? event.text.includes(`<@${event.botUserId}>`) : false;
    }
    case 'pattern': {
      try {
        return new RegExp(rule.trigger_value, 'i').test(event.text);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

// ─── Process an incoming Slack message ───────────────────────────────────────

export interface AutoReplyResult {
  shouldReply: boolean;
  replyText: string;
  ruleId: number;
  ruleName: string;
}

export function evaluateAutoReplies(event: SlackEvent): AutoReplyResult[] {
  const priority = getChannelPriority(event.channelId);
  if (!priority) return []; // Not a tracked channel

  const rules = ruleQueries.getActive();
  const results: AutoReplyResult[] = [];

  for (const rule of rules) {
    if (matchesRule(rule, event, priority)) {
      results.push({
        shouldReply: true,
        replyText: rule.response_template,
        ruleId: rule.id,
        ruleName: rule.name,
      });
    }
  }

  return results;
}

// ─── Duplicate detection helpers ─────────────────────────────────────────────

function normalizeTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/<@[A-Z0-9]+>/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

function findDuplicateTask(channelId: string, newTitle: string) {
  const openTasks = taskQueries.findOpenByChannel(channelId);
  const normalizedNew = normalizeTitle(newTitle);
  const THRESHOLD = 0.55; // 55% word overlap = duplicate

  for (const task of openTasks) {
    const score = jaccardSimilarity(normalizeTitle(task.title), normalizedNew);
    if (score >= THRESHOLD) return task;
  }
  return null;
}

// ─── Create a task from a bot @mention ───────────────────────────────────────

export function createTaskFromMention(event: SlackEvent, channelName: string): { grouped: boolean; taskId: number } {
  // Extract the task text — everything after the @mention
  const taskText = event.text
    .replace(/<@[A-Z0-9]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (taskText.length < 5) return { grouped: false, taskId: -1 };

  // Check for duplicate
  const existing = findDuplicateTask(event.channelId, taskText);

  if (existing) {
    // Group: append new mention to description
    const updatedDesc = [
      existing.description || '',
      `\n— Re-mentioned: ${new Date().toLocaleString()}\n  "${event.text}"`,
    ].join('').trim();

    taskQueries.update(existing.id, { description: updatedDesc });
    console.log(`[AutoResponder] Grouped mention with existing task #${existing.id}: "${existing.title.slice(0, 50)}"`);
    return { grouped: true, taskId: existing.id };
  }

  // New task
  const created = taskQueries.create({
    title: taskText.slice(0, 200),
    description: `Created from Slack mention in #${channelName}\nOriginal message: ${event.text}`,
    slack_channel_id: event.channelId,
    assignee: null,
    due_date: null,
    status: 'open',
    priority: 'medium',
    task_category: 'action_item',
    source_type: 'bot_mention',
    source_message: event.text,
    source_ts: event.ts,
    template_id: null,
  });

  console.log(`[AutoResponder] Created task from mention: "${taskText.slice(0, 50)}"`);
  return { grouped: false, taskId: created.id };
}
