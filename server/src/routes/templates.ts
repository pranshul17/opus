import { Router } from 'express';
import { templateQueries, taskQueries } from '../db/database';
import { renderTemplate } from '../services/claude';

const router = Router();

// GET /api/templates — list all templates
router.get('/', (_req, res) => {
  try {
    res.json(templateQueries.getAll());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/templates/:id — get a template
router.get('/:id', (req, res) => {
  const template = templateQueries.getById(parseInt(req.params.id));
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json(template);
});

// POST /api/templates — create a template
router.post('/', (req, res) => {
  const { name, description, content, variables } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'name and content are required' });

  try {
    // Extract variable placeholders from content: {{variable_name}}
    const extractedVars: string[] = [];
    const matches = content.matchAll(/\{\{(\w+)\}\}/g);
    for (const match of matches) {
      if (!extractedVars.includes(match[1])) extractedVars.push(match[1]);
    }

    const template = templateQueries.create({
      name,
      description: description ?? null,
      content,
      variables: JSON.stringify(variables ?? extractedVars),
    });
    res.status(201).json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/templates/:id — update a template
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description, content, variables } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (variables !== undefined) updates.variables = JSON.stringify(variables);
  if (content !== undefined) {
    updates.content = content;
    // Re-extract variables
    const extractedVars: string[] = [];
    const matches = content.matchAll(/\{\{(\w+)\}\}/g);
    for (const match of matches) {
      if (!extractedVars.includes(match[1])) extractedVars.push(match[1]);
    }
    if (variables === undefined) updates.variables = JSON.stringify(extractedVars);
  }

  try {
    res.json(templateQueries.update(id, updates));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/templates/:id — delete a template
router.delete('/:id', (req, res) => {
  try {
    templateQueries.delete(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/templates/:id/push — create a task from a template
router.post('/:id/push', async (req, res) => {
  const template = templateQueries.getById(parseInt(req.params.id));
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const { variables = {}, slack_channel_id, assignee, due_date } = req.body;

  try {
    const renderedContent = await renderTemplate(template.content, variables);

    // First line becomes the title, rest is description
    const lines = renderedContent.trim().split('\n');
    const title = lines[0].replace(/^#+\s*/, '').trim();
    const description = lines.slice(1).join('\n').trim();

    const task = taskQueries.create({
      title,
      description: description || null,
      slack_channel_id: slack_channel_id ?? null,
      assignee: assignee ?? null,
      due_date: due_date ?? null,
      status: 'open',
      priority: 'medium',
      task_category: 'action_item',
      source_type: 'template',
      source_message: null,
      source_ts: null,
      template_id: template.id,
    });

    res.status(201).json({ task, renderedContent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
