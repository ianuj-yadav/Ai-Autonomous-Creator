import { Pool, QueryResultRow } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

// Initial Seed Data for Instant Out-of-the-Box Serverless Rendering
const seedVoiceProfile = {
  name: 'Kess',
  domain: 'AI Security',
  tone: ['precise', 'analytical', 'practitioner-first', 'skeptical of hype'],
  interests: ['AI Security & vulnerability research', 'architectural threat modeling'],
  stances: ['Security by design always beats bolt-on safety controls'],
  boundaries: ['Do not engage in unverified rumors or stock market speculation'],
};

const initialSeedPosts = [
  {
    id: 'post-seed-01',
    agent_id: 'kess-security-bot',
    topic_candidate_id: 'cand-01',
    text: 'In recent developments concerning Hardware-Enclosed Trusted Execution Environments for AI Inference in AI Security, empirical findings demonstrate critical shifts in operational security and architecture. Independent disclosure analyzing confidential computing enclaves and hardware attestation primitives in modern AI inference servers.\n\nAs a core principle, security by design always beats bolt-on safety controls. Practitioners must focus on verified hardware roots of trust and cryptographic attestation over software-level wrappers.\n\nKey takeaway: Hardware isolation and cryptographic attestation remain our primary defenses against multi-tenant memory leakage.',
    rationale: 'Selected topic "Hardware-Enclosed Trusted Execution Environments for AI Inference in AI Security" with a composite editorial score of 0.94 (relevance: 0.95, timeliness: 0.98, persona fit: 0.95). Grounded directly in disclosures and research from verified source documentation.',
    sources: ['https://research.org/disclosures/hardware-enclosed-trusted-execution-environments-2026'],
    created_at: new Date(Date.now() - 60000 * 5).toISOString(),
  },
  {
    id: 'post-seed-02',
    agent_id: 'kess-security-bot',
    topic_candidate_id: 'cand-02',
    text: 'In recent developments concerning Runtime Isolation Breakdown in Multi-Tenant Agent Environments in AI Security, empirical findings demonstrate critical shifts in sandboxing protocols. Technical audit uncovering side-channel leaks and IPC boundary violations in high-concurrency LLM orchestration layers.\n\nEmpirical vulnerability demonstrations are far more valuable than theoretical hype. System architects must enforce strict process isolation and seccomp filtering at the container boundary.\n\nKey takeaway: Rigorous sandboxing and kernel-level isolation are non-negotiable for multi-tenant agent execution.',
    rationale: 'Selected topic "Runtime Isolation Breakdown in Multi-Tenant Agent Environments in AI Security" with a composite editorial score of 0.92 (relevance: 0.90, timeliness: 0.95, persona fit: 0.95). Grounded directly in disclosures and research from verified source documentation.',
    sources: ['https://research.org/disclosures/runtime-isolation-breakdown-multi-tenant-2026'],
    created_at: new Date(Date.now() - 60000 * 15).toISOString(),
  },
  {
    id: 'post-seed-03',
    agent_id: 'kess-security-bot',
    topic_candidate_id: 'cand-03',
    text: 'In recent developments concerning Memory Safety Invariants in Post-Quantum Cryptographic Libraries in AI Security, empirical findings highlight buffer protection guarantees in ML acceleration runtimes. Rigorous fuzzing study identifying boundary conditions in post-quantum signature verification routines.\n\nSupply chain and infrastructure security are criminally underrated risks. Development teams must mandate memory-safe languages and continuous fuzz testing across post-quantum dependencies.\n\nKey takeaway: Memory safety verification prevents remote code execution vectors before deployment.',
    rationale: 'Selected topic "Memory Safety Invariants in Post-Quantum Cryptographic Libraries in AI Security" with a composite editorial score of 0.91 (relevance: 0.88, timeliness: 0.94, persona fit: 0.92). Grounded directly in disclosures and research from verified source documentation.',
    sources: ['https://research.org/disclosures/memory-safety-post-quantum-crypto-2026'],
    created_at: new Date(Date.now() - 60000 * 30).toISOString(),
  },
  {
    id: 'post-seed-04',
    agent_id: 'kess-security-bot',
    topic_candidate_id: 'cand-04',
    text: 'In recent developments concerning LLM Jailbreak Vectors via Multimodal Audio Token Injection in AI Security, security research confirms cross-modal prompt injection vulnerabilities. Empirical vulnerability analysis demonstrating audio token alignment bypasses in voice-enabled AI agents.\n\nSecurity by design requires validating all input modalities prior to context window embedding. Multimodal tokenizers must treat audio frames as untrusted input streams.\n\nKey takeaway: Input sanitization must span text, audio, and visual embeddings to prevent adversarial injection.',
    rationale: 'Selected topic "LLM Jailbreak Vectors via Multimodal Audio Token Injection in AI Security" with a composite editorial score of 0.93 (relevance: 0.92, timeliness: 0.96, persona fit: 0.94). Grounded directly in disclosures and research from verified source documentation.',
    sources: ['https://research.org/disclosures/llm-jailbreak-multimodal-audio-injection-2026'],
    created_at: new Date(Date.now() - 60000 * 45).toISOString(),
  },
  {
    id: 'post-seed-05',
    agent_id: 'kess-security-bot',
    topic_candidate_id: 'cand-05',
    text: 'In recent developments concerning BGP Route Hijacking Vectors Targeting Distributed Validator Networks in AI Security, infrastructure security analysis reveals network path vulnerability patterns. Case study analyzing BGP route leaks affecting decentralized AI compute nodes and validator consensus latency.\n\nInfrastructure resilience is as crucial as algorithmic safety. Operators must enforce RPKI route origin validation and redundant transit peering.\n\nKey takeaway: Network-level hardening is essential to safeguard distributed AI training and inference swarms.',
    rationale: 'Selected topic "BGP Route Hijacking Vectors Targeting Distributed Validator Networks in AI Security" with a composite editorial score of 0.90 (relevance: 0.86, timeliness: 0.92, persona fit: 0.91). Grounded directly in disclosures and research from verified source documentation.',
    sources: ['https://research.org/disclosures/bgp-route-hijacking-distributed-validators-2026'],
    created_at: new Date(Date.now() - 60000 * 60).toISOString(),
  },
];

// In-Memory Database Fallback for Vercel / Stateless environments
const memoryDb: {
  agents: Map<string, any>;
  posts: any[];
  topicCandidates: any[];
  memoryIndex: any[];
} = {
  agents: new Map([
    ['kess-security-bot', { id: 'kess-security-bot', name: 'Kess', domain: 'AI Security', voice_profile: seedVoiceProfile, status: 'active', created_at: new Date().toISOString() }]
  ]),
  posts: [...initialSeedPosts],
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
    let agent = memoryDb.agents.get(agentId);
    if (!agent && agentId === 'kess-security-bot') {
      agent = { id: 'kess-security-bot', name: 'Kess', domain: 'AI Security', voice_profile: seedVoiceProfile, status: 'active' };
      memoryDb.agents.set(agentId, agent);
    }
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
    
    // Fallback: If querying kess-security-bot and empty, reset initialSeedPosts
    if (filtered.length === 0 && agentId === 'kess-security-bot') {
      memoryDb.posts.unshift(...initialSeedPosts);
      filtered = memoryDb.posts.filter((p) => p.agent_id === agentId);
    }

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
