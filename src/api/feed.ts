import { Request, Response, Router } from 'express';
import { query } from '../db';
import { logger } from '../logger';

export const feedRouter = Router();

feedRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    let agentId = req.query.agentId as string;
    
    // If agentId is not specified, default to the most recently created or active agent
    if (!agentId) {
      const defaultAgentRows = await query(`SELECT id FROM agents ORDER BY created_at DESC LIMIT 1`);
      if (defaultAgentRows.length > 0) {
        agentId = defaultAgentRows[0].id;
      } else {
        agentId = 'kess-security-bot';
      }
    }

    const agentRows = await query(`SELECT id FROM agents WHERE id = $1`, [agentId]);
    if (agentRows.length === 0) {
      res.status(200).json({ posts: [] });
      return;
    }

    const rows = await query(
      `SELECT id, text, rationale, sources, created_at as "createdAt"
       FROM posts
       WHERE agent_id = $1
       ORDER BY created_at DESC`,
      [agentId]
    );

    const formattedPosts = rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.createdAt).toISOString(),
      text: row.text,
      rationale: row.rationale,
      sources: typeof row.sources === 'string' ? JSON.parse(row.sources) : row.sources,
    }));

    res.status(200).json({ posts: formattedPosts });
  } catch (err: any) {
    logger.error('Failed to fetch agent feed', { error: err.message });
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Failed to fetch feed',
    });
  }
});
