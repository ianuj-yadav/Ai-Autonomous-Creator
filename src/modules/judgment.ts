/**
 * Editorial Judgment Module — FR-4.1, FR-4.2, FR-4.3, FR-4.4
 *
 * Scores every topic candidate with a weighted rubric. Every decision
 * (accept and reject) is logged for post-hoc explainability.
 */
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { logger } from '../logger';
import { isOnDomain } from './persona';
import type { Post, ScoredCandidate, TopicCandidate, VoiceProfile } from '../types';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const SCORE_SYSTEM = `You are an editorial scoring assistant.
Given a topic candidate, a persona voice profile, and the persona's recent posts,
score the candidate on four dimensions (each 0.0–1.0) and explain your reasoning.

Respond with ONLY valid JSON in this exact shape:
{
  "relevance": <0-1>,
  "timeliness": <0-1>,
  "nonRedundancy": <0-1>,
  "personaFit": <0-1>,
  "reason": "<one sentence: why this score, naming the weakest dimension if rejected>"
}`;

const WEIGHTS = {
  relevance: 0.30,
  timeliness: 0.25,
  nonRedundancy: 0.25,
  personaFit: 0.20,
};

function compositeScore(sub: ScoredCandidate['subScores']): number {
  return (
    sub.relevance      * WEIGHTS.relevance +
    sub.timeliness     * WEIGHTS.timeliness +
    sub.nonRedundancy  * WEIGHTS.nonRedundancy +
    sub.personaFit     * WEIGHTS.personaFit
  );
}

export async function scoreCandidate(
  candidate: TopicCandidate,
  voiceProfile: VoiceProfile,
  recentPosts: Post[]
): Promise<ScoredCandidate> {
  // Hard gate — isOnDomain must pass before we spend an LLM call
  if (!isOnDomain(`${candidate.title} ${candidate.summary}`, voiceProfile)) {
    const result: ScoredCandidate = {
      candidate,
      score: 0,
      subScores: { relevance: 0, timeliness: 0, nonRedundancy: 0, personaFit: 0 },
      decision: 'rejected',
      reason: 'Hard gate: topic is outside persona domain boundaries',
    };
    logger.info({ title: candidate.title, decision: 'rejected', reason: result.reason }, 'Candidate scored');
    return result;
  }

  const recentTitles = recentPosts
    .slice(0, 5)
    .map((p, i) => `${i + 1}. ${p.text.slice(0, 120)}...`)
    .join('\n');

  const prompt = `Persona voice profile:
- Tone: ${voiceProfile.tone.join(', ')}
- Interests: ${voiceProfile.interests.join(', ')}
- Stances: ${voiceProfile.stances.join('; ')}
- Out of scope: ${voiceProfile.boundaries.join(', ')}

Candidate topic:
Title: ${candidate.title}
Summary: ${candidate.summary}
Discovered: ${candidate.discoveredAt}

Recent posts (last 5):
${recentTitles || '(none yet)'}

Score this candidate.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 256,
      temperature: 0.1,
      system: SCORE_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text.trim();
    const parsed = JSON.parse(raw) as {
      relevance: number;
      timeliness: number;
      nonRedundancy: number;
      personaFit: number;
      reason: string;
    };

    const subScores = {
      relevance:     Math.max(0, Math.min(1, parsed.relevance)),
      timeliness:    Math.max(0, Math.min(1, parsed.timeliness)),
      nonRedundancy: Math.max(0, Math.min(1, parsed.nonRedundancy)),
      personaFit:    Math.max(0, Math.min(1, parsed.personaFit)),
    };

    const score = compositeScore(subScores);

    // Accept threshold: composite >= 0.6 AND relevance >= 0.5 (hard gate)
    const accept =
      score >= config.scoring.threshold &&
      subScores.relevance >= config.scoring.relevanceThreshold;

    const result: ScoredCandidate = {
      candidate,
      score,
      subScores,
      decision: accept ? 'accepted' : 'rejected',
      reason: parsed.reason,
    };

    logger.info(
      { title: candidate.title, score, subScores, decision: result.decision, reason: result.reason },
      'Candidate scored'
    );
    return result;

  } catch (err) {
    // On LLM failure, reject the candidate rather than crashing
    logger.warn({ err, title: candidate.title }, 'Judgment LLM call failed — rejecting candidate');
    return {
      candidate,
      score: 0,
      subScores: { relevance: 0, timeliness: 0, nonRedundancy: 0, personaFit: 0 },
      decision: 'rejected',
      reason: 'Scoring failed due to LLM error',
    };
  }
}

/** Score a batch and return sorted results */
export async function scoreBatch(
  candidates: TopicCandidate[],
  voiceProfile: VoiceProfile,
  recentPosts: Post[]
): Promise<ScoredCandidate[]> {
  const results = await Promise.all(
    candidates.map((c) => scoreCandidate(c, voiceProfile, recentPosts))
  );
  return results.sort((a, b) => b.score - a.score);
}
