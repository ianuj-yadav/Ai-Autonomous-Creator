/**
 * Scheduler / Orchestrator Module — FR-8.1, FR-8.2, FR-8.3, FR-8.4
 *
 * The heart of the autonomous system. startAgentLoop runs indefinitely
 * after init — no external trigger ever needed again.
 * On process restart, resumeActiveAgents re-attaches all active loops.
 */
import { v4 as uuid } from 'uuid';
import { config } from '../config';
import { logger } from '../logger';
import { query, queryOne } from '../db';
import { discoverCandidates } from './discovery';
import { scoreBatch } from './judgment';
import { getRecentPosts, isNearDuplicate, savePost, saveCandidate, computeTopicKey } from './memory';
import { generatePost } from './generation';
import { buildRationale, buildSources, assertPublishable } from './rationale';
import type { Agent, VoiceProfile } from '../types';

// Track running loops so we never start a duplicate (FR-1.5)
const activeLoops = new Set<string>();

/** Returns a jittered interval in milliseconds */
function jitteredInterval(): number {
  const { minMinutes, maxMinutes, jitterMinutes, testMode } = config.cadence;
  const base = minMinutes + Math.random() * (maxMinutes - minMinutes);
  const jitter = (Math.random() * 2 - 1) * jitterMinutes;
  const minutes = Math.max(minMinutes, base + jitter);
  // In test mode, treat the value as seconds instead of minutes
  return testMode ? minutes * 1_000 : minutes * 60_000;
}

/** Run a single discovery → judge → generate → publish cycle */
async function runCycle(agent: Agent): Promise<void> {
  const { agentId, voiceProfile } = agent;
  const cycleId = uuid().slice(0, 8);
  const log = logger.child({ agentId, cycleId });

  log.info('Cycle start');

  // 1. Discover
  let candidates;
  try {
    candidates = await discoverCandidates(agentId, voiceProfile);
  } catch (err) {
    log.warn({ err }, 'Discovery failed — skipping cycle');
    return;
  }

  if (candidates.length === 0) {
    log.info('No candidates discovered — skipping cycle');
    return;
  }

  // 2. Score
  const recentPosts = await getRecentPosts(agentId);
  const scored = await scoreBatch(candidates, voiceProfile, recentPosts);

  // Persist all candidates for audit (FR-4.3)
  await Promise.allSettled(
    scored.map((s) =>
      saveCandidate({
        id: s.candidate.id,
        agentId,
        title: s.candidate.title,
        summary: s.candidate.summary,
        sourceUrls: s.candidate.sourceUrls,
        discoveredAt: s.candidate.discoveredAt,
        score: s.score,
        decision: s.decision,
        decisionReason: s.reason,
      })
    )
  );

  const accepted = scored.filter((s) => s.decision === 'accepted');

  if (accepted.length === 0) {
    log.info({ evaluated: scored.length }, 'No candidates passed editorial bar — cycle skipped');
    return;
  }

  // Pick the highest-scoring accepted candidate
  const best = accepted[0];

  // 3. Memory dedup (defense in depth)
  if (isNearDuplicate(best.candidate, recentPosts)) {
    log.info({ title: best.candidate.title }, 'Near-duplicate of recent post — skipping');
    return;
  }

  // 4. Generate
  let generated;
  try {
    generated = await generatePost(best, voiceProfile, recentPosts);
  } catch (err) {
    log.warn({ err }, 'Generation failed — skipping cycle');
    return;
  }

  // 5. Rationale + sources
  const rationale = buildRationale(best, scored);
  const sources = buildSources(best.candidate);

  // 6. Pre-publish guard (FR-7.3)
  try {
    assertPublishable(rationale, sources);
  } catch (err) {
    log.error({ err }, 'Publishability check failed — dropping post');
    return;
  }

  // 7. Persist
  const postId = uuid();
  const now = new Date().toISOString();
  const topicKey = computeTopicKey(best.candidate.title, best.candidate.summary);

  await savePost({
    id: postId,
    agentId,
    text: generated.text,
    rationale,
    sources,
    topicKey,
    createdAt: now,
  });

  log.info({ postId, title: best.candidate.title }, 'Post published ✓');
}

/** Start the autonomous loop for an agent */
export function startAgentLoop(agent: Agent): void {
  if (activeLoops.has(agent.agentId)) {
    logger.warn({ agentId: agent.agentId }, 'Loop already running — not starting duplicate');
    return;
  }

  activeLoops.add(agent.agentId);
  logger.info({ agentId: agent.agentId, personaName: agent.personaName }, 'Agent loop started');

  const loop = async (): Promise<void> => {
    while (activeLoops.has(agent.agentId)) {
      const delay = jitteredInterval();
      logger.debug({ agentId: agent.agentId, delayMs: delay }, 'Next cycle in');
      await new Promise((resolve) => setTimeout(resolve, delay));

      if (!activeLoops.has(agent.agentId)) break;

      try {
        await runCycle(agent);
      } catch (err) {
        // NFR-5: any unhandled error in a cycle must NOT kill the loop
        logger.error({ err, agentId: agent.agentId }, 'Unhandled cycle error — continuing loop');
      }
    }
  };

  // Fire and forget — the loop runs entirely in the background
  loop().catch((err) => {
    logger.error({ err, agentId: agent.agentId }, 'Agent loop crashed unexpectedly');
    activeLoops.delete(agent.agentId);
  });
}

/** On process restart: re-attach loops for all active agents (NFR-4) */
export async function resumeActiveAgents(): Promise<void> {
  const rows = await query<{
    agent_id: string;
    persona_name: string;
    persona_domain: string;
    voice_profile: VoiceProfile;
    created_at: string;
    status: 'active' | 'paused';
  }>(
    `SELECT agent_id, persona_name, persona_domain, voice_profile, created_at, status
     FROM agents WHERE status = 'active'`
  );

  if (rows.length === 0) {
    logger.info('No active agents to resume');
    return;
  }

  for (const row of rows) {
    const agent: Agent = {
      agentId: row.agent_id,
      personaName: row.persona_name,
      personaDomain: row.persona_domain,
      voiceProfile: row.voice_profile,
      createdAt: row.created_at,
      status: row.status,
    };
    startAgentLoop(agent);
  }

  logger.info({ count: rows.length }, 'Resumed active agent loops after restart');
}
