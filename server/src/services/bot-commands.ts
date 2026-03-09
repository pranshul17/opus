import { taskQueries, channelQueries, taskUpdateQueries, summaryQueries, mentionQueries } from '../db/database';
import { classifyMention } from './claude';
import { triggerManualDigest } from './scheduler';

// ─── Fuzzy title matching ─────────────────────────────────────────────────────

function normalizeText(text: string): string {
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

function findTaskByFuzzyTitle(channelId: string, query: string, allStatuses = false) {
  const tasks = taskQueries
    .getAll({ slack_channel_id: channelId })
    .filter(t => allStatuses || t.status === 'open' || t.status === 'in_progress');

  const normalizedQuery = normalizeText(query);
  let best: { task: (typeof tasks)[0]; score: number } | null = null;

  for (const task of tasks) {
    const score = jaccardSimilarity(normalizeText(task.title), normalizedQuery);
    if (!best || score > best.score) best = { task, score };
  }

  return best && best.score >= 0.3 ? best.task : null;
}

// ─── Priority parsing ─────────────────────────────────────────────────────────

function parsePriority(text: string): { priority: 'high' | 'medium' | 'low'; remainder: string } {
  const match = text.match(/\b(high|medium|low|urgent|asap|critical)\b/i);
  if (!match) return { priority: 'medium', remainder: text };

  const word = match[1].toLowerCase();
  const priority: 'high' | 'medium' | 'low' = ['high', 'urgent', 'asap', 'critical'].includes(word)
    ? 'high'
    : word === 'low'
    ? 'low'
    : 'medium';

  const remainder = text.replace(match[0], '').replace(/\s+/g, ' ').trim();
  return { priority, remainder };
}

// ─── Due date parsing ─────────────────────────────────────────────────────────

function parseDueDate(text: string): { date: string | null; remainder: string } {
  // Handle "next week" as a special two-word phrase
  const nextWeekMatch = text.match(/\bby\s+next\s+week\b/i);
  if (nextWeekMatch) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return {
      date: d.toISOString().split('T')[0],
      remainder: text.replace(nextWeekMatch[0], '').replace(/\s+/g, ' ').trim(),
    };
  }

  const byMatch = text.match(
    /\bby\s+(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|\d{4}-\d{2}-\d{2})\b/i,
  );
  if (!byMatch) return { date: null, remainder: text };

  const dateStr = byMatch[1].toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let date: Date | null = null;

  if (dateStr === 'today') {
    date = new Date(today);
  } else if (dateStr === 'tomorrow') {
    date = new Date(today);
    date.setDate(today.getDate() + 1);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    date = new Date(dateStr + 'T00:00:00');
  } else {
    const dayMap: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
      sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
    };
    const target = dayMap[dateStr];
    if (target !== undefined) {
      const curDay = today.getDay();
      let diff = target - curDay;
      if (diff <= 0) diff += 7; // Always schedule to the *next* occurrence
      date = new Date(today);
      date.setDate(today.getDate() + diff);
    }
  }

  const remainder = text.replace(byMatch[0], '').replace(/\s+/g, ' ').trim();
  return {
    date: date ? date.toISOString().split('T')[0] : null,
    remainder,
  };
}

// ─── Strip bot @mention from text ────────────────────────────────────────────

function stripMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, '').replace(/\s+/g, ' ').trim();
}

// ─── Result type ─────────────────────────────────────────────────────────────

export interface CommandResult {
  text: string;
}

// ─── Command: task: ───────────────────────────────────────────────────────────

export async function cmdCreateTask(
  rawText: string,
  channelId: string,
  channelName: string,
  ts: string,
): Promise<CommandResult> {
  const body = rawText.replace(/^task:\s*/i, '').trim();

  // Parse priority first so it doesn't get caught inside the date phrase
  const { priority, remainder: bodyNoPriority } = parsePriority(body);
  const { date, remainder: title } = parseDueDate(bodyNoPriority);

  if (!title || title.length < 3) {
    return { text: '⚠️ Usage: `task: <description> [by Friday] [high|medium|low]`' };
  }

  const task = taskQueries.create({
    title: title.slice(0, 200),
    description: `Created via bot command in #${channelName}`,
    slack_channel_id: channelId,
    assignee: null,
    due_date: date,
    status: 'open',
    priority,
    task_category: 'action_item',
    source_type: 'bot_mention',
    source_message: rawText,
    source_ts: ts,
    template_id: null,
  });

  const dueStr = date ? ` · due ${date}` : '';
  const prioEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡';

  return {
    text: `✅ Task created: *${task.title}*${dueStr} ${prioEmoji}\n_#${task.id} · Check the Opus dashboard to manage it._`,
  };
}

// ─── Command: done: ───────────────────────────────────────────────────────────

export async function cmdMarkDone(rawText: string, channelId: string): Promise<CommandResult> {
  const query = rawText.replace(/^done:\s*/i, '').trim();
  if (!query) return { text: '⚠️ Usage: `done: <task title or fragment>`' };

  const task = findTaskByFuzzyTitle(channelId, query);
  if (!task) {
    return {
      text: `❓ Couldn't find an open task matching *"${query}"*. Check the dashboard to close it manually.`,
    };
  }

  taskQueries.update(task.id, { status: 'completed' });
  taskUpdateQueries.create({
    task_id: task.id,
    author: 'bot',
    content: 'Marked done via bot command.',
    update_type: 'status_change',
  });

  return { text: `✅ Done! Closed task: *${task.title}*` };
}

// ─── Command: blocker: ────────────────────────────────────────────────────────

export async function cmdAddBlocker(rawText: string, channelId: string): Promise<CommandResult> {
  const blockerText = rawText.replace(/^blocker:\s*/i, '').trim();
  if (!blockerText) {
    return { text: '⚠️ Usage: `blocker: <description of what is blocking>`' };
  }

  // Attach to the most recently created open task in this channel
  const openTasks = taskQueries.getAll({ slack_channel_id: channelId, status: 'open' });
  if (openTasks.length === 0) {
    return {
      text: "❓ No open tasks found in this channel. Create one first with `task: <description>`",
    };
  }

  const task = openTasks[0]; // getAll returns DESC by created_at → most recent first
  taskQueries.update(task.id, { blocker: blockerText, status: 'in_progress' });
  taskUpdateQueries.create({
    task_id: task.id,
    author: 'bot',
    content: `🚧 Blocker added: ${blockerText}`,
    update_type: 'blocker',
  });

  return { text: `🚧 Blocker added to *${task.title}*:\n> ${blockerText}` };
}

// ─── Command: assign: ─────────────────────────────────────────────────────────

export async function cmdAssign(rawText: string, channelId: string): Promise<CommandResult> {
  const body = rawText.replace(/^assign:\s*/i, '').trim();

  // Supports: "task title → @U123" or "task title -> @U123"
  const arrowMatch = body.match(/^(.+?)\s*(?:→|->)\s*(<@[A-Z0-9]+>)\s*$/i);
  if (!arrowMatch) {
    return { text: '⚠️ Usage: `assign: <task title> → @username`' };
  }

  const [, titleQuery, userMention] = arrowMatch;
  const userIdMatch = userMention.match(/<@([A-Z0-9]+)>/);
  if (!userIdMatch) return { text: '⚠️ Could not parse the @mention. Try again.' };

  const userId = userIdMatch[1];
  const task = findTaskByFuzzyTitle(channelId, titleQuery.trim());
  if (!task) {
    return {
      text: `❓ Couldn't find an open task matching *"${titleQuery.trim()}"*. Check the dashboard.`,
    };
  }

  taskQueries.update(task.id, { assignee: userId });
  taskUpdateQueries.create({
    task_id: task.id,
    author: 'bot',
    content: `Assigned to <@${userId}> via bot command.`,
    update_type: 'comment',
  });

  return { text: `👤 Task *${task.title}* assigned to <@${userId}>` };
}

// ─── Command: status ─────────────────────────────────────────────────────────

export async function cmdStatus(channelId: string, channelName: string): Promise<CommandResult> {
  const allTasks = taskQueries.getAll({ slack_channel_id: channelId });
  const open = allTasks.filter(t => t.status === 'open');
  const inProgress = allTasks.filter(t => t.status === 'in_progress');
  const blocked = allTasks.filter(
    t => t.blocker && (t.status === 'open' || t.status === 'in_progress'),
  );
  const overdue = open.filter(t => t.due_date && new Date(t.due_date) < new Date());
  const highPriority = open.filter(t => t.priority === 'high');

  const lines: string[] = [
    `*📊 #${channelName} Status*`,
    `• Open: *${open.length}* · In Progress: *${inProgress.length}* · 🔴 High Priority: *${highPriority.length}*`,
  ];

  if (overdue.length > 0) {
    lines.push(`• ⚠️ Overdue: *${overdue.length}*`);
  }

  if (blocked.length > 0) {
    lines.push('');
    lines.push('*🚧 Active Blockers:*');
    blocked.slice(0, 3).forEach(t => {
      lines.push(`  • *${t.title}*\n    _${t.blocker}_`);
    });
    if (blocked.length > 3) lines.push(`  _…and ${blocked.length - 3} more_`);
  }

  const topTasks = highPriority.length > 0 ? highPriority : open;
  if (topTasks.length > 0) {
    lines.push('');
    lines.push(highPriority.length > 0 ? '*🔴 High Priority Tasks:*' : '*Open Tasks:*');
    topTasks.slice(0, 5).forEach(t => {
      const due = t.due_date ? ` · due ${t.due_date}` : '';
      const overdueMark = t.due_date && new Date(t.due_date) < new Date() ? ' ⚠️' : '';
      lines.push(`  • ${t.title}${due}${overdueMark}`);
    });
    if (topTasks.length > 5) lines.push(`  _…and ${topTasks.length - 5} more_`);
  }

  if (open.length === 0 && inProgress.length === 0) {
    lines.push('');
    lines.push('✨ All clear — no open tasks!');
  }

  return { text: lines.join('\n') };
}

// ─── Command: status <task name> ─────────────────────────────────────────────

function relativeTime(isoStr: string | null): string {
  if (!isoStr) return '—';
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(isoStr).toLocaleDateString();
}

export async function cmdTaskInfo(query: string, channelId: string, channelName: string): Promise<CommandResult> {
  if (!query) return { text: '⚠️ Usage: `status <task title or fragment>`' };

  // Try fuzzy match — search ALL statuses so completed tasks are findable too
  const task = findTaskByFuzzyTitle(channelId, query, true);
  if (!task) {
    return {
      text: `❓ No task found matching *"${query}"* in *#${channelName}*.\nTry \`status\` (no args) for a channel overview.`,
    };
  }

  // Fetch associated updates/notes
  const updates = taskUpdateQueries.getByTaskId(task.id);

  // ── Status line ─────────────────────────────────────────────────────────
  const statusEmoji: Record<string, string> = {
    open: '🔵 Open',
    in_progress: '🟠 In Progress',
    completed: '✅ Completed',
    cancelled: '⛔ Cancelled',
  };
  const prioEmoji: Record<string, string> = {
    high: '🔴 High',
    medium: '🟡 Medium',
    low: '🟢 Low',
  };
  const catLabel: Record<string, string> = {
    action_item: 'Action Item',
    decision: 'Decision',
    question: 'Question',
    fyi: 'FYI',
  };

  const isOverdue =
    task.due_date &&
    task.status !== 'completed' &&
    task.status !== 'cancelled' &&
    new Date(task.due_date) < new Date();

  const lines: string[] = [
    `*📋 Task #${task.id} — ${task.title}*`,
    '',
  ];

  // Core fields
  lines.push(`• *Status:* ${statusEmoji[task.status] ?? task.status}`);
  lines.push(`• *Priority:* ${prioEmoji[task.priority] ?? task.priority}`);
  lines.push(`• *Category:* ${catLabel[task.task_category] ?? task.task_category}`);
  lines.push(`• *Channel:* #${channelName}`);

  if (task.assignee) {
    lines.push(`• *Assignee:* <@${task.assignee}>`);
  }

  if (task.due_date) {
    lines.push(`• *Due:* ${task.due_date}${isOverdue ? ' ⚠️ _overdue_' : ''}`);
  }

  lines.push(`• *Created:* ${relativeTime(task.created_at)}`);
  lines.push(`• *Last updated:* ${relativeTime(task.updated_at)}`);

  if (task.source_type) {
    const srcLabel: Record<string, string> = {
      slack_batch: 'Slack batch poll',
      bot_mention: 'Bot @mention',
      template: 'Template',
      manual: 'Manual',
    };
    lines.push(`• *Source:* ${srcLabel[task.source_type] ?? task.source_type}`);
  }

  // Description
  if (task.description) {
    const desc = task.description.slice(0, 300) + (task.description.length > 300 ? '…' : '');
    lines.push('');
    lines.push('*📝 Description:*');
    desc.split('\n').forEach(l => l.trim() && lines.push(`> ${l.trim()}`));
  }

  // Blocker
  if (task.blocker) {
    lines.push('');
    lines.push(`*🚧 Blocker:*\n> ${task.blocker}`);
  }

  // Updates / activity log
  if (updates.length > 0) {
    lines.push('');
    lines.push(`*🗓 Activity (${updates.length}):*`);
    // Show up to 5 most recent, newest first
    [...updates].reverse().slice(0, 5).reverse().forEach(u => {
      const typeIcon: Record<string, string> = {
        status_change: '🔄',
        blocker: '🚧',
        comment: '💬',
        note: '📝',
      };
      const icon = typeIcon[u.update_type ?? ''] ?? '•';
      const author = u.author && u.author !== 'bot' ? `<@${u.author}>` : '_bot_';
      const age = relativeTime(u.created_at);
      const content = u.content.slice(0, 120) + (u.content.length > 120 ? '…' : '');
      lines.push(`  ${icon} ${author} _(${age})_: ${content}`);
    });
    if (updates.length > 5) {
      lines.push(`  _…${updates.length - 5} earlier entries — view full history on the dashboard._`);
    }
  }

  return { text: lines.join('\n') };
}

// ─── Command: digest ─────────────────────────────────────────────────────────

export async function cmdDigest(channelId: string): Promise<CommandResult> {
  try {
    const text = await triggerManualDigest(channelId);
    return { text };
  } catch (err: any) {
    return { text: `❌ Failed to generate digest: ${err.message}` };
  }
}

// ─── Command: summary ────────────────────────────────────────────────────────

export async function cmdSummary(channelId: string, channelName: string): Promise<CommandResult> {
  const latest = summaryQueries.getLatest(channelId);

  if (!latest) {
    return {
      text: `📋 No summary available yet for *#${channelName}*. Summaries are generated after each poll run.`,
    };
  }

  const topics = (() => {
    try {
      return JSON.parse(latest.key_topics) as string[];
    } catch {
      return [] as string[];
    }
  })();
  const contributors = (() => {
    try {
      return JSON.parse(latest.top_contributors) as string[];
    } catch {
      return [] as string[];
    }
  })();

  const lines = [
    `*📋 #${channelName} Latest Summary*`,
    `_Generated: ${new Date(latest.created_at).toLocaleString()}_`,
    '',
    latest.summary_text,
  ];

  if (topics.length > 0) {
    lines.push('');
    lines.push(`*Topics:* ${topics.join(' · ')}`);
  }
  if (contributors.length > 0) {
    lines.push(`*Top contributors:* ${contributors.join(', ')}`);
  }

  return { text: lines.join('\n') };
}

// ─── Help text ────────────────────────────────────────────────────────────────

export function cmdHelp(isOwner: boolean): CommandResult {
  if (isOwner) {
    return {
      text: [
        '*⚡ Opus Bot — Owner Commands*',
        '',
        '`task: <title> [by <date>] [high|medium|low]` — Create a task',
        '`done: <title>` — Close a task by fuzzy title match',
        '`blocker: <description>` — Add a blocker to the latest open task',
        '`assign: <title> → @user` — Reassign a task',
        '`status` — Show open task count, blockers, and top tasks',
        '`status <title>` — Deep-dive on a specific task (all fields + history)',
        '`digest` — Trigger a full AI channel digest right now',
        '`summary` — Show the latest AI channel summary',
        '`help` — Show this message',
        '',
        '_Dates: today · tomorrow · Friday · next week · 2026-03-14_',
      ].join('\n'),
    };
  }

  return {
    text: [
      "*⚡ Opus Bot*",
      "I'm Pranshul's personal Slack task manager.",
      '',
      'Available to you:',
      '`@opus status` — See open tasks and blockers for this channel',
      '`@opus status <task name>` — Look up a specific task',
      '',
      '_Only Pranshul can create, close, or modify tasks._',
    ].join('\n'),
  };
}

// ─── Process an owner @mention (real-time, Claude-powered) ───────────────────

export interface OwnerMentionEvent {
  channelId: string;
  channelName: string;
  senderUserId: string;
  text: string;
  ts: string;
  threadTs?: string;
  /** Optional — if provided, Opus posts a confirmation reply in the thread when a task is created. */
  postReply?: (text: string) => Promise<void>;
}

export async function processOwnerMention(event: OwnerMentionEvent): Promise<void> {
  const openTasks = taskQueries
    .getAll({ slack_channel_id: event.channelId, status: 'open' })
    .slice(0, 20) // cap context size
    .map(t => ({ id: t.id, title: t.title }));

  const customContext = process.env.CUSTOM_CONTEXT ?? '';

  const result = await classifyMention(
    event.text,
    event.senderUserId,
    event.channelName,
    openTasks,
    customContext,
  );

  if (result.classification === 'task' && result.task) {
    const { title, priority, due_date, duplicate_task_id } = result.task;

    if (duplicate_task_id) {
      // Group with existing task — append context
      const existing = taskQueries.getById(duplicate_task_id);
      if (existing) {
        const updatedDesc = [
          existing.description ?? '',
          `\n— Re-mentioned: ${new Date().toLocaleString()}\n  "${event.text}"`,
        ].join('').trim();
        taskQueries.update(existing.id, { description: updatedDesc });

        // Log mention linked to that task
        mentionQueries.create({
          slack_channel_id: event.channelId,
          channel_name: event.channelName,
          sender_id: event.senderUserId,
          message_text: event.text,
          ts: event.ts,
          thread_ts: event.threadTs ?? null,
          summary: `Duplicate of task #${existing.id}: ${existing.title}`,
          relevance: priority === 'high' ? 'high' : 'medium',
          is_read: 0,
          linked_task_id: existing.id,
        });

        console.log(`[Bot] Owner mention grouped with task #${existing.id}: "${existing.title.slice(0, 50)}"`);

        // Reply in thread — already tracked
        await event.postReply?.(
          `📌 Already tracked — linked to existing task: *${existing.title}*\n_Task #${existing.id} · Updated with this mention._`
        );
        return;
      }
    }

    // New task
    const task = taskQueries.create({
      title: title.slice(0, 200),
      description: `From @mention in #${event.channelName}\nOriginal: ${event.text}`,
      slack_channel_id: event.channelId,
      assignee: null,
      due_date: due_date ?? null,
      status: 'open',
      priority,
      task_category: 'action_item',
      source_type: 'bot_mention',
      source_message: event.text,
      source_ts: event.ts,
      template_id: null,
    });

    // Log mention linked to new task
    mentionQueries.create({
      slack_channel_id: event.channelId,
      channel_name: event.channelName,
      sender_id: event.senderUserId,
      message_text: event.text,
      ts: event.ts,
      thread_ts: event.threadTs ?? null,
      summary: null,
      relevance: priority === 'high' ? 'high' : 'medium',
      is_read: 0,
      linked_task_id: task.id,
    });

    const prioEmoji = priority === 'high' ? '🔴' : priority === 'low' ? '🟢' : '🟡';
    const dueStr = due_date ? ` · due ${due_date}` : '';

    // Reply in thread — task created
    await event.postReply?.(
      `✅ Task created: *${task.title}*${dueStr} ${prioEmoji}\n_#${task.id} · Tracked in the Opus dashboard._`
    );

    console.log(`[Bot] Owner mention → new task #${task.id}: "${title.slice(0, 50)}"`);
  } else if (result.classification === 'mention' && result.mention) {
    // Informational — log to mentions table
    mentionQueries.create({
      slack_channel_id: event.channelId,
      channel_name: event.channelName,
      sender_id: event.senderUserId,
      message_text: event.text,
      ts: event.ts,
      thread_ts: event.threadTs ?? null,
      summary: result.mention.summary,
      relevance: result.mention.relevance,
      is_read: 0,
      linked_task_id: null,
    });

    console.log(`[Bot] Owner mention logged (${result.mention.relevance}): "${result.mention.summary.slice(0, 60)}"`);
  } else {
    console.log(`[Bot] Owner mention ignored: "${event.text.slice(0, 60)}"`);
  }
}

// ─── Main command dispatcher ──────────────────────────────────────────────────

export interface DispatchOptions {
  text: string;        // full message text including @mention
  channelId: string;
  channelName: string;
  userId: string;
  ts: string;
}

export async function dispatchCommand(opts: DispatchOptions): Promise<CommandResult> {
  const { text, channelId, channelName, userId, ts } = opts;
  const isOwner = !!process.env.OWNER_SLACK_ID && userId === process.env.OWNER_SLACK_ID;

  // Strip the bot @mention and normalize whitespace
  const clean = stripMention(text).trim();
  const lower = clean.toLowerCase();

  // ── Non-owner: read-only access ──────────────────────────────────────────
  if (!isOwner) {
    if (lower === 'status') {
      return cmdStatus(channelId, channelName);
    }
    if (lower.startsWith('status ')) {
      return cmdTaskInfo(clean.slice('status '.length).trim(), channelId, channelName);
    }
    if (lower === 'help' || lower === '') {
      return cmdHelp(false);
    }
    return {
      text: "👋 I'm Opus, Pranshul's personal task manager. Only he can manage tasks through me.\n\nYou can use `status` to see open tasks for this channel, or `status <task name>` to look up a specific task.",
    };
  }

  // ── Owner: full command set ──────────────────────────────────────────────
  if (/^task:/i.test(lower)) {
    return cmdCreateTask(clean, channelId, channelName, ts);
  }
  if (/^done:/i.test(lower)) {
    return cmdMarkDone(clean, channelId);
  }
  if (/^blocker:/i.test(lower)) {
    return cmdAddBlocker(clean, channelId);
  }
  if (/^assign:/i.test(lower)) {
    return cmdAssign(clean, channelId);
  }
  if (lower === 'status') {
    return cmdStatus(channelId, channelName);
  }
  if (lower.startsWith('status ')) {
    return cmdTaskInfo(clean.slice('status '.length).trim(), channelId, channelName);
  }
  if (lower === 'digest') {
    return cmdDigest(channelId);
  }
  if (lower === 'summary') {
    return cmdSummary(channelId, channelName);
  }
  if (lower === 'help' || lower === '') {
    return cmdHelp(true);
  }

  // Unrecognised command — hint to use task:
  return {
    text: `❓ Unknown command. Type \`help\` to see available commands.\n\nDid you mean: \`task: ${clean}\`?`,
  };
}
