import { Request, Response, Router } from 'express';
import { query } from '../db';
import { logger } from '../logger';
import { deriveVoiceProfile } from '../modules/persona';
import { agentScheduler } from '../modules/scheduler';

export const feedRouter = Router();

feedRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    let agentId = req.query.agentId as string;
    
    // If agentId is not specified, default to the active agent or kess-security-bot
    if (!agentId) {
      const defaultAgentRows = await query(`SELECT id FROM agents ORDER BY created_at DESC LIMIT 1`);
      if (defaultAgentRows.length > 0) {
        agentId = defaultAgentRows[0].id;
      } else {
        agentId = 'kess-security-bot';
      }
    }

    let agentRows = await query(`SELECT id FROM agents WHERE id = $1`, [agentId]);
    if (agentRows.length === 0) {
      const voiceProfile = await deriveVoiceProfile('Kess', 'AI Security');
      await query(
        `INSERT INTO agents (id, name, domain, voice_profile, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (id) DO UPDATE SET status = 'active'`,
        [agentId, 'Kess', 'AI Security', JSON.stringify(voiceProfile)]
      );
      agentRows = await query(`SELECT id FROM agents WHERE id = $1`, [agentId]);
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

    // Trigger an asynchronous real-time AI discovery cycle in background
    agentScheduler.executeCycle(agentId).catch((err) => {
      logger.warn('Background autonomous cycle completed or deferred', { error: err.message });
    });

    res.status(200).json({ posts: formattedPosts });
  } catch (err: any) {
    logger.error('Failed to fetch agent feed', { error: err.message });
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Failed to fetch feed',
    });
  }
});
