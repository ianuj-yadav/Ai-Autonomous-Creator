import { query, pool } from '../db';
import { logger } from '../logger';
import { TopicCandidate } from './discovery';

export interface Post {
  id: string;
  agentId: string;
  candidateId?: string;
  text: string;
  rationale: string;
  sources: string[];
  groundingNotes?: string;
  topicKey: string;
  createdAt: Date;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'against', 'between',
  'into', 'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up',
  'down', 'of', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'this',
  'that', 'these', 'those', 'new', 'more', 'most', 'other', 'some', 'such', 'no',
]);

export function computeTopicKey(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  
  const uniqueSorted = Array.from(new Set(words)).sort();
  return uniqueSorted.join(' ');
}

export function calculateJaccardSimilarity(keyA: string, keyB: string): number {
  const setA = new Set(keyA.split(' '));
  const setB = new Set(keyB.split(' '));

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionSize++;
  }

  const unionSize = new Set([...setA, ...setB]).size;
  return intersectionSize / unionSize;
}

export async function getRecentPosts(agentId: string, limit = 10): Promise<Post[]> {
  const rows = await query(
    `SELECT id, agent_id as "agentId", candidate_id as "candidateId", text, rationale, sources, grounding_notes as "groundingNotes", topic_key as "topicKey", created_at as "createdAt"
     FROM posts
     WHERE agent_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [agentId, limit]
  );
  return rows;
}

export function isNearDuplicate(candidate: TopicCandidate, recentPosts: Post[], threshold = 0.5): { duplicate: boolean; maxSimilarity: number } {
  const candidateKey = computeTopicKey(`${candidate.title} ${candidate.summary}`);

  let maxSimilarity = 0;
  for (const post of recentPosts) {
    const sim = calculateJaccardSimilarity(candidateKey, post.topicKey);
    if (sim > maxSimilarity) {
      maxSimilarity = sim;
    }
    if (sim >= threshold) {
      logger.info('Near-duplicate detected by memory module', { candidateTitle: candidate.title, postText: post.text.substring(0, 50), similarity: sim });
      return { duplicate: true, maxSimilarity };
    }
  }

  return { duplicate: false, maxSimilarity };
}

export async function savePostWithMemory(
  agentId: string,
  candidateId: string | undefined,
  text: string,
  rationale: string,
  sources: string[],
  groundingNotes: string | undefined,
  topicKey: string
): Promise<Post> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const postRes = await client.query(
      `INSERT INTO posts (agent_id, candidate_id, text, rationale, sources, grounding_notes, topic_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, agent_id as "agentId", candidate_id as "candidateId", text, rationale, sources, grounding_notes as "groundingNotes", topic_key as "topicKey", created_at as "createdAt"`,
      [agentId, candidateId || null, text, rationale, JSON.stringify(sources), groundingNotes || null, topicKey]
    );

    const post = postRes.rows[0];

    await client.query(
      `INSERT INTO memory_index (agent_id, post_id, keyword_fingerprint)
       VALUES ($1, $2, $3)`,
      [agentId, post.id, topicKey]
    );

    if (candidateId) {
      await client.query(
        `UPDATE topic_candidates SET status = 'published' WHERE id = $1`,
        [candidateId]
      );
    }

    await client.query('COMMIT');
    logger.info('Post and memory index persisted atomically', { postId: post.id, agentId });
    return post;
  } catch (err: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to save post and memory index', { error: err.message });
    throw err;
  } finally {
    client.release();
  }
}
