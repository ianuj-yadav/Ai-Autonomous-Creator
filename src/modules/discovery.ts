/**
 * Topic Discovery Module — FR-3.1, FR-3.2, FR-3.3, FR-3.4
 *
 * Queries Exa Search with rotating query angles derived from the
 * persona's interest areas. Treats all fetched content as untrusted
 * data (NFR-6) — summaries are plain-text only, never raw HTML.
 */
import Exa from 'exa-js';
import { v4 as uuid } from 'uuid';
import { config } from '../config';
import { logger } from '../logger';
import type { TopicCandidate, VoiceProfile } from '../types';

const exa = new Exa(config.exa.apiKey);

// Track recently used query strings per agent to avoid repeating them
const recentQueriesMap = new Map<string, string[]>();
const MAX_RECENT_QUERIES = 8;

/** Build diverse query angles from the persona's interests */
function buildQueries(voiceProfile: VoiceProfile): string[] {
  const { interests } = voiceProfile;
  const angles = [
    (interest: string) => `latest developments in ${interest} 2026`,
    (interest: string) => `new research ${interest}`,
    (interest: string) => `${interest} breakthrough news`,
    (interest: string) => `${interest} practical implications`,
    (interest: string) => `${interest} security risks`,
    (interest: string) => `${interest} open source tools`,
  ];

  return interests.flatMap((interest) =>
    angles.map((fn) => fn(interest))
  );
}

/** Sanitize fetched text — remove HTML, keep plain text only (NFR-6) */
function sanitize(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, ' ')      // strip HTML tags
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);               // cap length fed into prompts
}

export async function discoverCandidates(
  agentId: string,
  voiceProfile: VoiceProfile
): Promise<TopicCandidate[]> {
  const allQueries = buildQueries(voiceProfile);
  const recent = recentQueriesMap.get(agentId) ?? [];

  // Pick 2 queries not in the recent list, shuffled
  const available = allQueries
    .filter((q) => !recent.includes(q))
    .sort(() => Math.random() - 0.5);

  // If we've exhausted all queries, reset
  const pool = available.length >= 2 ? available : allQueries.sort(() => Math.random() - 0.5);
  const chosen = pool.slice(0, 2);

  // Update recent queries ring buffer
  const updated = [...recent, ...chosen].slice(-MAX_RECENT_QUERIES);
  recentQueriesMap.set(agentId, updated);

  logger.info({ agentId, queries: chosen }, 'Discovery: running queries');

  const candidateMap = new Map<string, TopicCandidate>();

  for (const queryStr of chosen) {
    try {
      const result = await exa.searchAndContents(queryStr, {
        type: 'neural',
        numResults: 5,
        summary: true,
        livecrawl: 'always',
      });

      for (const item of result.results ?? []) {
        if (!item.url || !item.title) continue;

        // Dedup within the same run by URL
        if (candidateMap.has(item.url)) continue;

        const summary = sanitize(
          (item as { summary?: string }).summary ??
          (item as { text?: string }).text
        );

        if (!summary) continue;

        candidateMap.set(item.url, {
          id: uuid(),
          title: sanitize(item.title),
          summary,
          sourceUrls: [item.url],
          discoveredAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      // FR-3.4: graceful degradation — skip this query, don't crash
      logger.warn({ err, query: queryStr, agentId }, 'Discovery query failed — skipping');
    }
  }

  const candidates = [...candidateMap.values()];
  logger.info({ agentId, count: candidates.length }, 'Discovery complete');
  return candidates;
}
