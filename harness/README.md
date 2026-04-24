# Slop Engine Evaluation Harness

Thesis-disposable tool for running the 3x3x3 evaluation matrix described in
[`../docs/superpowers/specs/2026-04-22-evaluation-harness-design.md`](../docs/superpowers/specs/2026-04-22-evaluation-harness-design.md).

## Layout

    harness/                    (in the engine repo)
      config.json               Provider + model config, plus runsDir override
      harness.db                SQLite index (gitignored)
      types.ts                  Shared event schema
      paths.ts                  Filesystem layout helpers
      plugin/                   Server-side: db, ndjson, sse, routes
      runner/                   ScenarioRunner implementations
      prompts/                  Per-game initial prompt specs
      templates/                Per-scenario workspace scaffolds
      scripts/                  Utilities (spike, recompute)

    <homedir>/.slop-harness/runs/<run-id>/   (OUTSIDE the repo by default)
      events.ndjson             Source-of-truth event log
      meta.json                 Run metadata + initial prompt
      opencode-raw.ndjson       Raw opencode stdout dump (debug)
      artifact/                 Scenario workspace
        .git/                   Stub marker so opencode doesn't walk further up
        index.html, game.js     (opencode-plain)
        …

The runs directory MUST live outside the slop-engine repo. Opencode resolves
its project root by walking parent directories for a git checkout; if the run
dir is inside this repo, opencode will mount the whole engine as its
workspace and the agent will happily edit src/ files. The runner's
`ensureRunDir` also drops a zero-commit `.git` inside each artifact directory
as a belt-and-suspenders boundary.

## Dashboard

Open http://localhost:3000/harness while `bun run dev` and `bun run server` are
both running.

## Prerequisites

- LM Studio running at the endpoint in `config.json`, with the specified model
  loaded and serving.
- For the `opencode-roblox` scenario: Roblox Studio open with a blank baseplate
  and the Roblox MCP plugin active.
