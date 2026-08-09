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

async function main() {
  try {
    // 1. Apply database migrations
    await runMigrations();

    // 2. Auto-resume active agent background loops
    await agentScheduler.autoResumeActiveAgents();

    // 3. Start HTTP server
    app.listen(config.port, () => {
      logger.info(`Autonomous AI Creator Server listening on port ${config.port}`);
    });
  } catch (err: any) {
    logger.error('Failed to start Autonomous AI Creator Server', { error: err.message });
    process.exit(1);
  }
}

main();
