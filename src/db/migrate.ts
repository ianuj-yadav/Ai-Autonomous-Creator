import fs from 'fs';
import path from 'path';
import { pool } from './index';
import { logger } from '../logger';

export async function runMigrations(): Promise<void> {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  logger.info('Running database migrations...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    logger.info('Database migrations applied successfully.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to apply migrations', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
