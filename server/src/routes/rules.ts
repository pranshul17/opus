import { Router } from 'express';
import { ruleQueries } from '../db/database';

const router = Router();

router.get('/', (_req, res) => {
  try {
    res.json(ruleQueries.getAll());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  const { name, trigger_type, trigger_value, response_template, applies_to, is_active } = req.body;
  if (!name || !trigger_type || !trigger_value || !response_template) {
    return res.status(400).json({ error: 'name, trigger_type, trigger_value, response_template are required' });
  }

  try {
    const rule = ruleQueries.create({
      name,
      trigger_type,
      trigger_value,
      response_template,
      applies_to: applies_to || 'all',
      is_active: is_active !== false ? 1 : 0,
    });
    res.status(201).json(rule);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const allowed = ['name', 'trigger_type', 'trigger_value', 'response_template', 'applies_to', 'is_active'];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  try {
    res.json(ruleQueries.update(id, updates));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    ruleQueries.delete(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
