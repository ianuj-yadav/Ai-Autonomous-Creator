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
