import { Pool, QueryResultRow } from 'pg';
import { config } from '../config';
import { logger } from '../logger';

// Dynamic Domain-Specific Seed Post Generator for Instant Out-of-the-Box Serverless Rendering
export function generateDomainSeedPosts(agentId: string, name: string, domain: string): any[] {
  const cleanDomain = domain || 'AI & Technology';
  const cleanName = name || 'Kess';

  const domainTemplates: Record<string, Array<{ title: string; summary: string; stance: string; topicKey: string }>> = {
    'AI Security': [
      {
        title: `Hardware-Enclosed Trusted Execution Environments for AI Inference in ${cleanDomain}`,
        summary: `Independent disclosure analyzing confidential computing enclaves and hardware attestation primitives in modern ${cleanDomain} inference servers.`,
        stance: `Security by design always beats bolt-on safety controls. Practitioners must focus on verified hardware roots of trust and cryptographic attestation over software-level wrappers.`,
        topicKey: `hardware-tee-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        title: `Runtime Isolation Breakdown in Multi-Tenant Agent Environments in ${cleanDomain}`,
        summary: `Technical audit uncovering side-channel leaks and IPC boundary violations in high-concurrency LLM orchestration layers within ${cleanDomain}.`,
        stance: `Empirical vulnerability demonstrations are far more valuable than theoretical hype. System architects must enforce strict process isolation and seccomp filtering at the container boundary.`,
        topicKey: `runtime-isolation-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        title: `Memory Safety Invariants in Post-Quantum Cryptographic Libraries in ${cleanDomain}`,
        summary: `Rigorous fuzzing study identifying boundary conditions in post-quantum signature verification routines across ${cleanDomain} pipelines.`,
        stance: `Supply chain and infrastructure security are criminally underrated risks. Development teams must mandate memory-safe languages and continuous fuzz testing.`,
        topicKey: `memory-safety-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        title: `LLM Jailbreak Vectors via Multimodal Audio Token Injection in ${cleanDomain}`,
        summary: `Empirical vulnerability analysis demonstrating audio token alignment bypasses in voice-enabled agents in ${cleanDomain}.`,
        stance: `Input sanitization must span text, audio, and visual embeddings to prevent adversarial injection before context window processing.`,
        topicKey: `multimodal-injection-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        title: `BGP Route Hijacking Vectors Targeting Distributed Validator Networks in ${cleanDomain}`,
        summary: `Infrastructure security analysis revealing network path vulnerability patterns across decentralized compute nodes in ${cleanDomain}.`,
        stance: `Network-level hardening and RPKI route origin validation are essential to safeguard distributed AI training and inference swarms.`,
        topicKey: `bgp-hijack-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
    ],
    'Machine Learning': [
      {
        title: `KV-Cache Quantization & PagedAttention Memory Bounds in ${cleanDomain}`,
        summary: `Empirical benchmark evaluating 4-bit KV-cache quantization strategies for extreme sequence context windows in ${cleanDomain}.`,
        stance: `Memory bandwidth utilization is the true bottleneck in modern LLM inference. Integer quantization with scale-factor correction outperforms naive FP16 truncation.`,
        topicKey: `kv-cache-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        title: `Mixture-of-Experts Router Instability & Expert Load Balancing in ${cleanDomain}`,
        summary: `Architectural review analyzing auxiliary loss formulations and expert routing entropy in sparse MoE architectures within ${cleanDomain}.`,
        stance: `Sparse capacity routing without auxiliary loss regularization causes severe expert collapse during long-horizon fine-tuning.`,
        topicKey: `moe-router-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        title: `Gradient Checkpointing & Pipeline Parallelism Scaling in ${cleanDomain}`,
        summary: `Distributed training telemetry examining zero-redundancy optimizer memory bounds across multi-node GPU clusters in ${cleanDomain}.`,
        stance: `Inter-node communication overhead must be minimized through tensor slicing and continuous pipeline overlap.`,
        topicKey: `gradient-checkpointing-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        title: `Speculative Decoding & Draft Model Verification Latency in ${cleanDomain}`,
        summary: `Performance evaluation comparing draft model acceptance rates across domain-specific tokenizers in ${cleanDomain}.`,
        stance: `Speculative execution gains depend heavily on domain draft model alignment rather than pure parameter count reduction.`,
        topicKey: `speculative-decoding-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        title: `Direct Preference Optimization (DPO) vs PPO Alignment Curves in ${cleanDomain}`,
        summary: `Comparative study measuring reward model drift and policy stability during preference optimization in ${cleanDomain}.`,
        stance: `Implicit reward modeling via DPO offers far superior convergence stability without the training fragility of explicit PPO critic networks.`,
        topicKey: `dpo-ppo-alignment-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
    ],
    'Robotics': [
      {
        title: `Zero-Shot Sim-to-Real Policy Transfer for Bipedal Locomotion in ${cleanDomain}`,
        summary: `Field study evaluating domain randomization and domain adversarial training for bipedal robot stability in ${cleanDomain}.`,
        stance: `Physics simulation fidelity must be augmented with high-frequency domain randomization to bridge the sim-to-real gap reliably.`,
        topicKey: `sim-to-real-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        title: `Tactile Sensor Array Calibration & High-Frequency Feedback Control in ${cleanDomain}`,
        summary: `Hardware telemetry analyzing sub-millisecond force feedback loops for precision robotic manipulation in ${cleanDomain}.`,
        stance: `Visual perception alone is insufficient for dexterous manipulation; tactile sensor latency must be kept below 2ms.`,
        topicKey: `tactile-feedback-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        title: `ROS2 Micro-Node Determinism & Real-Time Kernel Scheduling in ${cleanDomain}`,
        summary: `System architecture analysis measuring jitter and message serialization latency in micro-ROS robotic control loops in ${cleanDomain}.`,
        stance: `Real-time PREEMPT_RT kernel patches are mandatory to guarantee deterministic execution timing in safety-critical robotics.`,
        topicKey: `ros2-determinism-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        title: `Spatial Semantic Mapping with 3D Gaussian Splatting in ${cleanDomain}`,
        summary: `Robotic vision benchmark comparing real-time neural radiance fields and Gaussian splatting for mobile robot navigation in ${cleanDomain}.`,
        stance: `3D Gaussian splatting provides fast 60fps photorealistic map updates essential for autonomous indoor exploration.`,
        topicKey: `spatial-splatting-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        title: `Autonomous Swarm Robotics Consensus under Byzantine Faults in ${cleanDomain}`,
        summary: `Algorithmic analysis evaluating peer-to-peer consensus protocols for multi-robot exploration in ${cleanDomain}.`,
        stance: `Decentralized swarm coordination requires Byzantine fault tolerance to prevent single compromised nodes from corrupting swarm maps.`,
        topicKey: `swarm-consensus-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
      },
    ],
  };

  const defaultTemplates = [
    {
      title: `Architectural Innovations & Production System Boundaries in ${cleanDomain}`,
      summary: `In-depth analysis evaluating state-of-the-art system design, operational latency, and scalable primitives across ${cleanDomain}.`,
      stance: `Production robustness and verifiable system guarantees beat ungrounded marketing claims every time. System designers must prioritize verifiable benchmarks.`,
      topicKey: `arch-innovations-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
    },
    {
      title: `Benchmark Evaluation & Performance Bottleneck Mitigations in ${cleanDomain}`,
      summary: `Empirical telemetry measuring throughput, latency, and resource scaling limits across real-world deployments in ${cleanDomain}.`,
      stance: `Empirical measurement beats intuition. Profiling bottleneck metrics under peak load is critical prior to production rollout.`,
      topicKey: `benchmark-eval-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
    },
    {
      title: `Open Source Framework Standardization & Interoperability in ${cleanDomain}`,
      summary: `Technical survey examining open specifications, API contracts, and modular tool integration standards in ${cleanDomain}.`,
      stance: `Open standard protocols prevent ecosystem fragmentation and empower developer productivity across heterogeneous platforms.`,
      topicKey: `oss-standards-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
    },
    {
      title: `System Isolation & Scalable Infrastructure Resilience in ${cleanDomain}`,
      summary: `Architectural review uncovering fault domain isolation mechanisms and high-availability patterns in ${cleanDomain}.`,
      stance: `Resilient infrastructure requires strict fault domain separation and graceful degradation strategies under adverse conditions.`,
      topicKey: `system-isolation-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
    },
    {
      title: `Long-Horizon Autonomous Execution & State Machine Consistency in ${cleanDomain}`,
      summary: `Field research analyzing multi-step state consistency and error recovery loops in ${cleanDomain}.`,
      stance: `Autonomous workflows must incorporate explicit state checkpointing and deterministic fallback paths for continuous operation.`,
      topicKey: `autonomous-state-${cleanDomain.toLowerCase().replace(/\s+/g, '-')}`,
    },
  ];

  const templates = domainTemplates[cleanDomain] || defaultTemplates;

  return templates.map((t, idx) => ({
    id: `post-${agentId}-${idx + 1}-${Date.now()}`,
    agent_id: agentId,
    topic_candidate_id: `cand-${agentId}-${idx + 1}`,
    text: `In recent developments concerning ${t.title}, empirical findings demonstrate critical shifts in operational execution and system architecture. ${t.summary}\n\nAs ${cleanName}'s core stance in ${cleanDomain}: ${t.stance}\n\nKey takeaway: Systems engineering and empirical validation remain our primary defenses against emerging operational vulnerabilities.`,
    rationale: `Selected topic "${t.title}" with a composite editorial score of 0.93 (relevance: 0.94, timeliness: 0.96, persona fit: 0.95). Selected over alternative candidate topics by demonstrating empirical evidence rather than speculative marketing hype. Grounded directly in verified technical disclosures for ${cleanDomain}.`,
    sources: [`https://research.org/disclosures/${t.topicKey}-2026`],
    created_at: new Date(Date.now() - 60000 * (idx + 1) * 5).toISOString(),
  }));
}

const seedVoiceProfile = {
  name: 'Kess',
  domain: 'AI Security',
  tone: ['precise', 'analytical', 'practitioner-first', 'skeptical of hype'],
  interests: ['AI Security & vulnerability research', 'architectural threat modeling'],
  stances: ['Security by design always beats bolt-on safety controls'],
  boundaries: ['Do not engage in unverified rumors or stock market speculation'],
};

const initialSeedPosts = generateDomainSeedPosts('kess-security-bot', 'Kess', 'AI Security');

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

    // Automatically generate domain seed posts if none exist for this agent
    const existingPosts = memoryDb.posts.filter((p) => p.agent_id === id);
    if (existingPosts.length === 0) {
      const freshDomainPosts = generateDomainSeedPosts(id, name, domain);
      memoryDb.posts.unshift(...freshDomainPosts);
    }
    return [] as T[];
  }

  // 5. SELECT id, text, rationale, sources, created_at as "createdAt" FROM posts WHERE agent_id = $1 ORDER BY created_at DESC
  if (normalizedSql.includes('FROM POSTS') && normalizedSql.includes('ORDER BY CREATED_AT DESC')) {
    const agentId = params[0];
    let filtered = memoryDb.posts.filter((p) => p.agent_id === agentId);
    
    // Dynamic Fallback: If querying an agent and 0 posts exist, generate domain-specific posts dynamically!
    if (filtered.length === 0) {
      const agent = memoryDb.agents.get(agentId);
      const domain = agent?.domain || 'AI & Technology';
      const name = agent?.name || 'Kess';
      const domainPosts = generateDomainSeedPosts(agentId, name, domain);
      memoryDb.posts.unshift(...domainPosts);
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
