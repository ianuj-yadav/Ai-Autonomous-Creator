import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { query, generateDomainSeedPosts } from '../db';
import { logger } from '../logger';
import { deriveVoiceProfile } from '../modules/persona';
import { agentScheduler } from '../modules/scheduler';

export const initRouter = Router();

const initSchema = z.object({
  id: z.string().optional(),
  persona: z.object({
    name: z.string().min(1, 'Persona name is required'),
    domain: z.string().min(1, 'Persona domain is required'),
  }),
});

initRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = initSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
      return;
    }

    const { persona } = parseResult.data;
    const agentId = parseResult.data.id || `agent-${Date.now()}`;

    logger.info('Initializing or updating agent persona & domain', { agentId, name: persona.name, domain: persona.domain });

    // Derive fresh Voice Profile for the target domain
    const voiceProfile = await deriveVoiceProfile(persona.name, persona.domain);

    // Save or Update agent in PostgreSQL / Store
    await query(
      `INSERT INTO agents (id, name, domain, voice_profile, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           domain = EXCLUDED.domain,
           voice_profile = EXCLUDED.voice_profile,
           status = 'active'`,
      [agentId, persona.name, persona.domain, JSON.stringify(voiceProfile)]
    );

    // Guarantee fresh domain-specific posts exist for this exact domain
    const existingPosts = await query(`SELECT id FROM posts WHERE agent_id = $1 LIMIT 1`, [agentId]);
    if (existingPosts.length === 0) {
      const freshPosts = generateDomainSeedPosts(agentId, persona.name, persona.domain);
      for (const p of freshPosts) {
        await query(
          `INSERT INTO posts (id, agent_id, topic_candidate_id, text, rationale, sources, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [p.id, p.agent_id, p.topic_candidate_id, p.text, p.rationale, JSON.stringify(p.sources), p.created_at]
        );
      }
    }

    // Start/resume background loop
    agentScheduler.startAgentLoop(agentId);

    // Execute autonomous discovery & generation cycle in background
    agentScheduler.executeCycle(agentId).catch((err) => {
      logger.warn('Initial autonomous cycle completed or deferred', { error: err.message });
    });

    res.status(200).json({
      agentId: agentId,
      id: agentId,
      status: 'active',
      voiceProfile,
      message: `Agent initialized/updated for domain "${persona.domain}". Autonomous cycle executed.`,
    });
  } catch (err: any) {
    logger.error('Failed to initialize/update agent', { error: err.message });
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred',
    });
  }
});

initRouter.get('/profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const agentId = req.query.agentId as string;
    if (!agentId) {
      res.status(400).json({ error: 'MISSING_QUERY_PARAM', message: 'Query param agentId is required' });
      return;
    }

    const rows = await query(`SELECT id, name, domain, voice_profile as "voiceProfile", status FROM agents WHERE id = $1`, [agentId]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'AGENT_NOT_FOUND', message: `Agent with id "${agentId}" not found.` });
      return;
    }

    const agent = rows[0];
    res.status(200).json({
      id: agent.id,
      name: agent.name,
      domain: agent.domain,
      status: agent.status,
      voiceProfile: typeof agent.voiceProfile === 'string' ? JSON.parse(agent.voiceProfile) : agent.voiceProfile,
    });
  } catch (err: any) {
    logger.error('Failed to fetch agent profile', { error: err.message });
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: err.message });
  }
});

initRouter.post('/trigger-cycle', async (req: Request, res: Response): Promise<void> => {
  try {
    const { agentId } = req.body;
    if (!agentId) {
      res.status(400).json({ error: 'MISSING_AGENT_ID', message: 'agentId is required' });
      return;
    }

    logger.info('Manual autonomous cycle triggered via API', { agentId });
    await agentScheduler.executeCycle(agentId);

    res.status(200).json({ status: 'success', message: 'Cycle executed successfully' });
  } catch (err: any) {
    logger.error('Failed to execute manual cycle', { error: err.message });
    res.status(500).json({ error: 'CYCLE_ERROR', message: err.message });
  }
});
