/**
 * GET /api/agent/feed — FR-9.1 through FR-9.6
 *
 * Read-only. Returns all published posts for an agent in reverse
 * chronological order. ZERO side effects — no discovery or generation
 * is triggered here (FR-8.4).
 */
import { Router, Request, Response, NextFunction } from 'express';
import { query, queryOne } from '../../db';
import { createError } from '../middleware/errorHandler';
import { logger } from '../../logger';

export const feedRouter = Router();

feedRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const { agentId } = req.query;

  // Validate agentId param
  if (!agentId || typeof agentId !== 'string' || agentId.trim() === '') {
    return next(createError('agentId query parameter is required', 400, 'invalid_request'));
  }

  try {
    // Verify agent exists (FR-9.6)
    const agent = await queryOne<{ agent_id: string }>(
      `SELECT agent_id FROM agents WHERE agent_id = $1`,
      [agentId]
    );

    if (!agent) {
      return next(createError('No agent found for the given agentId', 404, 'not_found'));
    }

    // Fetch posts — read-only, no generation side effects
    const rows = await query<{
      id: string;
      created_at: string;
      text: string;
      rationale: string;
      sources: string[];
    }>(
      `SELECT id, created_at, text, rationale, sources
       FROM posts
       WHERE agent_id = $1
       ORDER BY created_at DESC`,
      [agentId]
    );

    // Map to exact API contract field names (FR-9.3)
    const posts = rows.map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at).toISOString().replace(/\.\d{3}Z$/, 'Z'), // ISO 8601 UTC Z
      text: r.text,
      rationale: r.rationale,
      sources: Array.isArray(r.sources) ? r.sources : JSON.parse(r.sources as unknown as string),
    }));

    logger.debug({ agentId, count: posts.length }, 'Feed served');
    return res.status(200).json({ posts });

  } catch (err) {
    return next(err);
  }
});
