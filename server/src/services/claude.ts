import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ParsedTaskSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  assignee: z.string().optional(),
  due_date: z.string().optional(),
  source_ts: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  task_category: z.enum(['action_item', 'decision', 'question', 'fyi']).default('action_item'),
});

const ParsedLinkSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  source_ts: z.string().optional(),
  category: z.enum(['article', 'tool', 'video', 'doc', 'other']).default('other'),
});

const ParsedChannelSchema = z.object({
  tasks: z.array(ParsedTaskSchema),
  links: z.array(ParsedLinkSchema),
  summary: z.string(),
});

export type ParsedChannelContent = z.infer<typeof ParsedChannelSchema>;

export interface SlackMessage {
  ts: string;
  user?: string;
  text: string;
  username?: string;
}

// ─── Parse channel messages ───────────────────────────────────────────────────

export async function parseChannelMessages(
  channelName: string,
  priority: string,
  messages: SlackMessage[],
  channelType: 'work' | 'learning' | 'mixed' = 'work',
  ownerSlackId?: string
): Promise<ParsedChannelContent> {
  if (messages.length === 0) {
    return { tasks: [], links: [], summary: 'No new messages.' };
  }

  const messageText = messages
    .map(m => `[${new Date(parseFloat(m.ts) * 1000).toISOString()}] ${m.username || m.user || 'Unknown'}: ${m.text}`)
    .join('\n');

  // ── System prompt ──────────────────────────────────────────────────────────
  const systemPrompt = `You are an intelligent Slack channel analyzer for a team task management system.
Extract structured, actionable information from team messages.
Always respond with valid JSON matching the requested schema exactly.
For due dates, use YYYY-MM-DD format if you can infer them from context, otherwise omit.
Set source_ts to the message timestamp (ISO string) that originated the task or link.`;

  // ── User prompt: varies by channel priority and type ──────────────────────
  let extractionInstructions: string;

  if (channelType === 'learning') {
    extractionInstructions = `This is a LEARNING channel — focus on capturing resources, not action items.
- tasks: Leave EMPTY unless there is an explicit "someone must do X" action item.
- links: Capture ALL URLs shared. Classify each as: article, tool, video, doc, or other.
- summary: Brief summary of topics and resources shared.`;
  } else if (priority === 'p0') {
    extractionInstructions = `This is a P0 (CRITICAL) channel — be aggressive in extracting tasks.
- tasks: Extract ALL action items, blockers, questions needing answers, decisions made, and FYIs that require follow-up. Err on the side of including more.
  - priority: Mark as "high" if message contains: urgent, ASAP, blocking, critical, NOW, immediately, or !!
  - priority: Mark as "low" if message contains: when you get a chance, low priority, not urgent, sometime
  - task_category: "action_item" for clear TODOs, "decision" for resolved choices, "question" for open questions, "fyi" for informational items needing awareness
- links: Capture all URLs with context.
- summary: 2-3 sentence summary of critical activity.`;
  } else if (channelType === 'mixed') {
    extractionInstructions = `This is a MIXED channel (work + learning content).
- tasks: Extract clear action items with an owner. Use same priority/category rules as work channels.
- links: Capture all URLs. Mark learning resources (articles, tutorials, tools) with appropriate category.
- summary: 2-3 sentence summary covering both work items and learning resources.`;
  } else {
    // p1 work channel — conservative
    extractionInstructions = `This is a P1 (STANDARD) work channel — be selective, only clear action items.
- tasks: Only extract explicit action items that have a clear owner OR a clear deliverable. Ignore casual conversation, FYIs, and vague suggestions.
  - priority: Mark as "high" if message contains: urgent, blocking, ASAP, critical
  - priority: Mark as "low" if message contains: when you get a chance, low priority, not urgent
  - task_category: "action_item" for clear TODOs, "decision" for resolved choices, "question" for open questions
- links: Capture URLs that are shared as useful references.
- summary: 2-3 sentence summary.`;
  }

  // ── Owner task filter ──────────────────────────────────────────────────────
  const ownerFilter = ownerSlackId
    ? `\n⚠️ OWNER FILTER (important): Only extract tasks from messages that contain "<@${ownerSlackId}>". Tasks directed at other people should be completely ignored. Links are NOT affected — extract links from ALL messages.`
    : '';

  const userPrompt = `Analyze these messages from #${channelName} (${priority.toUpperCase()}, type: ${channelType}):

${messageText}

${extractionInstructions}${ownerFilter}

Return ONLY valid JSON with this exact structure:
{
  "tasks": [{"title": "...", "description": "...", "assignee": "...", "due_date": "YYYY-MM-DD", "source_ts": "...", "priority": "high|medium|low", "task_category": "action_item|decision|question|fyi"}],
  "links": [{"url": "...", "title": "...", "description": "...", "source_ts": "...", "category": "article|tool|video|doc|other"}],
  "summary": "..."
}`;

  try {
    const stream = (client.messages as any).stream({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const response = await stream.finalMessage();

    const textBlock = response.content.find((b: any) => b.type === 'text') as any;
    if (!textBlock) return { tasks: [], links: [], summary: 'Failed to parse channel content.' };

    let jsonText = (textBlock.text as string).trim();
    const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonText = jsonMatch[1];

    const raw = JSON.parse(jsonText);
    return ParsedChannelSchema.parse(raw);
  } catch (err) {
    console.error('[Claude] Error parsing channel messages:', err);
    return { tasks: [], links: [], summary: 'Error during AI analysis.' };
  }
}

// ─── Generate channel summary ─────────────────────────────────────────────────

export interface ChannelSummaryResult {
  summary: string;
  key_topics: string[];
  top_contributors: string[];
}

export async function generateChannelSummary(
  channelName: string,
  messages: SlackMessage[],
  taskCount: number,
  linkCount: number
): Promise<ChannelSummaryResult> {
  if (messages.length === 0) {
    return { summary: 'No activity in this period.', key_topics: [], top_contributors: [] };
  }

  const messageText = messages.slice(-100)
    .map(m => `${m.username || m.user || 'Unknown'}: ${m.text}`)
    .join('\n');

  const prompt = `Analyze the following Slack messages from #${channelName} and produce a structured summary.

Messages:
${messageText}

Stats: ${taskCount} tasks extracted, ${linkCount} links captured.

Return ONLY valid JSON with this structure:
{
  "summary": "2-3 sentence summary of what happened, key decisions, and main themes",
  "key_topics": ["topic1", "topic2", "topic3"],
  "top_contributors": ["name1", "name2", "name3"]
}

Keep key_topics to max 5 items (short, 1-3 word phrases).
Keep top_contributors to max 5 names (people who posted the most or most important messages).`;

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const response = await stream.finalMessage();
    const textBlock = response.content.find((b: any) => b.type === 'text') as any;
    if (!textBlock) return { summary: 'Unable to generate summary.', key_topics: [], top_contributors: [] };

    let jsonText = (textBlock.text as string).trim();
    const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonText = jsonMatch[1];

    const raw = JSON.parse(jsonText);
    return {
      summary: raw.summary ?? '',
      key_topics: Array.isArray(raw.key_topics) ? raw.key_topics.slice(0, 5) : [],
      top_contributors: Array.isArray(raw.top_contributors) ? raw.top_contributors.slice(0, 5) : [],
    };
  } catch (err) {
    console.error('[Claude] Error generating channel summary:', err);
    return { summary: 'Error generating summary.', key_topics: [], top_contributors: [] };
  }
}

// ─── Generate channel digest ──────────────────────────────────────────────────

export async function generateDigest(
  channelName: string,
  priority: string,
  messages: SlackMessage[],
  openTasks: { title: string; assignee?: string | null; due_date?: string | null; priority?: string }[]
): Promise<string> {
  if (messages.length === 0 && openTasks.length === 0) {
    return `*${channelName} Digest* — No activity to report.`;
  }

  const messageText = messages.slice(-50)
    .map(m => `${m.username || m.user || 'Unknown'}: ${m.text}`)
    .join('\n');

  const taskText = openTasks.length > 0
    ? openTasks.map(t => `• ${t.title}${t.assignee ? ` (@${t.assignee})` : ''}${t.due_date ? ` — due ${t.due_date}` : ''}${t.priority === 'high' ? ' 🔴' : ''}`).join('\n')
    : 'No open tasks.';

  const prompt = `Generate a concise Slack digest message for #${channelName} (${priority.toUpperCase()}) in Slack markdown format.

Recent channel activity:
${messageText}

Open tasks:
${taskText}

Format the digest as:
*📊 ${channelName} Daily Digest*
*Summary:* [2-3 sentences]
*Open Tasks (${openTasks.length}):*
[list tasks]
*Key Updates:*
[bullet points of important things from today]

Keep it brief and actionable. Use Slack's mrkdwn formatting.`;

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const response = await stream.finalMessage();
    const textBlock = response.content.find((b: any) => b.type === 'text') as any;
    return textBlock ? (textBlock.text as string) : `*${channelName} Digest* — Unable to generate digest.`;
  } catch (err) {
    console.error('[Claude] Error generating digest:', err);
    return `*${channelName} Digest* — Error generating digest.`;
  }
}

// ─── Summarize an article for the knowledge base ─────────────────────────────

export interface ArticleSummaryResult {
  summary: string;
  key_concepts: string[];
}

export async function summarizeArticle(
  url: string,
  title: string | null,
  description: string | null
): Promise<ArticleSummaryResult> {
  const prompt = `You are building a personal knowledge base. Analyze this resource and extract structured knowledge.

URL: ${url}
Title: ${title || 'Unknown'}
Description: ${description || 'No description available'}

Generate:
1. A concise 2-3 sentence summary of what this resource covers, its key insight, and why it's valuable
2. 4-8 key concepts/topics it covers (short phrases, 1-3 words each, lowercase)

Return ONLY valid JSON:
{
  "summary": "...",
  "key_concepts": ["concept1", "concept2", ...]
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((b: any) => b.type === 'text') as any;
    if (!textBlock) return { summary: 'Unable to summarize.', key_concepts: [] };

    let jsonText = (textBlock.text as string).trim();
    const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonText = jsonMatch[1];

    const raw = JSON.parse(jsonText);
    return {
      summary: raw.summary || '',
      key_concepts: Array.isArray(raw.key_concepts) ? raw.key_concepts.slice(0, 8).map((c: string) => c.toLowerCase().trim()) : [],
    };
  } catch (err) {
    console.error('[Claude] Error summarizing article:', err);
    return { summary: 'Error generating summary.', key_concepts: [] };
  }
}

// ─── Classify a Slack @mention: task vs mention vs ignore ────────────────────

export interface MentionClassification {
  classification: 'task' | 'mention' | 'ignore';
  task?: {
    title: string;
    priority: 'high' | 'medium' | 'low';
    due_date: string | null;
    duplicate_task_id: number | null;
  };
  mention?: {
    summary: string;
    relevance: 'high' | 'medium';
  };
}

export async function classifyMention(
  messageText: string,
  senderUserId: string,
  channelName: string,
  existingTasks: { id: number; title: string }[],
  customContext: string,
): Promise<MentionClassification> {
  const taskList =
    existingTasks.length > 0
      ? existingTasks.map(t => `  #${t.id}: ${t.title}`).join('\n')
      : '  (none)';

  const prompt = `You are an intelligent mention classifier for a personal Slack task manager.

${customContext ? `User's personal context:\n${customContext}\n` : ''}
Current open tasks in #${channelName}:
${taskList}

A message in #${channelName} from <@${senderUserId}> has @mentioned the user:
"${messageText}"

Classify this mention into exactly one of three categories:
- "task"    — there is a CLEAR action the user must take (fix something, review something, decide something, attend something, etc.)
- "mention" — informational, FYI, discussion, or something worth tracking but no clear next action required from the user
- "ignore"  — casual or social mention, already fully covered by an existing open task, or completely irrelevant

If "task": write a short actionable task title (max 120 chars). Set priority based on urgency words (urgent/asap/critical/blocking → high; when you get a chance/low priority → low; else medium). If the message is clearly a duplicate of an existing open task, set duplicate_task_id to that task's ID.
If "mention": write a single-sentence summary of what the mention is about. Rate relevance as "high" if time-sensitive or important, else "medium".

Return ONLY valid JSON — no markdown, no extra text:
{
  "classification": "task" | "mention" | "ignore",
  "task": { "title": "...", "priority": "high|medium|low", "due_date": "YYYY-MM-DD or null", "duplicate_task_id": null },
  "mention": { "summary": "...", "relevance": "high|medium" }
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((b: any) => b.type === 'text') as any;
    if (!textBlock) return { classification: 'ignore' };

    let jsonText = (textBlock.text as string).trim();
    const jsonMatch = jsonText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (jsonMatch) jsonText = jsonMatch[1];

    const raw = JSON.parse(jsonText);
    const cls = raw.classification as string;

    if (cls === 'task' && raw.task) {
      return {
        classification: 'task',
        task: {
          title: String(raw.task.title ?? '').slice(0, 200),
          priority: (['high', 'medium', 'low'].includes(raw.task.priority) ? raw.task.priority : 'medium') as 'high' | 'medium' | 'low',
          due_date: raw.task.due_date && /^\d{4}-\d{2}-\d{2}$/.test(raw.task.due_date) ? raw.task.due_date : null,
          duplicate_task_id: raw.task.duplicate_task_id ? Number(raw.task.duplicate_task_id) : null,
        },
      };
    }

    if (cls === 'mention' && raw.mention) {
      return {
        classification: 'mention',
        mention: {
          summary: String(raw.mention.summary ?? '').slice(0, 300),
          relevance: raw.mention.relevance === 'high' ? 'high' : 'medium',
        },
      };
    }

    return { classification: 'ignore' };
  } catch (err) {
    console.error('[Claude] classifyMention error:', err);
    // Fallback: treat as a plain mention rather than dropping it
    return {
      classification: 'mention',
      mention: { summary: messageText.slice(0, 200), relevance: 'medium' },
    };
  }
}

// ─── Render a template with variables ────────────────────────────────────────

export async function renderTemplate(
  templateContent: string,
  variables: Record<string, string>
): Promise<string> {
  let rendered = templateContent;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return rendered;
}
