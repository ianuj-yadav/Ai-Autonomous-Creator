/**
 * Rationale & Source Attribution Module — FR-7.1, FR-7.2, FR-7.3
 *
 * Builds the required rationale string and validates sources.
 * CRITICAL: enforces non-empty rationale + sources in code before any
 * post reaches persistence — never relies on prompt compliance alone.
 */
import { logger } from '../logger';
import type { ScoredCandidate, TopicCandidate } from '../types';

/**
 * Builds a 2-4 sentence rationale covering:
 *  1. Why this topic was selected (persona fit / judgment reason)
 *  2. Why it is relevant now (timeliness)
 *  3. Where it came from (source provenance)
 *  4. Why it beat alternatives (if others were evaluated this cycle)
 */
export function buildRationale(
  accepted: ScoredCandidate,
  allScored: ScoredCandidate[]
): string {
  const { candidate, subScores, reason } = accepted;

  // Timeliness note
  const discovered = new Date(candidate.discoveredAt);
  const ageHours = (Date.now() - discovered.getTime()) / 3_600_000;
  const timelinessNote =
    ageHours < 2
      ? 'breaking within the last two hours'
      : ageHours < 12
      ? 'published within the last 12 hours'
      : 'recent and actively discussed';

  // Alternatives note
  const rejected = allScored
    .filter((s) => s.decision === 'rejected')
    .slice(0, 2);
  const alternativesNote =
    rejected.length > 0
      ? ` Evaluated and passed over ${rejected.length} other candidate${rejected.length > 1 ? 's' : ''} (${rejected
          .map((r) => `"${r.candidate.title.slice(0, 50)}" — ${r.reason.slice(0, 80)}`)
          .join('; ')}).`
      : '';

  const rationale =
    `Selected because ${reason}. ` +
    `The story is ${timelinessNote}, with a timeliness score of ${(subScores.timeliness * 100).toFixed(0)}% ` +
    `and domain relevance of ${(subScores.relevance * 100).toFixed(0)}%. ` +
    `Source: ${candidate.sourceUrls[0]}.` +
    alternativesNote;

  return rationale;
}

/** Validate and deduplicate source URLs — must return ≥ 1 absolute URL */
export function buildSources(candidate: TopicCandidate): string[] {
  const seen = new Set<string>();
  const valid: string[] = [];

  for (const url of candidate.sourceUrls) {
    if (!url || seen.has(url)) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        valid.push(url);
        seen.add(url);
      }
    } catch {
      // invalid URL — skip silently
    }
  }
  return valid;
}

/**
 * Pre-publish guard — enforced in code, not just prompt instructions (FR-7.3).
 * Throws if either field would be empty, so the scheduler can catch and skip.
 */
export function assertPublishable(rationale: string, sources: string[]): void {
  if (!rationale || rationale.trim().length === 0) {
    const err = new Error('Post rejected: rationale is empty');
    logger.error(err.message);
    throw err;
  }
  if (!sources || sources.length === 0) {
    const err = new Error('Post rejected: sources array is empty');
    logger.error(err.message);
    throw err;
  }
}
