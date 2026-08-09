/**
 * POST /api/agent/init — FR-1.1 through FR-1.6
 *
 * Validates the persona, creates an agent (idempotent), derives
 * the voice profile, and fires the autonomous scheduler loop.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { query, queryOne } from '../../db';
import { deriveVoiceProfile } from '../../modules/persona';
import { startAgentLoop } from '../../modules/scheduler';
import { logger } from '../../logger';
import { createError } from '../middleware/errorHandler';
import type { Agent, VoiceProfile } from '../../types';

export const initRouter = Router();

const InitBody = z.object({
  persona: z.object({
    name: z.string().min(1, 'persona.name is required'),
    domain: z.string().min(1, 'persona.domain is required'),
  }),
});

initRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  // 1. Validate input
  const parsed = InitBody.safeParse(req.body);
  if (!parsed.success) {
    return next(
      createError(
        parsed.error.errors.map((e) => e.message).join('; '),
        400,
        'invalid_request'
      )
    );
  }

  const { name, domain } = parsed.data.persona;

  try {
    // 2. Idempotency check — return existing agent if already initialized (FR-1.5)
    const existing = await queryOne<{ agent_id: string }>(
      `SELECT agent_id FROM agents
       WHERE persona_name = $1 AND persona_domain = $2 AND status = 'active'
       LIMIT 1`,
      [name, domain]
    );

    if (existing) {
      logger.info({ agentId: existing.agent_id }, 'Init called for existing agent — returning existing id');
      return res.status(200).json({ agentId: existing.agent_id });
    }

    // 3. Derive voice profile (one LLM call, stored permanently)
    const voiceProfile: VoiceProfile = await deriveVoiceProfile(name, domain);

    // 4. Persist agent
    const agentId = uuid();
    const now = new Date().toISOString();

    await query(
      `INSERT INTO agents (agent_id, persona_name, persona_domain, voice_profile, created_at, status)
       VALUES ($1, $2, $3, $4, $5, 'active')`,
      [agentId, name, domain, JSON.stringify(voiceProfile), now]
    );

    // 5. Start autonomous loop (fire-and-forget background task)
    const agent: Agent = {
      agentId,
      personaName: name,
      personaDomain: domain,
      voiceProfile,
      createdAt: now,
      status: 'active',
    };
    startAgentLoop(agent);

    logger.info({ agentId, name, domain }, 'Agent initialized and loop started');
    return res.status(201).json({ agentId });

  } catch (err) {
    return next(err);
  }
});
