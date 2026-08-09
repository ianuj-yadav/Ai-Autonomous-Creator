import { query } from '../db';
import { logger } from '../logger';
import { config } from '../config';
import { VoiceProfile } from './persona';
import { discoverCandidates } from './discovery';
import { scoreCandidate } from './judgment';
import { getRecentPosts, isNearDuplicate, computeTopicKey, savePostWithMemory } from './memory';
import { generatePost } from './generation';
import { buildRationale, buildSources, validatePostDraft } from './rationale';

export class AgentScheduler {
  private activeLoops: Map<string, boolean> = new Map();
  private lastQueriesMap: Map<string, string[]> = new Map();

  public isRunning(agentId: string): boolean {
    return this.activeLoops.get(agentId) === true;
  }

  public startAgentLoop(agentId: string): void {
    if (this.isRunning(agentId)) {
      logger.info('Agent loop already active', { agentId });
      return;
    }

    this.activeLoops.set(agentId, true);
    logger.info('Started autonomous agent background loop', { agentId });

    // Execute background loop asynchronously
    this.runLoop(agentId).catch((err) => {
      logger.error('Fatal unhandled loop error in agent scheduler', { agentId, error: err.message });
    });
  }

  public stopAgentLoop(agentId: string): void {
    this.activeLoops.set(agentId, false);
    logger.info('Stopped autonomous agent loop', { agentId });
  }

  private async runLoop(agentId: string): Promise<void> {
    while (this.isRunning(agentId)) {
      try {
        logger.info('=== Starting Autonomous Agent Cycle ===', { agentId, timestamp: new Date().toISOString() });
        await this.executeCycle(agentId);
      } catch (cycleErr: any) {
        logger.error('Error during agent autonomous cycle (loop isolated, continuing)', {
          agentId,
          error: cycleErr.message,
          stack: cycleErr.stack,
        });
      }

      // Calculate randomized jittered delay
      const minMinutes = config.cadence.minMinutes;
      const maxMinutes = config.cadence.maxMinutes;
      const baseMs = (minMinutes + Math.random() * (maxMinutes - minMinutes)) * 60 * 1000;
      const jitterMs = (Math.random() - 0.5) * 4000; // +- 2 seconds random jitter
      const delayMs = Math.max(5000, baseMs + jitterMs);

      logger.info(`Next autonomous cycle scheduled in ${(delayMs / 1000).toFixed(1)}s`, { agentId });

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  public async executeCycle(agentId: string): Promise<void> {
    // 1. Load Agent Voice Profile
    const agentRows = await query(`SELECT id, name, domain, voice_profile as "voiceProfile" FROM agents WHERE id = $1`, [agentId]);
    if (agentRows.length === 0) {
      logger.error('Agent not found in database for loop execution', { agentId });
      this.stopAgentLoop(agentId);
      return;
    }

    const agent = agentRows[0];
    const profile: VoiceProfile = typeof agent.voiceProfile === 'string' ? JSON.parse(agent.voiceProfile) : agent.voiceProfile;

    // 2. Retrieve recent posts
    const recentPosts = await getRecentPosts(agentId, 10);
    const recentTopicKeys = recentPosts.map((p) => p.topicKey);

    // 3. Discover candidates
    const usedQueries = this.lastQueriesMap.get(agentId) || [];
    const candidates = await discoverCandidates(profile, usedQueries);
    logger.info(`Discovered ${candidates.length} candidate topics`, { agentId });

    if (candidates.length === 0) {
      logger.warn('No candidates discovered during cycle', { agentId });
      return;
    }

    // 4. Save candidates to database & Score each candidate
    const judgmentResults = [];
    for (const candidate of candidates) {
      // Save candidate to DB
      const candRes = await query(
        `INSERT INTO topic_candidates (agent_id, title, summary, source_urls, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [agentId, candidate.title, candidate.summary, JSON.stringify(candidate.sourceUrls), 'pending']
      );
      candidate.id = candRes[0].id;
      candidate.agentId = agentId;

      // Score candidate
      const result = scoreCandidate(candidate, profile, recentTopicKeys);

      // Update candidate score and status in DB
      await query(
        `UPDATE topic_candidates
         SET scores = $1, status = $2, rejection_reason = $3
         WHERE id = $4`,
        [JSON.stringify(result.scores), result.accepted ? 'accepted' : 'rejected', result.rejectionReason || null, candidate.id]
      );

      judgmentResults.push(result);
    }

    // Filter accepted candidates
    const acceptedResults = judgmentResults.filter((j) => j.accepted);
    logger.info(`Cycle Judgment Summary: ${acceptedResults.length}/${candidates.length} candidates accepted`, { agentId });

    if (acceptedResults.length === 0) {
      logger.info('All candidates rejected by editorial judgment this cycle. Skipping generation.', { agentId });
      return;
    }

    // 5. Check Memory Deduplication on accepted candidates
    let selectedResult = null;
    for (const res of acceptedResults) {
      const memCheck = isNearDuplicate(res.candidate, recentPosts, 0.5);
      if (memCheck.duplicate) {
        const reason = `Rejected by Memory Module: Jaccard similarity ${memCheck.maxSimilarity.toFixed(2)} >= 0.5 threshold with recent post.`;
        logger.info(reason, { title: res.candidate.title });
        await query(`UPDATE topic_candidates SET status = 'rejected', rejection_reason = $1 WHERE id = $2`, [reason, res.candidate.id]);
      } else {
        selectedResult = res;
        break; // Select the best non-duplicate candidate
      }
    }

    if (!selectedResult) {
      logger.info('All accepted candidates were filtered out by memory deduplication.', { agentId });
      return;
    }

    // 6. Generate Content, Rationale, and Sources
    const candidate = selectedResult.candidate;
    const generated = await generatePost(candidate, profile, recentPosts.slice(0, 3));
    const rationale = buildRationale(candidate, selectedResult, candidates);
    const sources = buildSources(candidate);

    // 7. Hard Enforcement Assertions
    const validation = validatePostDraft(generated.text, rationale, sources);
    if (!validation.valid) {
      logger.error('Post generation failed validation check. Dropping post.', { error: validation.error });
      return;
    }

    const topicKey = computeTopicKey(`${candidate.title} ${generated.text}`);

    // 8. Atomically save post & memory index
    const post = await savePostWithMemory(
      agentId,
      candidate.id,
      generated.text,
      rationale,
      sources,
      generated.groundingNotes,
      topicKey
    );

    logger.info('=== Successfully Published Autonomous Post ===', {
      agentId,
      postId: post.id,
      title: candidate.title,
      rationale,
      sources,
    });
  }

  public async autoResumeActiveAgents(): Promise<void> {
    try {
      const activeAgents = await query(`SELECT id FROM agents WHERE status = 'active'`);
      logger.info(`Auto-resuming ${activeAgents.length} active agent loop(s)...`);
      for (const agent of activeAgents) {
        this.startAgentLoop(agent.id);
      }
    } catch (err: any) {
      logger.error('Failed to auto-resume active agents on boot', { error: err.message });
    }
  }
}

export const agentScheduler = new AgentScheduler();
