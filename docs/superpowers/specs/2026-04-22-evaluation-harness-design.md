# Evaluation Harness Design

**Date:** 2026-04-22
**Status:** Draft, pending review
**Thesis context:** Bachelor report evaluation of Slop Engine vs. alternative AI-assisted game-development workflows.

## Purpose

The bachelor report compares three ways of building games with AI assistance:

1. **Slop Engine** — the engine built by this thesis.
2. **Opencode + Babylon.js / HTML / JS** — a coding harness building a browser game in plain web stack.
3. **Opencode + Roblox MCP** — a coding harness driving Roblox Studio via MCP tools.

Each of three games (`dodger`, `breakout`, `platformer`) is attempted in each scenario three times, for **27 total runs**. The harness exists to execute, record, and measure these runs consistently so the report can compare them without 27 hand-managed spreadsheets.

The harness is explicitly **thesis-disposable**: it will be used for this evaluation and then retired. No production hardening, no backwards compatibility, no polish beyond "reproducible."

## Evaluation metrics (from the report methodology)

### Quantitative

- **Speed** — wall-clock seconds per iteration and per run (prompt sent → last token received).
- **Tokens** — input, output, cached, total, per iteration and per run.
- **Iterations** — count of human-initiated prompts per run (one initial + N nudges).
- **Tool calls** — count per iteration and per run.

### Qualitative (manual rubric per run)

- Movement / core mechanic works: pass/fail
- Win condition exists and triggers: pass/fail
- Lose condition exists and triggers: pass/fail
- No crashes, game is playable: pass/fail
- Failure mode (if any): `none | planning | tool | scope`
- Free-form notes

## Run model

**Hybrid**: each run starts with a fixed initial prompt (derived from the game spec and the scenario). The tester may send free-form nudges during the run; each nudge counts as an additional iteration. The tester decides when to stop. There is no timeout or token budget — nothing should kill a run early except the tester.

An **iteration** = one human-initiated prompt + all agent-side work it triggered up to the next idle state. Tool calls and LLM calls live inside iterations.

## High-level architecture

```
┌──────────────────────────────────────────────────────────┐
│ Dashboard (Solid, served by Vite at /harness)             │
│   New-run form · Live view (SSE) · History · Rubric       │
└───────────────┬──────────────────────────────────────────┘
                │ fetch + SSE
┌───────────────▼──────────────────────────────────────────┐
│ Elysia server (existing) + harness plugin                 │
│   POST /harness/runs            create run, spawn runner  │
│   GET  /harness/runs            list runs                 │
│   GET  /harness/runs/:id        run detail                │
│   GET  /harness/runs/:id/events SSE — live event stream   │
│   POST /harness/runs/:id/nudge  user nudge / card choice  │
│   POST /harness/runs/:id/stop   soft stop                 │
│   POST /harness/runs/:id/abort  hard kill                 │
│   POST /harness/runs/:id/grade  submit rubric             │
│   GET  /harness/export.csv      flat per-run CSV          │
│   GET  /harness/export-iterations.csv  per-iteration CSV  │
└───────────────┬──────────────────────────────────────────┘
                │ dispatches by scenario
┌───────────────▼──────────────────────────────────────────┐
│ ScenarioRunner (interface)                                │
│   ├─ SlopRunner            in-process, existing agents    │
│   ├─ OpencodeRunner        subprocess, LM Studio          │
│   └─ OpencodeRobloxRunner  subprocess + Roblox MCP        │
└──────────────┬───────────────────────────────────────────┘
               │ emits RunEvents to
               ▼
         runs/<run-id>/events.ndjson   (source of truth)
         runs/<run-id>/meta.json       (prompt, nudges, summary)
         runs/<run-id>/artifact/       (scene / HTML / .rbxl)
         + harness.db (SQLite: runs + iterations tables)
```

## Run lifecycle

States:

```
created → running → idle ⇄ running → ... → stopped → graded
```

- `created` — row exists, runner about to spawn.
- `running` — runner active, LLM working.
- `idle` — runner alive, agent finished its turn, awaiting input.
- `stopped` — runner terminated, artifact saved.
- `graded` — rubric submitted.

Transitions are driven by runner events and dashboard actions; the harness plugin mediates.

## Data model

### SQLite (`harness/harness.db`)

```sql
CREATE TABLE runs (
    id                   TEXT PRIMARY KEY,     -- e.g. "20260422T1430-dodger-slop-1"
    game                 TEXT NOT NULL,        -- 'dodger'|'breakout'|'platformer'
    scenario             TEXT NOT NULL,        -- 'slop'|'opencode-plain'|'opencode-roblox'
    run_number           INTEGER NOT NULL,     -- 1|2|3
    status               TEXT NOT NULL,        -- created|running|idle|stopped|graded
    created_at           INTEGER NOT NULL,     -- epoch ms
    started_at           INTEGER,
    stopped_at           INTEGER,

    total_duration_ms    INTEGER,
    total_input_tokens   INTEGER,
    total_output_tokens  INTEGER,
    total_cached_tokens  INTEGER,
    total_iterations     INTEGER,
    total_tool_calls     INTEGER,

    rubric_movement      INTEGER,              -- 0/1
    rubric_win           INTEGER,
    rubric_lose          INTEGER,
    rubric_no_crash      INTEGER,
    rubric_failure_mode  TEXT,                 -- 'none'|'planning'|'tool'|'scope'
    rubric_notes         TEXT,
    graded_at            INTEGER,

    UNIQUE(game, scenario, run_number)
);

CREATE TABLE iterations (
    run_id           TEXT NOT NULL,
    index_           INTEGER NOT NULL,         -- 0-based
    kind             TEXT NOT NULL,            -- 'initial'|'nudge'|'clarification'|'plan_approval'
    prompt_text      TEXT NOT NULL,
    started_at       INTEGER NOT NULL,
    ended_at         INTEGER,
    duration_ms      INTEGER,
    input_tokens     INTEGER,
    output_tokens    INTEGER,
    cached_tokens    INTEGER,
    tool_call_count  INTEGER,
    PRIMARY KEY (run_id, index_),
    FOREIGN KEY (run_id) REFERENCES runs(id)
);
```

The `iterations` table is denormalized from NDJSON on `iteration_ended`. It lets the report do `SELECT AVG(duration_ms), scenario FROM iterations JOIN runs USING (run_id) GROUP BY scenario` rather than scripting across 27 NDJSON files.

### NDJSON event stream (source of truth)

```ts
type RunEvent =
    | { t: number; type: 'run_started'; scenario: string; game: string }
    | { t: number; type: 'iteration_started'; index: number; kind: 'initial' | 'nudge' | 'clarification' | 'plan_approval'; prompt: string }
    | { t: number; type: 'llm_call'; iteration: number;
        inputTokens: number; outputTokens: number; cachedTokens: number;
        durationMs: number; model: string; finishReason?: string }
    | { t: number; type: 'tool_call'; iteration: number; toolName: string;
        inputPreview: string; outputPreview?: string; error?: string }
    | { t: number; type: 'text_chunk'; iteration: number; text: string }
    | { t: number; type: 'awaiting_input'; iteration: number;
        kind: 'free_text' | 'clarification_cards' | 'plan_approval';
        payload?: unknown }     // cards / plan data when kind != free_text
    | { t: number; type: 'iteration_ended'; index: number }
    | { t: number; type: 'run_stopped'; reason: 'user' | 'error'; error?: string }
```

Every event carries `t` (epoch ms) so time series are reconstructable without relying on line order alone.

### Filesystem layout

```
harness/
    harness.db
    prompts/
        dodger.json
        breakout.json
        platformer.json
    templates/
        opencode-plain/          -- copied into runs/<id>/artifact/ at run start
            index.html
            game.js
            README.md
            opencode.json
        opencode-roblox/
            opencode.json        -- MCP config for Roblox Studio
            README.md
    runs/                        -- gitignored
        <run-id>/
            events.ndjson
            meta.json            -- { game, scenario, runNumber, initialPrompt, nudges, summary }
            artifact/            -- scenario-specific output
```

### Artifact content per scenario

- **Slop** — `scene.json` (serialized EditorScene) + `scripts/*.ts`.
- **Opencode-plain** — the full templated working directory, entrypoint `artifact/index.html`.
- **Opencode-roblox** — a manually-saved `.rbxl` snapshot. The dashboard prompts the tester to save into this folder at stop time; no Studio automation.

Source of truth for metrics is always NDJSON. SQLite summaries are denormalized; a `recompute-metrics.ts` script can rebuild them.

## ScenarioRunner interface

```ts
// harness/runner/types.ts
export interface RunContext {
    runId: string
    game: 'dodger' | 'breakout' | 'platformer'
    initialPrompt: string
    artifactDir: string
    model: { baseUrl: string; modelId: string }
}

export type EmitEvent = (e: RunEvent) => void

export interface ScenarioRunner {
    start(ctx: RunContext, emit: EmitEvent): Promise<void>
    nudge(text: string, kind: 'free_text' | 'clarification_cards' | 'plan_approval', cardChoice?: string): Promise<void>
    stop(): Promise<void>     // graceful
    abort(): Promise<void>    // hard kill
}
```

The harness plugin owns one runner per active `runId`. `emit` fans out to three sinks: append to `events.ndjson`, broadcast to SSE subscribers, update SQLite on `iteration_ended`.

### SlopRunner (in-process)

Reuses the existing coordinator + agent code paths in `src/server/`. Does **not** spawn a subprocess.

Behavior:

1. Creates a fresh `EditorScene` with a deterministic starting state — whatever the engine's "new scene" default is (camera + light + ground plane, or equivalent), identical across all Slop runs.
2. Instantiates a headless session — same provider/model setup as `chat-plugin.ts`, but pointed at LM Studio. Maintains its own `messages: UIMessage[]` array.
3. Pushes the initial prompt, invokes the coordinator via the same `streamText` call the chat plugin uses, pipes tool results back through the existing multi-step loop.
4. Subscribes to a new optional `onLlmCall` / `onToolCall` callback on the agent entry points, translating each into a `RunEvent`.
5. On top-level `finishReason: 'stop'`, emits `iteration_ended` + `awaiting_input` (`kind: free_text`) and waits for `nudge()`.
6. On `stop()`, serializes the `EditorScene` to `artifact/scene.json` and copies generated scripts to `artifact/scripts/`.

**Required changes to existing code:** add optional `onLlmCall` and `onToolCall` callback parameters to the shared agent entry points. Default behavior (logging to stdout via `logAgentLlmCall`) is unchanged. The chat plugin does not pass these callbacks; only `SlopRunner` does.

#### Planning-mode handling

Slop's `ask_clarification` and `present_plan` tools remain enabled in harness runs — they are part of the scenario being measured. When the agent calls one of them, the runner:

1. Emits `awaiting_input` with `kind: 'clarification_cards'` or `'plan_approval'` and the card/plan payload.
2. The dashboard's nudge panel renders the matching UI.
3. The tester's response is sent via `nudge(text, kind, cardChoice?)`, which resolves the pending Promise in the planning store.
4. The iteration is recorded in SQLite with `kind = 'clarification'` or `'plan_approval'` rather than `'nudge'`, letting the report slice "how many iterations were planning-driven vs. free-form."

### OpencodeRunner (subprocess, pure Babylon+HTML)

Workspace: copy `harness/templates/opencode-plain/` into `ctx.artifactDir` before start. Template contains `index.html` with Babylon.js 8 loaded from CDN, an empty `game.js`, and an opencode config file (exact filename per opencode's convention, verified in the spike) pointing the provider at LM Studio's OpenAI-compatible endpoint.

Opencode is driven via one of two strategies, decided by the pre-implementation spike:

- **Primary: `opencode serve`** — start opencode in HTTP/RPC mode, create a session, POST prompts to its message endpoint, consume its event stream.
- **Fallback: `opencode run --continue`** — each iteration spawns a subprocess. First iteration uses `opencode run "<prompt>"`; nudges use `opencode run --continue "<text>"`. Opencode persists session state across calls.

Whichever is used, the runner parses opencode's JSONL output (with `--log-level debug` or the serve API's equivalent) and translates LLM-call and tool-call records into `RunEvent`s.

Idle detection: `serve` emits an explicit event; the CLI fallback treats subprocess exit as idle.

Artifact: the entire `artifactDir` is the artifact. Grading opens `artifact/index.html` in a browser.

### OpencodeRobloxRunner (subprocess + Roblox MCP)

Pre-run dashboard checklist (hard-blocks Start):

- Roblox Studio is open
- A blank baseplate place is loaded
- The Roblox MCP plugin/endpoint is active and reachable

Workspace: copy `harness/templates/opencode-roblox/`. Its `opencode.json` contains an `mcp.servers.roblox` entry pointing at Studio's MCP endpoint, so opencode exposes Roblox tools to the model.

All other mechanics (spawn, prompt, parse, idle, nudge, stop) are identical to `OpencodeRunner` — they share `harness/runner/opencode-driver.ts`.

Artifact: on `stop()`, the dashboard shows *"Save Roblox place to `<artifactDir>/place.rbxl` then click Done."* No scripting of Studio's file save. The runner proceeds to `stopped` status on tester confirmation.

## Dashboard

A Solid page mounted at `/harness` via the existing router. Uses the engine's Tailwind setup. Three primary views.

### New-run view

- Game radio (3), scenario radio (3), run-number select (1/2/3, defaults to next unused for that game+scenario tuple).
- Scenario-specific pre-flight checklist that hard-blocks Start until green.
    - All scenarios: "LM Studio reachable at `config.json.baseUrl`" (pings `/v1/models`).
    - `opencode-roblox`: Roblox Studio checklist above.
- On Submit: `POST /harness/runs`, route to live view.

### Live run view (active while `running` or `idle`)

- Header: run ID, game/scenario/run-number, elapsed clock, running totals (tokens in/out, tool calls, iterations).
- Event stream, virtualized, filterable (all | llm | tool | text).
- **Polymorphic nudge panel**, driven by the most recent `awaiting_input` event:
    - `free_text` — textarea + Send button.
    - `clarification_cards` — renders the cards from the tool payload; tester clicks one.
    - `plan_approval` — renders the plan; Approve button or Request-changes textarea.
- Footer: Stop run (soft) + Emergency abort (hard kill).

### History view

Sortable table, one row per run, columns: id, game, scenario, run, status, iters, tokens, duration, tool calls, rubric summary, actions. Clicking a row expands to show iterations list + inline rubric form for stopped runs. Filters by status (`running`, `stopped`, `graded`).

### Rubric form (inline per row)

Four pass/fail checkboxes (movement, win, lose, no-crash), one failure-mode radio (none | planning | tool | scope), free-form notes textarea, artifact links (scenario-specific — "Open index.html" / "Open in editor" / "Reveal in Explorer"), Submit Grade button.

### CSV export

- `GET /harness/export.csv` — one row per run, all summary columns flat.
- `GET /harness/export-iterations.csv` — one row per iteration, enables "tokens per iteration by scenario" charts.

## LM Studio configuration

All three runners use the same endpoint stored once in `harness/config.json`:

```json
{
    "modelEndpoint": {
        "baseUrl": "http://localhost:1234/v1",
        "modelId": "gemma-4-26b-a4b"
    }
}
```

The `modelId` matches the identifier LM Studio exposes for the loaded model; the harness does not care about the model internals, only that all three scenarios use the same endpoint.

Temperature and other sampling settings are locked to defaults across all runs to minimize uncontrolled variance. Seed is **not** fixed — three runs per (game, scenario) are intended to capture natural variance.

## Error handling

Minimal, thesis-disposable:

- Runner crash → mark run `stopped` with `reason: 'error'`, error text in NDJSON, artifact left as-is. Tester can still grade, mark as failed, or discard.
- LM Studio disconnects mid-run → treated as runner crash.
- Dashboard tab closed mid-run → server-side runner keeps going; reopening reattaches to SSE.
- Starting a duplicate `(game, scenario, run_number)` → blocked with link to existing row.

## The opencode spike

**Goal:** de-risk the single biggest uncertainty — whether opencode supports sending a second prompt into an existing session programmatically.

**Deliverable:** `harness/scripts/spike-opencode.ts`, ~30 lines, that:

1. Starts an opencode process pointed at LM Studio.
2. Sends one prompt and prints all events received.
3. Sends a second prompt in the same session and prints events.
4. Terminates cleanly.

**Strategies tested in order:**

1. `opencode serve` + HTTP/RPC session message API.
2. `opencode run --continue` session resumption.

Spike succeeds once one strategy works. Output: `harness/scripts/SPIKE-RESULTS.md` documenting the chosen approach with the exact command/request shape.

**If both fail** (low probability): fallback to one-shot-per-iteration, with explicit loss of cross-iteration memory. This limitation would be documented as a measurement caveat in the report.

## Build order

For the writing-plans phase:

1. SQLite schema, filesystem layout, event types, shared utilities. No runners yet.
2. Elysia harness plugin + SSE broadcaster + dashboard skeleton rendering fake events.
3. `SlopRunner` (reuses existing code paths, lowest risk).
4. Opencode spike.
5. `OpencodeRunner` based on spike results.
6. `OpencodeRobloxRunner` (mostly config reuse of 5).
7. Rubric form + CSV exports.
8. **Smoke test: one run per (game, scenario) — 9 runs total** before executing the real 27.

## Out of scope

- Automated gameplay verification (scripted playtest of produced games). Manual rubric is sufficient for the report.
- Multi-user concurrency on the dashboard. Single tester, single run at a time.
- Authentication, rate limiting, production deployment.
- Retries on LM Studio failures during a run. If LM Studio hiccups, the run is marked errored and retried manually.
- Persistence migrations. Schema changes during the experiment require a `recompute-metrics.ts` rerun; schema changes after data collection is complete are not supported.
- Comparison of Slop's multi-agent coordinator with/without planning tools. Planning is left on, as the thesis is measuring Slop *with* its full UX.
