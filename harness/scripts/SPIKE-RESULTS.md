# Opencode spike — results

**Run with:** `bun harness/scripts/spike-opencode.ts`
(requires LM Studio running with the configured model loaded)

## Strategy chosen: `opencode run --session <id>`

Opencode v1.14.20 exposes everything we need via the CLI:

- `opencode run --format json [prompt]` — one-shot run with NDJSON event output
  on stdout. Each line is a `{ type, timestamp, sessionID, … }` event.
- `opencode run --session <id> [prompt]` — continue an existing session.
- `opencode run --continue [prompt]` — continue the last session (less
  deterministic than explicit `--session`; we use `--session` instead).

The session ID is emitted in the first event (`type: "session.created"` or
similar) and can be captured from stdout. No RPC server required; no long-lived
child process required.

## Why not `opencode serve`

`opencode serve` runs a headless HTTP server that exposes a richer API
including streaming events. It would give us push-based live events — but for
27 runs of thesis-disposable evaluation, one-shot-per-turn is simpler, more
reproducible, and has the same observable metrics.

If `opencode run --session` proves unreliable under LM Studio during real runs,
the fallback is `opencode serve` + the attach API (`opencode attach` /
`--attach <url>`). That path is *not* wired into OpencodeRunner today.

## Event shape (partial)

Observed top-level keys: `type`, `timestamp`, `sessionID`, plus type-specific
fields. Types observed during a brief probe include `error` (when a provider
misconfiguration occurs). A full enumeration is pending a green LM Studio run.

OpencodeRunner parses only the events that map to our metrics:

- `session.created` / first event with `sessionID` → capture session id
- events containing usage/token fields → emit `llm_call`
- events indicating tool invocations → emit `tool_call`

Unknown event types are logged and ignored.

## What the runner does per iteration

1. Assemble the prompt for this iteration (initial prompt + scenario prefix, or
   nudge text).
2. Spawn `opencode run --format json [--session <id>] --model
   lmstudio/<modelId> "<prompt>"` in the run's artifact directory.
3. Stream stdout, parse per-line JSON into RunEvents.
4. Wait for process exit → emit `iteration_ended` + `awaiting_input`.
5. Capture session id from the first iteration for reuse on subsequent turns.
