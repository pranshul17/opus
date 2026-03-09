import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import { createSlackApp, registerHandlers, startSlackApp, postToChannel, listSlackChannels } from './slack/bot';
import { startScheduler, setSlackPostFn } from './services/scheduler';
import { setDigestSlackPostFn } from './routes/digest';
import { setListChannelsFn } from './routes/slack-channels';
import channelsRouter from './routes/channels';
import tasksRouter from './routes/tasks';
import templatesRouter from './routes/templates';
import rulesRouter from './routes/rules';
import digestRouter, { setDigestSlackPostFn as setDigestFn } from './routes/digest';
import slackChannelsRouter from './routes/slack-channels';
import settingsRouter from './routes/settings';
import mentionsRouter from './routes/mentions';

const PORT = parseInt(process.env.PORT || '3001');

async function main() {
  // ── Express setup ────────────────────────────────────────────────────────────
  const app = express();
  app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
  app.use(express.json());

  // Health check (both /health and /api/health for proxy compatibility)
  const healthHandler = (_req: any, res: any) => res.json({ status: 'ok', timestamp: new Date().toISOString() });
  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // API routes
  app.use('/api/channels', channelsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/rules', rulesRouter);
  app.use('/api/digest', digestRouter);
  app.use('/api/slack-channels', slackChannelsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/mentions', mentionsRouter);

  // Serve React frontend in production (Docker build)
  // In dev, Vite runs separately on port 5173 and proxies /api to here.
  const clientDist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
    console.log('[Server] Serving frontend as static files (production mode)');
  }

  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });

  // ── Slack setup ──────────────────────────────────────────────────────────────
  const missingEnv = ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'ANTHROPIC_API_KEY'].filter(k => !process.env[k]);
  if (missingEnv.length > 0) {
    console.warn(`[Setup] Missing env vars: ${missingEnv.join(', ')}`);
    console.warn('[Setup] Slack bot and AI parsing disabled. Set these in .env to enable.');
    console.warn('[Setup] Dashboard is still available at http://localhost:5173');
    return;
  }

  try {
    const slackApp = createSlackApp();
    registerHandlers(slackApp);
    await startSlackApp(slackApp);

    // Wire up the Slack post function to digest routes
    const postFn = async (channelId: string, text: string) => {
      return postToChannel(slackApp, channelId, text);
    };
    setSlackPostFn(postFn);
    setDigestFn(postFn);

    // Wire up channel listing
    setListChannelsFn(() => listSlackChannels(slackApp));

    // Start schedulers (polling + digests)
    startScheduler();

    console.log('[Setup] Slack bot and scheduler active');
  } catch (err) {
    console.error('[Setup] Failed to start Slack bot:', err);
    console.warn('[Setup] Dashboard still available — fix Slack credentials to enable bot features');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
