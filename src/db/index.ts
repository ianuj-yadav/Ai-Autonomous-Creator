import { Pool, QueryResultRow } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

// In-Memory Database Fallback for Vercel / Stateless environments
const memoryDb: {
  agents: Map<string, any>;
  posts: any[];
  topicCandidates: any[];
  memoryIndex: any[];
} = {
  agents: new Map(),
  posts: [],
  topicCandidates: [],
  memoryIndex: [],
};

export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

let isPgAvailable: boolean | null = null;

pool.on('error', (err) => {
  logger.warn('PostgreSQL pool connection error, falling back to in-memory store', { error: err.message });
  isPgAvailable = false;
});

export async function query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<T[]> {
  // If we already know PG is unavailable, use in-memory handler
  if (isPgAvailable === false) {
    return handleInMemoryQuery<T>(text, params);
  }

  try {
    const start = Date.now();
    const res = await pool.query<T>(text, params);
    isPgAvailable = true;
    logger.debug('Executed SQL query', { duration: Date.now() - start, rows: res.rowCount });
    return res.rows;
  } catch (err: any) {
    logger.warn('PostgreSQL query failed, switching to in-memory database fallback', { error: err.message });
    isPgAvailable = false;
    return handleInMemoryQuery<T>(text, params);
  }
}

function handleInMemoryQuery<T = any>(sql: string, params: any[] = []): T[] {
  const normalizedSql = sql.replace(/\s+/g, ' ').trim().toUpperCase();

  // 1. SELECT id FROM agents WHERE id = $1
  if (normalizedSql.includes('SELECT ID FROM AGENTS WHERE ID = $1')) {
    const agentId = params[0];
    const agent = memoryDb.agents.get(agentId);
    return (agent ? [{ id: agent.id }] : []) as T[];
  }

  // 2. SELECT id FROM agents ORDER BY created_at DESC LIMIT 1
  if (normalizedSql.includes('SELECT ID FROM AGENTS ORDER BY CREATED_AT DESC LIMIT 1')) {
    const agentsArr = Array.from(memoryDb.agents.values());
    if (agentsArr.length === 0) return [] as T[];
    agentsArr.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return [{ id: agentsArr[0].id }] as T[];
  }

  // 3. SELECT id, name, domain, voice_profile as "voiceProfile", status FROM agents WHERE id = $1
  if (normalizedSql.includes('SELECT ID, NAME, DOMAIN, VOICE_PROFILE AS "VOICEPROFILE", STATUS FROM AGENTS WHERE ID = $1')) {
    const agentId = params[0];
    const agent = memoryDb.agents.get(agentId);
    if (!agent) return [] as T[];
    return [{
      id: agent.id,
      name: agent.name,
      domain: agent.domain,
      status: agent.status,
      voiceProfile: agent.voice_profile,
    }] as T[];
  }

  // 4. INSERT INTO agents (id, name, domain, voice_profile, status) ... ON CONFLICT
  if (normalizedSql.includes('INSERT INTO AGENTS')) {
    const [id, name, domain, voiceProfile] = params;
    const existing = memoryDb.agents.get(id) || {};
    memoryDb.agents.set(id, {
      ...existing,
      id,
      name,
      domain,
      voice_profile: voiceProfile,
      status: 'active',
      created_at: existing.created_at || new Date().toISOString(),
    });
    return [] as T[];
  }

  // 5. SELECT id, text, rationale, sources, created_at as "createdAt" FROM posts WHERE agent_id = $1 ORDER BY created_at DESC
  if (normalizedSql.includes('FROM POSTS') && normalizedSql.includes('ORDER BY CREATED_AT DESC')) {
    const agentId = params[0];
    let filtered = memoryDb.posts.filter((p) => p.agent_id === agentId);
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return filtered.map((p) => ({
      id: p.id,
      text: p.text,
      rationale: p.rationale,
      sources: p.sources,
      createdAt: p.created_at,
    })) as T[];
  }

  // 6. INSERT INTO posts
  if (normalizedSql.includes('INSERT INTO POSTS')) {
    const [id, agentId, topicCandidateId, text, rationale, sources] = params;
    const post = {
      id,
      agent_id: agentId,
      topic_candidate_id: topicCandidateId,
      text,
      rationale,
      sources,
      created_at: new Date().toISOString(),
    };
    memoryDb.posts.unshift(post);
    return [] as T[];
  }

  // 7. INSERT INTO memory_index
  if (normalizedSql.includes('INSERT INTO MEMORY_INDEX')) {
    const [id, agentId, postId, topicKey, fullText] = params;
    memoryDb.memoryIndex.unshift({
      id,
      agent_id: agentId,
      post_id: postId,
      topic_key: topicKey,
      full_text: fullText,
      created_at: new Date().toISOString(),
    });
    return [] as T[];
  }

  // 8. SELECT topic_key as "topicKey", full_text as "fullText" FROM memory_index
  if (normalizedSql.includes('FROM MEMORY_INDEX')) {
    const agentId = params[0];
    const filtered = memoryDb.memoryIndex.filter((m) => m.agent_id === agentId);
    return filtered.map((m) => ({
      topicKey: m.topic_key,
      fullText: m.full_text,
    })) as T[];
  }

  return [] as T[];
}
