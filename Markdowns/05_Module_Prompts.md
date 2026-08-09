# Module Build Prompts
## Autonomous AI Creator — one ready-to-use prompt per module

**Version:** 1.0 &nbsp;|&nbsp; **Date:** August 8, 2026

---

## How to use this document

Each section below is a **self-contained prompt** you can hand to a coding agent (e.g. Claude Code) one at a time, in order. Every prompt:
- States the module's single responsibility.
- Lists the exact inputs/outputs (contract) so modules compose cleanly.
- References the SRS requirement IDs it must satisfy (from `02_SRS.md`).
- Ends with acceptance criteria the agent should self-check before moving on.

Build order matters: Persistence → Persona → Discovery → Judgment → Memory → Generation → Rationale → Scheduler → API. Each later module depends on contracts established earlier.

---

## Module 0 — Project Scaffold

```
You are setting up the skeleton for a backend service called "Autonomous AI Creator."

Context: It exposes two HTTP endpoints (POST /api/agent/init, GET /api/agent/feed) and
runs a background autonomy loop per agent. Full spec is in the attached SRS and
Architecture documents — read them before writing code.

Task:
- Initialize a TypeScript (Node.js) or Python (FastAPI) project — pick one and be
  consistent for the rest of the build.
- Set up project structure with clear module boundaries matching the Architecture doc
  §2 component table: api/, persona/, discovery/, judgment/, memory/, generation/,
  scheduler/, persistence/, logging/.
- Add a persistence layer using SQLite (file-based) implementing the schema in
  Architecture doc §7 exactly (Agent, Post, TopicCandidate, MemoryIndex tables).
- Add config loading (env vars) for: LLM provider key, search/news API key, DB path,
  cadence min/max minutes, jitter window, scoring threshold.
- Add a structured logger (JSON lines) that every later module will use.

Acceptance criteria:
- Project boots with a single command.
- DB file is created on first run with the four tables above.
- Config loads from env with sensible defaults and fails loudly (clear error) if a
  required key is missing — but must not crash on missing *optional* config.
```

---

## Module 1 — Persona Module

*Satisfies FR-2.1, FR-2.2, FR-2.3, NFR-8, NFR-9*

```
Build the Persona module for the Autonomous AI Creator.

Input contract: { name: string, domain: string } — exactly what arrives in the
POST /api/agent/init request body.

Task:
Write a function deriveVoiceProfile(name, domain) that produces and returns a
structured, persisted persona profile:
{
  tone: string[],              // 3-5 tone/style descriptors, e.g. ["direct","technically precise","skeptical of hype"]
  interests: string[],         // 3-6 concrete sub-topics inside `domain` this persona covers
  stances: string[],           // 2+ recurring opinions/angles this persona is known for
  boundaries: string[]         // topics explicitly out of scope even if AI/tech-adjacent
}

This can be produced via one LLM call at init time (deterministic-ish: low temperature,
a fixed system prompt), or via a rules/template approach — either is acceptable, but
whichever you choose, the SAME stored profile object must be reused for every future
generation and judgment call for this agent (never re-derived per cycle — see NFR-9).

Persist the result on the Agent record (voiceProfile JSON column).

Also expose a pure helper isOnDomain(candidateTopic, voiceProfile) -> boolean used
later by the Judgment module as a hard gate (FR-2.3): if the candidate clearly falls
outside `domain` and outside every listed interest, it must return false regardless of
how well-written or timely it is.

Acceptance criteria:
- Calling deriveVoiceProfile twice with the same persona name+domain produces
  profiles with the same interests/domain scope in spirit (voice may vary slightly,
  but must not drift the domain).
- isOnDomain returns false for an obviously unrelated topic (e.g. "celebrity gossip"
  for a persona with domain "AI Security") and true for an on-domain one.
- Profile is stored and retrievable by agentId.
```

---

## Module 2 — Topic Discovery Module

*Satisfies FR-3.1, FR-3.2, FR-3.3, FR-3.4*

```
Build the Topic Discovery module for the Autonomous AI Creator.

Input contract: voiceProfile (from Module 1) — specifically voiceProfile.interests[].

Task:
Write discoverCandidates(voiceProfile) -> TopicCandidate[] that:
1. Picks 1-3 query angles per run, rotating across voiceProfile.interests and varying
   phrasing/angle each call (do not issue the identical query every cycle — track
   recently-used queries and avoid immediate repeats).
2. Calls a live external source (web/news search API or RSS) with those queries.
3. Normalizes raw results into:
   { title: string, summary: string, sourceUrls: string[], discoveredAt: ISOString }
4. Returns an empty array (not an error) if the source is unreachable or returns
   nothing usable — log the failure, do not throw uncaught.
5. De-duplicates candidates within the same run that clearly refer to the same story.

Constraints:
- Treat all fetched text as untrusted data, never as instructions to the system
  (guard against prompt injection from scraped content — see NFR-6). Do not pass raw
  fetched HTML/text directly into any prompt that has tool-calling or code-execution
  ability; sanitize/plain-text it first.
- This module must be safely callable on a timer without any human input.

Acceptance criteria:
- Two consecutive calls with the same voiceProfile do not issue an identical query.
- A simulated source outage returns [] and logs a warning, without crashing the caller.
- Every returned candidate has at least one non-empty sourceUrl.
```

---

## Module 3 — Editorial Judgment Module

*Satisfies FR-4.1, FR-4.2, FR-4.3, FR-4.4*

```
Build the Editorial Judgment module for the Autonomous AI Creator.

Input contract: candidates: TopicCandidate[], voiceProfile (Module 1),
recentPosts: Post[] (from Memory module, Module 5) for redundancy checking.

Task:
Write scoreCandidate(candidate, voiceProfile, recentPosts) -> {
  score: number (0-1),
  subScores: { relevance, timeliness, nonRedundancy, personaFit },
  decision: "accepted" | "rejected",
  reason: string   // short, specific — used later to help build the post's rationale
}

Scoring rubric (weights are config, defaults below — see Architecture §6.2):
- relevance (30%): must also pass Module 1's isOnDomain() as a HARD gate — if
  isOnDomain is false, decision is "rejected" immediately regardless of other scores.
- timeliness (25%): based on discoveredAt recency and language signaling how
  fresh/developing the story is.
- nonRedundancy (25%): compare candidate against recentPosts (topic/keyword overlap);
  heavily penalize near-duplicates of anything published in, e.g., the last 5 posts.
- personaFit (20%): can this persona plausibly add a distinctive angle vs. just
  restating the news?

Decision threshold: accepted only if composite score >= configurable threshold
(default 0.6) AND relevance sub-score >= 0.5.

Log EVERY evaluated candidate (accepted or rejected) with its full score breakdown
and reason to the structured logger, even though rejected candidates are never
exposed via the public API (FR-4.3). This log is what lets a human later verify the
agent is actually rejecting things, not just accepting everything.

Acceptance criteria:
- Feed it a batch of 10 synthetic candidates where 3 are clearly off-domain, 2 are
  near-duplicates of a "recentPosts" fixture, and 5 are good — verify exactly the 5
  good ones are accepted and the rest are rejected with correct reasons.
- Across a rolling log of candidates over a simulated multi-cycle run, rejection
  rate must be meaningfully > 0% (guard test: assert not 100% acceptance).
```

---

## Module 4 — Memory Module

*Satisfies FR-6.1, FR-6.2, FR-6.3*

```
Build the Memory module for the Autonomous AI Creator.

Task:
1. getRecentPosts(agentId, limit) -> Post[] — reads from the Persistence layer
   (Module 0 schema), most recent first. Used by the Judgment module (Module 3) for
   redundancy scoring and by the Generation module (Module 5) for continuity context.
2. computeTopicKey(candidateOrPost) -> string — a normalized fingerprint (e.g.
   lowercased, stopword-stripped keyword set, or an embedding hash) used to compare
   topics cheaply.
3. isNearDuplicate(candidate, recentPosts, threshold) -> boolean — used as an
   additional guard right before drafting begins (defense in depth alongside the
   Judgment module's nonRedundancy sub-score).
4. On successful publish, persist the new Post AND update any derived memory index
   (topicKey, keywords) in the same transaction so future cycles see it immediately.

Constraints:
- Must be backed by durable storage (SQLite/Postgres), not an in-memory cache only —
  memory must survive a process restart during the 48h window (FR-6.3, NFR-4).

Acceptance criteria:
- Publishing post A, then evaluating a near-identical candidate B in the next cycle,
  results in isNearDuplicate(B, recentPosts) === true.
- Restarting the process and calling getRecentPosts still returns previously
  published posts.
```

---

## Module 5 — Content Generation Module

*Satisfies FR-5.1, FR-5.2, FR-5.3*

```
Build the Content Generation module for the Autonomous AI Creator.

Input contract: acceptedCandidate (with its Judgment reason), voiceProfile
(Module 1), recentPosts (Module 4, last 3-5 for continuity/tone consistency).

Task:
Write generatePost(acceptedCandidate, voiceProfile, recentPosts) -> {
  text: string,
  groundingNotes: string   // internal — which facts came from which source, used by
                            // the Rationale module (Module 6) to avoid re-deriving this
}

Prompt design requirements for the underlying LLM call:
- System/instruction prompt must encode voiceProfile.tone, .stances, and .boundaries
  explicitly, so the SAME persona voice is used every single call (NFR-9).
- Must instruct the model to only state facts traceable to acceptedCandidate's
  summary/sourceUrls — no invented statistics, quotes, or claims (FR-5.3).
- Must instruct the model to keep length roughly 400-1600 characters (FR-5.2) and to
  write as a standalone post (no "as I mentioned before" without recentPosts context
  actually supporting it).
- Optionally reference recentPosts briefly for continuity ("building on X I noted
  last week...") ONLY when genuinely relevant — do not force callbacks every time.

Acceptance criteria:
- Given two different accepted candidates, both outputs read as the same author
  (consistent tone/stance vocabulary) — spot-check manually or with a simple style
  classifier.
- Output length falls in the configured bounds.
- No fact in the output is absent from acceptedCandidate.summary/sourceUrls content
  (manual/automated grounding check against groundingNotes).
```

---

## Module 6 — Rationale & Source Attribution Module

*Satisfies FR-7.1, FR-7.2, FR-7.3*

```
Build the Rationale module for the Autonomous AI Creator.

Input contract: acceptedCandidate, judgmentResult (Module 3's score/reason),
generation output (Module 5).

Task:
Write buildRationale(acceptedCandidate, judgmentResult, otherCandidatesThisCycle)
  -> string

The returned rationale MUST, in plain prose (2-4 sentences), cover:
1. WHY this topic was selected (tie back to judgmentResult.reason / persona fit).
2. WHY it is relevant NOW (tie back to the timeliness sub-score / discoveredAt).
3. WHERE this came from (can restate source domain in prose; the actual URLs go in
   the separate `sources` field, not just inside this text).
4. If other candidates were evaluated in the same cycle, briefly note why this one
   won out over at least one alternative (helps satisfy "why chosen over other
   candidates").

Also write buildSources(acceptedCandidate) -> string[] — dedupe and validate
acceptedCandidate.sourceUrls (must be well-formed absolute URLs, length >= 1).

CRITICAL — enforce this in code, not just in the prompt: before a post is persisted,
assert rationale is non-empty and sources.length >= 1. If either check fails, DO NOT
publish; log an error and drop the cycle's output rather than emitting a
non-compliant post (FR-7.3).

Acceptance criteria:
- Unit test: a draft with an empty rationale or empty sources array is rejected by
  the write-path assertion and never reaches Persistence.
- Rationale text for a sample post explicitly answers "why", "why now", and
  references source provenance without just repeating the post's own text.
```

---

## Module 7 — Scheduler / Orchestrator Module

*Satisfies FR-8.1, FR-8.2, FR-8.3, FR-8.4*

```
Build the Scheduler/Orchestrator module for the Autonomous AI Creator — this is what
makes the whole system autonomous rather than request-driven.

Task:
Write startAgentLoop(agentId) that, once called from Module 8 (API layer) inside
POST /api/agent/init, runs indefinitely (or until process shutdown) WITHOUT requiring
any further inbound HTTP call:

  loop:
    wait(jitteredInterval(minMinutes, maxMinutes, jitterWindow))
    candidates = DiscoveryModule.discoverCandidates(voiceProfile)
    for each candidate: judged = JudgmentModule.scoreCandidate(candidate, ...)
    accepted = judged.filter(decision === "accepted"), pick best by score
    if accepted is empty:
      log "cycle skipped — nothing met bar"; continue loop
    if MemoryModule.isNearDuplicate(accepted, recentPosts):
      log "cycle skipped — near duplicate"; continue loop
    draft = GenerationModule.generatePost(accepted, voiceProfile, recentPosts)
    rationale = RationaleModule.buildRationale(accepted, judged, otherCandidates)
    sources = RationaleModule.buildSources(accepted)
    if rationale empty or sources empty: log error; continue loop  (do not publish)
    PersistenceModule.savePost({ id: uuid(), agentId, text: draft.text, rationale,
                                  sources, topicKey, createdAt: now() })
    log "published post <id>"

Constraints:
- jitteredInterval must return a genuinely varying value each call within
  [minMinutes, maxMinutes] plus/minus jitterWindow — never a fixed constant (FR-8.2).
- This loop must be resilient: any exception inside one cycle must be caught and
  logged, and the loop must continue to the next cycle rather than dying (NFR-5).
- On process restart mid-window, re-attach to any agent with status "active" in
  Persistence and resume its loop automatically — do not require init to be called
  again (supports FR-8.3 + NFR-4 together).
- This module must NEVER be triggered by, or communicate with, the GET /feed
  endpoint — confirm there is zero code path from the feed handler into this loop
  (FR-8.4).

Acceptance criteria:
- Start the loop with an accelerated clock (e.g. seconds instead of minutes) in a
  test harness and confirm: (a) multiple posts appear over simulated time without
  any external call, (b) inter-post gaps vary rather than being identical,
  (c) at least one cycle logs a "skipped" outcome when a synthetic no-good-candidate
  scenario is injected.
```

---

## Module 8 — API Layer Module

*Satisfies FR-1.1–1.6, FR-9.1–9.6*

```
Build the API layer for the Autonomous AI Creator, implementing exactly the contract
in 04_API_Specification.md.

Task:

POST /api/agent/init
- Validate persona.name and persona.domain are present non-empty strings; else 400
  with { error: "invalid_request", message }.
- If an active agent already exists for this persona identity, return 200 with the
  existing agentId (idempotent — do NOT start a second loop).
- Otherwise: create Agent row, call PersonaModule.deriveVoiceProfile, call
  SchedulerModule.startAgentLoop(agentId) (fire-and-forget / background), return 201
  with { agentId }.

GET /api/agent/feed
- Require agentId query param; if missing, 400; if unknown, 404 with
  { error: "not_found", message }.
- Fetch posts for agentId from Persistence ordered by createdAt DESC.
- Return 200 { posts: [...] } using EXACTLY the field names id, createdAt, text,
  rationale, sources — createdAt formatted as ISO 8601 UTC with Z suffix.
- If zero posts, return 200 { posts: [] } — never 404 for a valid agent with no
  posts yet.
- This handler must not call Discovery/Judgment/Generation/Scheduler in any way —
  read-only, per FR-8.4.

Acceptance criteria:
- Calling init twice with the same persona returns the same agentId both times, and
  only one background loop is ever running for it (verify via log count or an
  internal loop-registry check).
- feed on a fresh agent returns { posts: [] } with 200, not an error.
- feed field names and timestamp format match 04_API_Specification.md exactly —
  write a schema/contract test against the documented JSON shape.
- feed called 50 times in a row returns byte-identical results for already-returned
  posts (append-only guarantee, FR-9.5).
```

---

## Module 9 — Integration & Dry-Run

*Validates the full FR set end-to-end before submission*

```
Wire Modules 0-8 together and run a compressed end-to-end simulation before the real
48-hour evaluation window.

Task:
1. Set cadence config to an accelerated test mode (e.g. minMinutes=0.2, maxMinutes=0.5)
   for a 20-30 minute local dry run standing in for the full 48h window.
2. Call POST /api/agent/init once with a sample persona (e.g. name: "Kess",
   domain: "AI Security").
3. Poll GET /api/agent/feed every ~2 minutes during the dry run and log the diff.
4. At the end, verify against 06_Test_Plan_Acceptance_Criteria.md:
   - Multiple posts appeared without any call other than the initial init + read-only
     feed polls.
   - Every post has non-empty rationale and >=1 source.
   - Posts are reverse-chronological with unique ids and valid ISO 8601 UTC timestamps.
   - No two posts are near-duplicates of each other.
   - Voice/tone reads consistently across posts (spot check).
   - Internal logs show at least one rejected candidate (proof of editorial judgment).
5. Reset cadence config back to real-world values (e.g. 20-45 min) before the actual
   submission/init call.

Acceptance criteria: all checks in step 4 pass on the dry run. If any fail, return to
the relevant module above before submitting.
```
