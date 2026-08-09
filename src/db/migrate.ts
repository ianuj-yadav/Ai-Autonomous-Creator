/**
 * One-shot migration runner.
 * Usage: tsx src/db/migrate.ts
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './index';
import { logger } from '../logger';

async function migrate(): Promise<void> {
  const sql = readFileSync(
    join(__dirname, 'migrations', '001_initial.sql'),
    'utf8'
  );
  await pool.query(sql);
  logger.info('Database migrations applied successfully');
  await pool.end();
}

migrate().catch((err) => {
  logger.error({ err }, 'Migration failed');
  process.exit(1);
});
