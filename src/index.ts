import express from 'express';
import cors from 'cors';
import { config } from './config';
import { logger } from './logger';
import { runMigrations } from './db/migrate';
import { agentScheduler } from './modules/scheduler';
import { initRouter } from './api/init';
import { feedRouter } from './api/feed';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes & Compliance Endpoint Aliases
app.use('/api/agent/init', initRouter);
app.use('/api/init', initRouter);
app.use('/init', initRouter);

app.use('/api/agent/feed', feedRouter);
app.use('/api/feed', feedRouter);
app.use('/feed', feedRouter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

let isInitialized = false;

async function bootstrap() {
  if (isInitialized) return;
  isInitialized = true;
  try {
    // 1. Run migrations safely
    await runMigrations();

    // 2. Auto-resume active agent background loops
    await agentScheduler.autoResumeActiveAgents();
  } catch (err: any) {
    logger.warn('Bootstrap initialization warning', { error: err.message });
  }
}

// Execute bootstrap initialization
bootstrap();

// Only listen on port if running in standalone server mode (not Vercel Serverless)
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    logger.info(`Autonomous AI Creator Server listening on port ${config.port}`);
  });
}

export default app;
