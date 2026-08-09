/**
 * Memory Module — FR-6.1, FR-6.2, FR-6.3
 *
 * Durable SQLite-backed memory of published posts.
 * Provides deduplication via Jaccard similarity on keyword sets.
 */
import { query, queryOne } from '../db';
import { config } from '../config';
import { logger } from '../logger';
import type { Post, TopicCandidate } from '../types';

const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','are','was','were','be','been','being','have','has','had','do',
  'does','did','will','would','could','should','may','might','this',
  'that','these','those','it','its','by','from','about','as','into',
  'through','during','before','after','above','below','between','out',
  'off','over','under','again','then','once','here','there','when',
  'where','why','how','all','both','each','few','more','most','other',
  'some','such','no','not','only','same','so','than','too','very',
  'just','because','if','while','although','however','therefore',
]);

/** Normalise text into a keyword set for comparison */
export function computeKeywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    ),
  ];
}

/** Jaccard similarity between two keyword sets */
function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Normalise title + summary into a stable topic fingerprint */
export function computeTopicKey(title: string, summary = ''): string {
  return computeKeywords(`${title} ${summary}`)
    .sort()
    .slice(0, 15)
    .join('|');
}

/** Fetch most recent N posts for an agent (newest first) */
export async function getRecentPosts(
  agentId: string,
  limit = config.memory.lookback
): Promise<Post[]> {
  const rows = await query<{
    id: string;
    agent_id: string;
    text: string;
    rationale: string;
    sources: string[];
    topic_key: string;
    created_at: string;
  }>(
    `SELECT id, agent_id, text, rationale, sources, topic_key, created_at
     FROM posts
     WHERE agent_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [agentId, limit]
  );

  return rows.map((r) => ({
    id: r.id,
    agentId: r.agent_id,
    text: r.text,
    rationale: r.rationale,
    sources: r.sources,
    topicKey: r.topic_key,
    createdAt: r.created_at,
  }));
}

/**
 * Returns true if a candidate is too similar to any recent post.
 * Defense-in-depth alongside the Judgment module's nonRedundancy score.
 */
export function isNearDuplicate(
  candidate: TopicCandidate,
  recentPosts: Post[],
  threshold = config.memory.dedupThreshold
): boolean {
  const candidateKw = computeKeywords(`${candidate.title} ${candidate.summary}`);

  for (const post of recentPosts) {
    const postKw = computeKeywords(post.text);
    const sim = jaccard(candidateKw, postKw);
    if (sim >= threshold) {
      logger.debug(
        { candidateTitle: candidate.title, postId: post.id, sim },
        'Near-duplicate detected'
      );
      return true;
    }
  }
  return false;
}

/** Persist a new post and update the memory index — atomic transaction */
export async function savePost(post: Omit<Post, 'agentId'> & { agentId: string }): Promise<void> {
  const keywords = computeKeywords(post.text);
  const topicKey = post.topicKey;

  // Use a client for transaction
  const { pool } = await import('../db');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO posts (id, agent_id, text, rationale, sources, topic_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        post.id,
        post.agentId,
        post.text,
        post.rationale,
        JSON.stringify(post.sources),
        topicKey,
        post.createdAt,
      ]
    );
    await client.query(
      `INSERT INTO memory_index (agent_id, post_id, topic_key, keywords)
       VALUES ($1, $2, $3, $4)`,
      [post.agentId, post.id, topicKey, JSON.stringify(keywords)]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Persist a topic candidate record for audit/explainability */
export async function saveCandidate(params: {
  id: string;
  agentId: string;
  title: string;
  summary: string;
  sourceUrls: string[];
  discoveredAt: string;
  score: number | null;
  decision: 'accepted' | 'rejected';
  decisionReason: string;
}): Promise<void> {
  await query(
    `INSERT INTO topic_candidates
       (id, agent_id, title, summary, source_urls, discovered_at, score, decision, decision_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      params.id,
      params.agentId,
      params.title,
      params.summary,
      JSON.stringify(params.sourceUrls),
      params.discoveredAt,
      params.score,
      params.decision,
      params.decisionReason,
    ]
  );
}
