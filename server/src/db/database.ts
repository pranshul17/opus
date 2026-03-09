import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '../../../data');
const DB_PATH = path.join(DATA_DIR, 'opus.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let _db: BetterSqlite3.Database | null = null;

export function getDb(): BetterSqlite3.Database {
  if (!_db) {
    _db = new BetterSqlite3(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: BetterSqlite3.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_channel_id TEXT UNIQUE NOT NULL,
      slack_channel_name TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('p0', 'p1')),
      channel_type TEXT NOT NULL DEFAULT 'work' CHECK(channel_type IN ('work','learning','mixed')),
      is_active INTEGER NOT NULL DEFAULT 1,
      digest_enabled INTEGER NOT NULL DEFAULT 1,
      digest_schedule TEXT NOT NULL DEFAULT '0 9 * * 1',
      history_hours INTEGER,
      last_polled_at TEXT,
      poll_interval INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      slack_channel_id TEXT,
      assignee TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'completed', 'cancelled')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low')),
      task_category TEXT NOT NULL DEFAULT 'action_item' CHECK(task_category IN ('action_item','decision','question','fyi')),
      source_type TEXT NOT NULL DEFAULT 'manual' CHECK(source_type IN ('slack_batch','bot_mention','template','manual')),
      source_message TEXT,
      source_ts TEXT,
      template_id INTEGER REFERENCES templates(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT,
      description TEXT,
      slack_channel_id TEXT,
      source_ts TEXT,
      source_message TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      category TEXT DEFAULT 'other' CHECK(category IN ('article','tool','video','doc','other')),
      is_saved INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      key_concepts TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      content TEXT NOT NULL,
      variables TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS auto_reply_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL CHECK(trigger_type IN ('keyword', 'mention', 'pattern')),
      trigger_value TEXT NOT NULL,
      response_template TEXT NOT NULL,
      applies_to TEXT NOT NULL DEFAULT 'all' CHECK(applies_to IN ('p0', 'p1', 'all')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS processed_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_channel_id TEXT NOT NULL,
      slack_ts TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(slack_channel_id, slack_ts)
    );

    CREATE TABLE IF NOT EXISTS digest_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_channel_id TEXT NOT NULL,
      content TEXT NOT NULL,
      slack_ts TEXT,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author TEXT,
      content TEXT NOT NULL,
      update_type TEXT NOT NULL DEFAULT 'comment' CHECK(update_type IN ('comment','status_change','blocker','unblocked')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS channel_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_channel_id TEXT NOT NULL,
      summary_text TEXT NOT NULL,
      key_topics TEXT NOT NULL DEFAULT '[]',
      top_contributors TEXT NOT NULL DEFAULT '[]',
      task_count INTEGER DEFAULT 0,
      link_count INTEGER DEFAULT 0,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mentions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      sender_id TEXT,
      message_text TEXT NOT NULL,
      ts TEXT NOT NULL,
      thread_ts TEXT,
      summary TEXT,
      relevance TEXT NOT NULL DEFAULT 'medium' CHECK(relevance IN ('high', 'medium')),
      is_read INTEGER NOT NULL DEFAULT 0,
      linked_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Migrations for existing DBs ─────────────────────────────────────────────
  const migrations: Array<{ name: string; sql: string }> = [
    { name: 'channels_channel_type',  sql: `ALTER TABLE channels ADD COLUMN channel_type TEXT NOT NULL DEFAULT 'work' CHECK(channel_type IN ('work','learning','mixed'))` },
    { name: 'channels_history_hours', sql: `ALTER TABLE channels ADD COLUMN history_hours INTEGER` },
    { name: 'channels_last_polled',   sql: `ALTER TABLE channels ADD COLUMN last_polled_at TEXT` },
    { name: 'tasks_priority',         sql: `ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high','medium','low'))` },
    { name: 'tasks_task_category',    sql: `ALTER TABLE tasks ADD COLUMN task_category TEXT NOT NULL DEFAULT 'action_item' CHECK(task_category IN ('action_item','decision','question','fyi'))` },
    { name: 'tasks_source_type',      sql: `ALTER TABLE tasks ADD COLUMN source_type TEXT NOT NULL DEFAULT 'manual' CHECK(source_type IN ('slack_batch','bot_mention','template','manual'))` },
    { name: 'links_is_read',          sql: `ALTER TABLE links ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0` },
    { name: 'links_notes',            sql: `ALTER TABLE links ADD COLUMN notes TEXT` },
    { name: 'links_category',         sql: `ALTER TABLE links ADD COLUMN category TEXT DEFAULT 'other' CHECK(category IN ('article','tool','video','doc','other'))` },
    { name: 'tasks_blocker',          sql: `ALTER TABLE tasks ADD COLUMN blocker TEXT` },
    { name: 'channels_poll_interval', sql: `ALTER TABLE channels ADD COLUMN poll_interval INTEGER` },
    { name: 'links_is_saved',         sql: `ALTER TABLE links ADD COLUMN is_saved INTEGER NOT NULL DEFAULT 0` },
    { name: 'links_summary',          sql: `ALTER TABLE links ADD COLUMN summary TEXT` },
    { name: 'links_key_concepts',     sql: `ALTER TABLE links ADD COLUMN key_concepts TEXT DEFAULT '[]'` },
  ];

  for (const m of migrations) {
    try { db.exec(m.sql); } catch { /* column already exists */ }
  }

  // Seed default auto-reply rules if none exist
  const count = (db.prepare('SELECT COUNT(*) as n FROM auto_reply_rules').get() as { n: number }).n;
  if (count === 0) {
    db.prepare(`INSERT INTO auto_reply_rules (name, trigger_type, trigger_value, response_template, applies_to) VALUES (?, ?, ?, ?, ?)`).run(
      'Noted / Acknowledged', 'keyword', 'noted|acknowledged|ack|✅',
      '✅ Logged! Check the dashboard to track this item.',
      'all'
    );
    db.prepare(`INSERT INTO auto_reply_rules (name, trigger_type, trigger_value, response_template, applies_to) VALUES (?, ?, ?, ?, ?)`).run(
      'Bot Mention', 'mention', '@mention',
      '👋 I\'ve logged this — check the Opus dashboard to manage tasks and assignments.',
      'all'
    );
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Channel {
  id: number;
  slack_channel_id: string;
  slack_channel_name: string;
  priority: 'p0' | 'p1';
  channel_type: 'work' | 'learning' | 'mixed';
  is_active: number;
  digest_enabled: number;
  digest_schedule: string;
  history_hours: number | null;
  last_polled_at: string | null;
  poll_interval?: number | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  slack_channel_id: string | null;
  assignee: string | null;
  due_date: string | null;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  task_category: 'action_item' | 'decision' | 'question' | 'fyi';
  source_type: 'slack_batch' | 'bot_mention' | 'template' | 'manual';
  source_message: string | null;
  source_ts: string | null;
  template_id: number | null;
  blocker?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskUpdate {
  id: number;
  task_id: number;
  author: string | null;
  content: string;
  update_type: 'comment' | 'status_change' | 'blocker' | 'unblocked';
  created_at: string;
}

export interface Link {
  id: number;
  url: string;
  title: string | null;
  description: string | null;
  slack_channel_id: string | null;
  source_ts: string | null;
  source_message: string | null;
  is_read: number;
  notes: string | null;
  category: 'article' | 'tool' | 'video' | 'doc' | 'other';
  is_saved?: number;
  summary?: string | null;
  key_concepts?: string; // JSON array
  created_at: string;
}

export interface Template {
  id: number;
  name: string;
  description: string | null;
  content: string;
  variables: string;
  created_at: string;
  updated_at: string;
}

export interface AutoReplyRule {
  id: number;
  name: string;
  trigger_type: 'keyword' | 'mention' | 'pattern';
  trigger_value: string;
  response_template: string;
  applies_to: 'p0' | 'p1' | 'all';
  is_active: number;
  created_at: string;
}

export interface ChannelSummary {
  id: number;
  slack_channel_id: string;
  summary_text: string;
  key_topics: string; // JSON array
  top_contributors: string; // JSON array
  task_count: number;
  link_count: number;
  period_start: string;
  period_end: string;
  created_at: string;
}

// ─── Channel Queries ─────────────────────────────────────────────────────────

export const channelQueries = {
  getAll() {
    return getDb().prepare('SELECT * FROM channels ORDER BY priority, slack_channel_name').all() as Channel[];
  },
  getActive() {
    return getDb().prepare('SELECT * FROM channels WHERE is_active = 1 ORDER BY priority').all() as Channel[];
  },
  getById(id: number) {
    return getDb().prepare('SELECT * FROM channels WHERE id = ?').get(id) as Channel | undefined;
  },
  getBySlackId(slackId: string) {
    return getDb().prepare('SELECT * FROM channels WHERE slack_channel_id = ?').get(slackId) as Channel | undefined;
  },
  create(data: Omit<Channel, 'id' | 'created_at' | 'updated_at'>) {
    const stmt = getDb().prepare(`
      INSERT INTO channels (slack_channel_id, slack_channel_name, priority, channel_type, is_active, digest_enabled, digest_schedule, history_hours, poll_interval)
      VALUES (@slack_channel_id, @slack_channel_name, @priority, @channel_type, @is_active, @digest_enabled, @digest_schedule, @history_hours, @poll_interval)
    `);
    const result = stmt.run({ ...data, poll_interval: data.poll_interval ?? null });
    return channelQueries.getById(result.lastInsertRowid as number)!;
  },
  update(id: number, data: Partial<Omit<Channel, 'id' | 'created_at'>>) {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
    getDb().prepare(`UPDATE channels SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id });
    return channelQueries.getById(id)!;
  },
  delete(id: number) {
    getDb().prepare('DELETE FROM channels WHERE id = ?').run(id);
  },
  updateLastPolled(slackChannelId: string) {
    getDb().prepare(`UPDATE channels SET last_polled_at = datetime('now') WHERE slack_channel_id = ?`).run(slackChannelId);
  },
};

// ─── Task Queries ─────────────────────────────────────────────────────────────

export const taskQueries = {
  getAll(filters?: { status?: string; slack_channel_id?: string; priority?: string; source_type?: string; assignee?: string; sort?: string }) {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params: Record<string, string> = {};
    if (filters?.status)           { sql += ' AND status = @status';                     params.status = filters.status; }
    if (filters?.slack_channel_id) { sql += ' AND slack_channel_id = @slack_channel_id'; params.slack_channel_id = filters.slack_channel_id; }
    if (filters?.priority)         { sql += ' AND priority = @priority';                 params.priority = filters.priority; }
    if (filters?.source_type)      { sql += ' AND source_type = @source_type';           params.source_type = filters.source_type; }
    if (filters?.assignee)         { sql += ' AND assignee = @assignee';                 params.assignee = filters.assignee; }

    const sortMap: Record<string, string> = {
      'due_date:asc':    'ORDER BY due_date ASC NULLS LAST',
      'due_date:desc':   'ORDER BY due_date DESC NULLS LAST',
      'priority:desc':   "ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 END",
      'created_at:desc': 'ORDER BY created_at DESC',
      'created_at:asc':  'ORDER BY created_at ASC',
    };
    sql += ' ' + (sortMap[filters?.sort ?? ''] ?? 'ORDER BY created_at DESC');

    return getDb().prepare(sql).all(params) as Task[];
  },
  getById(id: number) {
    return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
  },
  create(data: Omit<Task, 'id' | 'created_at' | 'updated_at'>) {
    const stmt = getDb().prepare(`
      INSERT INTO tasks (title, description, slack_channel_id, assignee, due_date, status, priority, task_category, source_type, source_message, source_ts, template_id, blocker)
      VALUES (@title, @description, @slack_channel_id, @assignee, @due_date, @status, @priority, @task_category, @source_type, @source_message, @source_ts, @template_id, @blocker)
    `);
    const result = stmt.run({ ...data, blocker: data.blocker ?? null });
    return taskQueries.getById(result.lastInsertRowid as number)!;
  },
  update(id: number, data: Partial<Omit<Task, 'id' | 'created_at'>>) {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
    getDb().prepare(`UPDATE tasks SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id });
    return taskQueries.getById(id)!;
  },
  bulkUpdateStatus(ids: number[], status: string) {
    const stmt = getDb().prepare(`UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?`);
    const run = getDb().transaction((idList: number[]) => { for (const id of idList) stmt.run(status, id); });
    run(ids);
  },
  bulkDelete(ids: number[]) {
    const stmt = getDb().prepare('DELETE FROM tasks WHERE id = ?');
    const run = getDb().transaction((idList: number[]) => { for (const id of idList) stmt.run(id); });
    run(ids);
  },
  delete(id: number) {
    getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
  },
  findOpenByChannel(slackChannelId: string) {
    return getDb().prepare(
      `SELECT * FROM tasks WHERE slack_channel_id = ? AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 100`
    ).all(slackChannelId) as Task[];
  },
  getStats() {
    return getDb().prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN priority = 'high' AND status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) as high_priority
      FROM tasks
    `).get() as { total: number; open: number; in_progress: number; completed: number; high_priority: number };
  },
};

// ─── Link Queries ─────────────────────────────────────────────────────────────

export const linkQueries = {
  getById(id: number) {
    return getDb().prepare('SELECT * FROM links WHERE id = ?').get(id) as Link | undefined;
  },
  getAll(filters?: { slack_channel_id?: string; is_read?: number; category?: string }) {
    let sql = 'SELECT * FROM links WHERE 1=1';
    const params: Record<string, string | number> = {};
    if (filters?.slack_channel_id) { sql += ' AND slack_channel_id = @slack_channel_id'; params.slack_channel_id = filters.slack_channel_id; }
    if (filters?.is_read !== undefined) { sql += ' AND is_read = @is_read'; params.is_read = filters.is_read; }
    if (filters?.category)         { sql += ' AND category = @category';                 params.category = filters.category; }
    sql += ' ORDER BY created_at DESC LIMIT 500';
    return getDb().prepare(sql).all(params) as Link[];
  },
  getUnreadCount() {
    return (getDb().prepare('SELECT COUNT(*) as n FROM links WHERE is_read = 0').get() as { n: number }).n;
  },
  create(data: Omit<Link, 'id' | 'created_at'>) {
    const stmt = getDb().prepare(`
      INSERT INTO links (url, title, description, slack_channel_id, source_ts, source_message, is_read, notes, category, is_saved, summary, key_concepts)
      VALUES (@url, @title, @description, @slack_channel_id, @source_ts, @source_message, @is_read, @notes, @category, @is_saved, @summary, @key_concepts)
    `);
    const result = stmt.run({ ...data, is_saved: data.is_saved ?? 0, summary: data.summary ?? null, key_concepts: data.key_concepts ?? '[]' });
    return getDb().prepare('SELECT * FROM links WHERE id = ?').get(result.lastInsertRowid) as Link;
  },
  update(id: number, data: Partial<Pick<Link, 'is_read' | 'notes' | 'category' | 'title' | 'description' | 'is_saved' | 'summary' | 'key_concepts'>>) {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
    getDb().prepare(`UPDATE links SET ${fields} WHERE id = @id`).run({ ...data, id });
    return getDb().prepare('SELECT * FROM links WHERE id = ?').get(id) as Link;
  },
  delete(id: number) {
    getDb().prepare('DELETE FROM links WHERE id = ?').run(id);
  },
  getSaved() {
    return getDb().prepare(`SELECT * FROM links WHERE is_saved = 1 ORDER BY created_at DESC`).all() as Link[];
  },
};

// ─── Template Queries ─────────────────────────────────────────────────────────

export const templateQueries = {
  getAll() {
    return getDb().prepare('SELECT * FROM templates ORDER BY name').all() as Template[];
  },
  getById(id: number) {
    return getDb().prepare('SELECT * FROM templates WHERE id = ?').get(id) as Template | undefined;
  },
  create(data: Omit<Template, 'id' | 'created_at' | 'updated_at'>) {
    const stmt = getDb().prepare(`
      INSERT INTO templates (name, description, content, variables)
      VALUES (@name, @description, @content, @variables)
    `);
    const result = stmt.run(data);
    return templateQueries.getById(result.lastInsertRowid as number)!;
  },
  update(id: number, data: Partial<Omit<Template, 'id' | 'created_at'>>) {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
    getDb().prepare(`UPDATE templates SET ${fields}, updated_at = datetime('now') WHERE id = @id`).run({ ...data, id });
    return templateQueries.getById(id)!;
  },
  delete(id: number) {
    getDb().prepare('DELETE FROM templates WHERE id = ?').run(id);
  },
};

// ─── Auto-Reply Rule Queries ──────────────────────────────────────────────────

export const ruleQueries = {
  getAll() {
    return getDb().prepare('SELECT * FROM auto_reply_rules ORDER BY name').all() as AutoReplyRule[];
  },
  getActive() {
    return getDb().prepare('SELECT * FROM auto_reply_rules WHERE is_active = 1').all() as AutoReplyRule[];
  },
  getById(id: number) {
    return getDb().prepare('SELECT * FROM auto_reply_rules WHERE id = ?').get(id) as AutoReplyRule | undefined;
  },
  create(data: Omit<AutoReplyRule, 'id' | 'created_at'>) {
    const stmt = getDb().prepare(`
      INSERT INTO auto_reply_rules (name, trigger_type, trigger_value, response_template, applies_to, is_active)
      VALUES (@name, @trigger_type, @trigger_value, @response_template, @applies_to, @is_active)
    `);
    const result = stmt.run(data);
    return ruleQueries.getById(result.lastInsertRowid as number)!;
  },
  update(id: number, data: Partial<Omit<AutoReplyRule, 'id' | 'created_at'>>) {
    const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
    getDb().prepare(`UPDATE auto_reply_rules SET ${fields} WHERE id = @id`).run({ ...data, id });
    return ruleQueries.getById(id)!;
  },
  delete(id: number) {
    getDb().prepare('DELETE FROM auto_reply_rules WHERE id = ?').run(id);
  },
};

// ─── Processed Messages ───────────────────────────────────────────────────────

export const processedQueries = {
  isProcessed(channelId: string, ts: string) {
    return !!getDb().prepare('SELECT 1 FROM processed_messages WHERE slack_channel_id = ? AND slack_ts = ?').get(channelId, ts);
  },
  markProcessed(channelId: string, ts: string) {
    try {
      getDb().prepare('INSERT OR IGNORE INTO processed_messages (slack_channel_id, slack_ts) VALUES (?, ?)').run(channelId, ts);
    } catch { /* ignore duplicate */ }
  },
};

// ─── Digest History ───────────────────────────────────────────────────────────

export const digestQueries = {
  save(slackChannelId: string, content: string, slackTs?: string) {
    getDb().prepare('INSERT INTO digest_history (slack_channel_id, content, slack_ts) VALUES (?, ?, ?)').run(slackChannelId, content, slackTs ?? null);
  },
  getRecent(slackChannelId: string, limit = 10) {
    return getDb().prepare('SELECT * FROM digest_history WHERE slack_channel_id = ? ORDER BY sent_at DESC LIMIT ?').all(slackChannelId, limit);
  },
};

// ─── Task Update Queries ──────────────────────────────────────────────────────

export const taskUpdateQueries = {
  getByTaskId(taskId: number) {
    return getDb().prepare('SELECT * FROM task_updates WHERE task_id = ? ORDER BY created_at ASC').all(taskId) as TaskUpdate[];
  },
  create(data: Omit<TaskUpdate, 'id' | 'created_at'>) {
    const stmt = getDb().prepare(`
      INSERT INTO task_updates (task_id, author, content, update_type)
      VALUES (@task_id, @author, @content, @update_type)
    `);
    const result = stmt.run(data);
    return getDb().prepare('SELECT * FROM task_updates WHERE id = ?').get(result.lastInsertRowid) as TaskUpdate;
  },
  delete(id: number) {
    getDb().prepare('DELETE FROM task_updates WHERE id = ?').run(id);
  },
};

// ─── Mention interface ───────────────────────────────────────────────────────

export interface Mention {
  id: number;
  slack_channel_id: string;
  channel_name: string;
  sender_id: string | null;
  message_text: string;
  ts: string;
  thread_ts: string | null;
  summary: string | null;
  relevance: 'high' | 'medium';
  is_read?: number;
  linked_task_id?: number | null;
  created_at: string;
}

// ─── Mention Queries ──────────────────────────────────────────────────────────

export const mentionQueries = {
  create(data: Omit<Mention, 'id' | 'created_at'>) {
    const stmt = getDb().prepare(`
      INSERT INTO mentions (slack_channel_id, channel_name, sender_id, message_text, ts, thread_ts, summary, relevance, is_read, linked_task_id)
      VALUES (@slack_channel_id, @channel_name, @sender_id, @message_text, @ts, @thread_ts, @summary, @relevance, @is_read, @linked_task_id)
    `);
    const result = stmt.run({ ...data, is_read: data.is_read ?? 0, linked_task_id: data.linked_task_id ?? null });
    return getDb().prepare('SELECT * FROM mentions WHERE id = ?').get(result.lastInsertRowid) as Mention;
  },
  getAll(filters?: { is_read?: number; slack_channel_id?: string; limit?: number }) {
    let sql = 'SELECT * FROM mentions WHERE 1=1';
    const params: Record<string, string | number> = {};
    if (filters?.slack_channel_id) { sql += ' AND slack_channel_id = @slack_channel_id'; params.slack_channel_id = filters.slack_channel_id; }
    if (filters?.is_read !== undefined) { sql += ' AND is_read = @is_read'; params.is_read = filters.is_read; }
    sql += ' ORDER BY CASE relevance WHEN \'high\' THEN 0 ELSE 1 END, created_at DESC';
    sql += ` LIMIT ${filters?.limit ?? 200}`;
    return getDb().prepare(sql).all(params) as Mention[];
  },
  getUnreadCount() {
    return (getDb().prepare('SELECT COUNT(*) as n FROM mentions WHERE is_read = 0').get() as { n: number }).n;
  },
  markRead(id: number) {
    getDb().prepare('UPDATE mentions SET is_read = 1 WHERE id = ?').run(id);
  },
  markAllRead() {
    getDb().prepare('UPDATE mentions SET is_read = 1').run();
  },
  delete(id: number) {
    getDb().prepare('DELETE FROM mentions WHERE id = ?').run(id);
  },
};

// ─── Channel Summary Queries ──────────────────────────────────────────────────

export const summaryQueries = {
  upsert(data: Omit<ChannelSummary, 'id' | 'created_at'>) {
    getDb().prepare(`
      INSERT INTO channel_summaries (slack_channel_id, summary_text, key_topics, top_contributors, task_count, link_count, period_start, period_end)
      VALUES (@slack_channel_id, @summary_text, @key_topics, @top_contributors, @task_count, @link_count, @period_start, @period_end)
    `).run(data);
  },
  getLatest(slackChannelId: string) {
    return getDb().prepare('SELECT * FROM channel_summaries WHERE slack_channel_id = ? ORDER BY created_at DESC LIMIT 1').get(slackChannelId) as ChannelSummary | undefined;
  },
  getAll() {
    return getDb().prepare(`
      SELECT cs.* FROM channel_summaries cs
      INNER JOIN (
        SELECT slack_channel_id, MAX(created_at) as max_created
        FROM channel_summaries GROUP BY slack_channel_id
      ) latest ON cs.slack_channel_id = latest.slack_channel_id AND cs.created_at = latest.max_created
    `).all() as ChannelSummary[];
  },
};
