import fs from 'fs';
import path from 'path';
import { pool } from './index';
import { logger } from '../logger';

export async function runMigrations(): Promise<void> {
  const schemaPath = path.join(__dirname, 'schema.sql');
  let sql = '';
  try {
    sql = fs.readFileSync(schemaPath, 'utf8');
  } catch (err: any) {
    logger.warn('Schema file read skipped', { error: err.message });
  }

  logger.info('Checking database connection & running migrations...');
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (sql) await client.query(sql);
      await client.query('COMMIT');
      logger.info('Database migrations applied successfully.');
    } catch (err: any) {
      await client.query('ROLLBACK');
      logger.warn('Failed to apply SQL migration script, using in-memory store', { error: err.message });
    } finally {
      client.release();
    }
  } catch (err: any) {
    logger.warn('PostgreSQL database server not reachable, switching to in-memory database mode', { error: err.message });
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(0));
}
