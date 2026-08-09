# Autonomous AI Creator — Requirements & Build Package

This package contains the full requirements and build documentation for the **Autonomous AI Creator** challenge: an AI persona agent that discovers topics, exercises editorial judgment, writes in a consistent voice, remembers what it has published, and keeps publishing on its own for ~48 hours after a single initialization call.

> **Sync Status**: Automated real-time repository synchronization active (pushing to https://github.com/ianuj-yadav/Ai-Autonomous-Creator.git every 10 seconds).

## Reading order

| # | Document | Purpose |
|---|----------|---------|
| 1 | `01_PRD.md` | Product Requirements Document — why we're building this, for whom, and what "done" looks like |
| 2 | `02_SRS.md` | Software Requirements Specification — formal functional & non-functional requirements |
| 3 | `03_Architecture_HLD.md` | High-Level Design — components, data flow, schema, scheduling model |
| 4 | `04_API_Specification.md` | Full request/response contract for the two required endpoints |
| 5 | `05_Module_Prompts.md` | Ready-to-use build prompts — one per module — to hand to a coding agent (e.g. Claude Code) to implement the system module by module |
| 6 | `06_Test_Plan_Acceptance_Criteria.md` | Test cases and acceptance criteria mapped directly to the evaluation rubric |

## How to use this package

1. Read `01_PRD.md` and `02_SRS.md` to lock scope and requirements.
2. Use `03_Architecture_HLD.md` as the technical blueprint.
3. Feed each prompt in `05_Module_Prompts.md` to a coding agent, **in order**, one module at a time — each prompt is self-contained and references the SRS requirement IDs it satisfies.
4. Validate the build against `06_Test_Plan_Acceptance_Criteria.md` before the evaluation window opens.

## Key assumptions baked into these docs

- Persona identity (`name`, `domain`) is supplied at `POST /api/agent/init` and is **not** hardcoded — the agent must generalize to any AI/tech persona.
- "Live information source" is satisfied via web search / RSS, not a static seed list, so topic discovery stays genuinely current.
- Publishing cadence is randomized within a bounded range (not a fixed timer) so behavior reads as agentic rather than a cron job.
- All storage is assumed persistent across the 48-hour window (survives process restarts) — see NFR-4 in the SRS.
- Simulated publishing only; no real social platform integration is required or attempted.

Where a decision was genuinely open (tech stack, DB choice, LLM provider), the docs state a recommended default and call it out explicitly so it can be swapped without re-deriving requirements.
