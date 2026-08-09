# Product Requirements Document (PRD)
## Autonomous AI Creator

**Version:** 1.0 &nbsp;|&nbsp; **Date:** August 8, 2026 &nbsp;|&nbsp; **Status:** Draft for Build

---

## 1. Purpose

Build an autonomous software agent that, once initialized with a persona identity, independently discovers AI/technology topics, decides which ones are worth writing about, generates on-brand posts with transparent publishing rationale, remembers its own publishing history, and continues producing new posts over roughly 48 hours **without any further human or evaluator input** beyond periodic read-only polling of a feed endpoint.

## 2. Background / Problem Statement

Most "AI content generation" today is reactive: a human supplies a prompt, and the model produces text. That is writing assistance, not autonomy. This project inverts that relationship — the human provides an identity once, and the system takes over the entire editorial loop: sourcing, judgment, drafting, and pacing.

The deliverable is judged as a live system, not a one-shot demo: evaluators will initialize the agent once and then only *observe* it via a read-only feed endpoint for ~48 hours, expecting to see new, sourced, on-voice posts appear on their own.

## 3. Goals & Objectives

| Goal | Description |
|---|---|
| G1 — True autonomy | Zero additional prompts/API calls drive content generation after `init`. All decisions (what to cover, whether to publish, when to publish) are made internally by the agent. |
| G2 — Editorial credibility | The agent must visibly *reject* topics, not publish everything it finds, to demonstrate judgment rather than a pass-through summarizer. |
| G3 — Persona consistency | Voice, stance, and interest area must stay recognizable and on-topic (AI/tech only) across every post. |
| G4 — Grounded transparency | Every post discloses why it was chosen, why it's timely, and where the information came from. |
| G5 — Temporal realism | Posts appear spread across the observation window, not all at t=0 or on a rigid fixed interval. |
| G6 — Continuity | The agent avoids repeating itself and can reference/build on its own history where relevant. |

## 4. Non-Goals (Out of Scope)

Per the challenge brief, the following are explicitly **not required**:

- Posting to real social platforms (LinkedIn, X, etc.) — simulated publishing is sufficient.
- Multi-platform publishing.
- Images, video, or other rich media.
- Engagement analytics (likes, comments, impressions).
- Multi-agent architectures (no orchestration between multiple personas).
- Any human-in-the-loop step after initialization.

## 5. Target Users / Stakeholders

| Stakeholder | Interest |
|---|---|
| Evaluator/Judge | Calls `init` once, polls `feed` repeatedly over 48h; needs to trust the feed reflects genuine autonomous decisions |
| Project builder/engineer | Needs an unambiguous spec to implement against |
| (Hypothetical) end reader of the persona's feed | Would consume this as a real AI/tech commentator's feed |

## 6. User Stories

- **As an evaluator**, I want to call `init` exactly once with a persona name and domain, so that the agent begins operating under that identity.
- **As an evaluator**, I want to call `feed` at any time and get whatever has been published so far, so I can observe progress without influencing it.
- **As an evaluator**, I want each post to explain *why* it exists, so I can judge editorial quality rather than just prose quality.
- **As an evaluator**, I want to see topics implicitly or explicitly rejected, so I can tell the agent isn't just publishing everything it sees.
- **As an evaluator**, I want the persona's voice and interests to feel stable across posts, so it reads as one coherent author rather than disconnected generations.
- **As the agent (system perspective)**, I need to remember what I've already published so I don't repeat myself or contradict an earlier stance.

## 7. Features & Requirements Summary (MoSCoW)

**Must Have**
- `POST /api/agent/init` — one-time persona initialization, returns `agentId`.
- `GET /api/agent/feed` — read-only, idempotent, cumulative, reverse-chronological feed.
- Autonomous topic discovery from a live source (web search / news / RSS).
- Editorial accept/reject judgment logic with a defined rubric.
- Persona-consistent generation (voice, stance, domain focus).
- Persistent memory of prior posts (dedup, continuity).
- Time-distributed autonomous publishing loop running independently of API calls.
- `rationale` (selection + timeliness + comparison to alternatives) and `sources[]` on every post.

**Should Have**
- Bounded randomized cadence (not perfectly periodic) to feel organic.
- Lightweight internal log of rejected topics (even if not exposed via API) for post-hoc explainability/debugging.
- Graceful handling of source-fetch failures (skip cycle, don't crash).

**Could Have**
- Light topical "arcs" — the persona occasionally references or follows up on its own earlier posts.
- Configurable publishing-rate parameter at init time (with a sane default).

**Won't Have (this cycle)**
- Real platform posting, analytics, multi-agent coordination, media generation.

## 8. Success Metrics (mapped to evaluation criteria)

| Evaluation Criterion | How the product satisfies it |
|---|---|
| Autonomous operation after initialization | Internal scheduler loop runs independent of inbound requests; `feed` is strictly read-only |
| Quality of editorial decision-making | Explicit scoring rubric with a visible accept threshold; rationale documents why alternatives lost out |
| Consistency of the AI persona | Persona profile (voice rules, stance, taboo topics) is loaded once and referenced by every generation call |
| Effective use of memory | Every candidate topic is checked against a persisted store of prior posts before drafting |
| Transparency of publishing rationale | `rationale` + `sources[]` required fields on every post, enforced at write-time |
| Overall quality & coherence of feed | End-to-end test plan (see Doc 06) validates voice, ordering, timestamps, and non-repetition across the full window |

## 9. Assumptions & Constraints

- The evaluator may call `feed` at any cadence; the API must be cheap, fast, and stateless-read (no side effects).
- The 48-hour window means the process (or its persisted state) must survive restarts — state cannot live only in memory.
- No additional credentials/config will be supplied after `init`; any external API keys (search, LLM) must be provisioned ahead of time.
- Only one persona/agent needs to run per submission (single-tenant is acceptable; the schema should not preclude multi-tenant later).

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Live source (web search) rate-limited or down mid-window | Cache last-known-good topics; degrade to a secondary source list; skip cycle rather than fail loudly |
| Agent publishes too fast (dumps everything at init) or too slow (nothing shows for hours) | Enforce min/max inter-post spacing with jitter in the scheduler (see Architecture doc §6) |
| Persona drifts off AI/tech topics | Domain-relevance is a hard gate in the editorial scorer, not just a prompt instruction |
| Duplicate/near-duplicate posts | Memory module performs a similarity check (keyword + embedding) before drafting begins |
| `init` called more than once by mistake | Endpoint is idempotent per persona key; returns existing `agentId` rather than spawning a second agent |

## 11. Timeline / Milestones

| Phase | Target |
|---|---|
| Requirements & design sign-off (this package) | Day 0 |
| Core modules built (discovery, judgment, generation, memory) | Day 0–1 |
| API + scheduler wired end-to-end | Day 1 |
| Dry run: 2-hour local simulation of the 48h loop (accelerated clock) | Day 1 |
| Submission / `init` called by evaluator | Day 2 |
| Passive monitoring during 48h evaluation window | Day 2–4 |

## 12. Open Questions

- Should rejected topics be visible anywhere (even outside the required API) for judge transparency, or kept purely internal? *(Current default: internal log only, not exposed via `feed`.)*
- Is a configurable posts-per-day parameter desired at `init`, or should cadence be fully agent-determined? *(Current default: agent-determined, bounded.)*
