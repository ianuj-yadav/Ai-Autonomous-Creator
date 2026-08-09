/**
 * Application entry point.
 * Starts Express, wires all routes, then resumes any active agent
 * loops so the system survives process restarts (NFR-4).
 */
import 'dotenv/config';
import express from 'express';
import { config } from './config';
import { logger } from './logger';
import { pool } from './db';
import { initRouter } from './api/routes/init';
import { feedRouter } from './api/routes/feed';
import { errorHandler } from './api/middleware/errorHandler';
import { resumeActiveAgents } from './modules/scheduler';

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use((req, _res, next) => {
  logger.debug({ method: req.method, url: req.url }, 'Incoming request');
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/agent/init', initRouter);
app.use('/api/agent/feed', feedRouter);

// Health check — useful for confirming the scheduler is alive during the 48h window
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Error handler (must be last) ─────────────────────────────────────────────
app.use(errorHandler);

// ── Start ────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  // Verify DB connection
  try {
    await pool.query('SELECT 1');
    logger.info('Database connection verified');
  } catch (err) {
    logger.fatal({ err }, 'Cannot connect to database — exiting');
    process.exit(1);
  }

  // Resume any loops that were running before a restart (NFR-4)
  await resumeActiveAgents();

  app.listen(config.port, () => {
    logger.info({ port: config.port }, '🚀 Autonomous AI Creator listening');
  });
}

start().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
