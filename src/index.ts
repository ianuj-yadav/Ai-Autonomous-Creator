import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { logger } from './logger';
import { runMigrations } from './db/migrate';
import { agentScheduler } from './modules/scheduler';
import { initRouter } from './api/init';
import { feedRouter } from './api/feed';

const app = express();

app.use(cors());
app.use(express.json());

const publicPath = path.resolve(process.cwd(), 'public');
app.use(express.static(publicPath));

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

// Explicit Root Route handler to serve index.html
app.get('/', (req, res) => {
  const indexFile = path.join(publicPath, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.sendFile(path.resolve(__dirname, '../public/index.html'));
  }
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
