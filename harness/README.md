# Slop Engine Evaluation Harness

Thesis-disposable tool for running the 3x3x3 evaluation matrix described in
[`../docs/superpowers/specs/2026-04-22-evaluation-harness-design.md`](../docs/superpowers/specs/2026-04-22-evaluation-harness-design.md).

## Layout

    harness/
      config.json              LM Studio endpoint, model id
      harness.db               SQLite (gitignored)
      types.ts                 Shared event schema
      paths.ts                 Filesystem layout helpers
      plugin/                  Server-side: db, ndjson, sse, routes
      runner/                  ScenarioRunner implementations
      dashboard/               Solid UI mounted at /harness
      prompts/                 Per-game initial prompt specs
      templates/               Per-scenario workspace scaffolds
      runs/                    Gitignored; one dir per run
      scripts/                 One-off utilities (spike, recompute)

## Dashboard

Open http://localhost:3000/harness while `bun run dev` and `bun run server` are
both running.

## Prerequisites

- LM Studio running at the endpoint in `config.json`, with the specified model
  loaded and serving.
- For the `opencode-roblox` scenario: Roblox Studio open with a blank baseplate
  and the Roblox MCP plugin active.
