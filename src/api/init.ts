import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
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

    // Idempotency check: check if agent already exists
    const existing = await query(`SELECT id, name, domain, voice_profile as "voiceProfile", status FROM agents WHERE id = $1`, [agentId]);
    if (existing.length > 0) {
      const agent = existing[0];
      logger.info('Agent already exists, auto-resuming background loop', { agentId });
      agentScheduler.startAgentLoop(agentId);

      res.status(200).json({
        id: agent.id,
        status: agent.status,
        voiceProfile: typeof agent.voiceProfile === 'string' ? JSON.parse(agent.voiceProfile) : agent.voiceProfile,
      });
      return;
    }

    // Derive Voice Profile
    const voiceProfile = await deriveVoiceProfile(persona.name, persona.domain);

    // Save agent to database
    await query(
      `INSERT INTO agents (id, name, domain, voice_profile, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [agentId, persona.name, persona.domain, JSON.stringify(voiceProfile), 'active']
    );

    // Start background autonomous loop
    agentScheduler.startAgentLoop(agentId);

    // Execute first cycle immediately so feed populates without waiting for jitter timer
    agentScheduler.executeCycle(agentId).catch((cycleErr) => {
      logger.error('Error during initial immediate cycle execution', { error: cycleErr.message });
    });

    res.status(201).json({
      id: agentId,
      status: 'active',
      voiceProfile,
    });
  } catch (err: any) {
    logger.error('Failed to initialize agent', { error: err.message });
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
