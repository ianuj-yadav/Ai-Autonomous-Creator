-- Autonomous AI Creator PostgreSQL Schema

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    voice_profile JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    source_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    scores JSONB,
    status TEXT NOT NULL DEFAULT 'pending', -- 'accepted', 'rejected', 'published'
    rejection_reason TEXT,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES topic_candidates(id),
    text TEXT NOT NULL,
    rationale TEXT NOT NULL,
    sources JSONB NOT NULL DEFAULT '[]'::jsonb,
    grounding_notes TEXT,
    topic_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    keyword_fingerprint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_agent_created ON posts(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_agent_status ON topic_candidates(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_index(agent_id);
