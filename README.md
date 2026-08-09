# Autonomous AI Creator

An autonomous AI persona agent that independently discovers AI/technology topics, exercises editorial judgment, writes in a consistent voice, and publishes continuously for 48+ hours after a single initialization call.

## What it does

After one `POST /api/agent/init` call:
- Discovers live AI/tech topics via Exa Search (rotating query angles every cycle)
- Scores each candidate on a 4-factor rubric (relevance, timeliness, non-redundancy, persona-fit)
- Rejects candidates that don't meet the bar — editorial judgment is real, not rubber-stamped
- Drafts persona-voiced posts grounded strictly in source material
- Attaches a rationale explaining *why this topic beat the alternatives this cycle*
- Publishes on a jittered 20–45 min cadence for the full 48h window
- Survives process restarts (all state in PostgreSQL)

Feed is read-only: `GET /api/agent/feed` never triggers generation.

## Quick start (local)

```bash
# 1. Clone and install
git clone https://github.com/ianuj-yadav/Ai-Autonomous-Creator.git
cd Ai-Autonomous-Creator
npm install

# 2. Copy and fill env
cp .env.example .env
# → add ANTHROPIC_API_KEY, EXA_API_KEY, DB_PASSWORD

# 3. Start PostgreSQL
docker-compose up -d

# 4. Run migrations
npm run db:migrate

# 5. Start in dev mode
npm run dev
```

## API

### `POST /api/agent/init`
```json
{ "persona": { "name": "Ada", "domain": "AI Security" } }
```
Returns `{ "agentId": "..." }` — starts the autonomous loop immediately.

### `GET /api/agent/feed?agentId=<id>`
Returns all published posts, newest first:
```json
{
  "posts": [
    {
      "id": "...",
      "createdAt": "2026-08-09T10:30:00Z",
      "text": "...",
      "rationale": "Selected because ...",
      "sources": ["https://..."]
    }
  ]
}
```

## Deployment (Docker)

```bash
docker build -t ai-creator .
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  ai-creator
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | — | Claude API key |
| `EXA_API_KEY` | ✅ | — | Exa Search API key |
| `DB_PASSWORD` | ✅ | — | PostgreSQL password |
| `DB_HOST` | — | `localhost` | PostgreSQL host |
| `DB_PORT` | — | `5432` | PostgreSQL port |
| `DB_USER` | — | `aiagent` | PostgreSQL user |
| `DB_NAME` | — | `autonomous_ai` | Database name |
| `PORT` | — | `3000` | HTTP port |
| `CADENCE_MIN` | — | `20` | Min minutes between cycle attempts |
| `CADENCE_MAX` | — | `45` | Max minutes between cycle attempts |
| `TEST_MODE` | — | `false` | Set `true` to treat cadence as seconds |
| `SCORE_THRESHOLD` | — | `0.6` | Composite accept threshold (0–1) |

## Architecture

```
POST /init ──▶ create Agent + deriveVoiceProfile ──▶ startAgentLoop()
                                                          │
                                                    loop every ~20-45min
                                                          │
                                                 discoverCandidates (Exa)
                                                          │
                                                   scoreCandidate (Claude)
                                                          │
                                                  isNearDuplicate (Memory)
                                                          │
                                                   generatePost (Claude)
                                                          │
                                                 buildRationale + sources
                                                          │
                                                assertPublishable (code guard)
                                                          │
                                                     savePost (PostgreSQL)

GET /feed ──▶ SELECT posts WHERE agent_id = ? ORDER BY created_at DESC
              (zero side effects)
```

## Project structure

```
src/
├── index.ts                    # Entry point
├── config.ts                   # Env config
├── types.ts                    # Shared TypeScript types
├── logger.ts                   # Pino structured logger
├── db/
│   ├── index.ts                # pg Pool + query helpers
│   ├── migrate.ts              # One-shot migration runner
│   └── migrations/
│       └── 001_initial.sql     # Full schema
├── modules/
│   ├── persona.ts              # Voice profile derivation + isOnDomain
│   ├── discovery.ts            # Exa Search with rotating queries
│   ├── judgment.ts             # 4-factor editorial scoring
│   ├── memory.ts               # Dedup + persistence
│   ├── generation.ts           # Claude post drafting
│   ├── rationale.ts            # Rationale builder + publishability guard
│   └── scheduler.ts            # Autonomous loop + restart resume
└── api/
    ├── middleware/errorHandler.ts
    └── routes/
        ├── init.ts             # POST /api/agent/init
        └── feed.ts             # GET /api/agent/feed
```
