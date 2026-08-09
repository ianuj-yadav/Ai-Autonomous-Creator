-- Autonomous AI Creator — initial schema
-- Run once: tsx src/db/migrate.ts

CREATE TABLE IF NOT EXISTS agents (
  agent_id       TEXT PRIMARY KEY,
  persona_name   TEXT NOT NULL,
  persona_domain TEXT NOT NULL,
  voice_profile  JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status         TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'paused'))
);

CREATE TABLE IF NOT EXISTS posts (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  rationale   TEXT NOT NULL,
  sources     JSONB NOT NULL,   -- string[]
  topic_key   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_agent_created
  ON posts(agent_id, created_at DESC);

-- Internal only — never exposed via API
CREATE TABLE IF NOT EXISTS topic_candidates (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  summary         TEXT,
  source_urls     JSONB NOT NULL,   -- string[]
  discovered_at   TIMESTAMPTZ NOT NULL,
  score           REAL,
  decision        TEXT CHECK (decision IN ('accepted', 'rejected')),
  decision_reason TEXT
);

CREATE INDEX IF NOT EXISTS topic_candidates_agent_cycle
  ON topic_candidates(agent_id, discovered_at DESC);

-- Internal — supports dedup and continuity
CREATE TABLE IF NOT EXISTS memory_index (
  id          SERIAL PRIMARY KEY,
  agent_id    TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  topic_key   TEXT NOT NULL,
  keywords    JSONB NOT NULL   -- string[]
);

CREATE INDEX IF NOT EXISTS memory_index_agent_topic
  ON memory_index(agent_id, topic_key);
