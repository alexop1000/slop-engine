import { Elysia } from 'elysia'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

import {
    buildInitialPrompt,
    ensureRunDir,
    generateRunId,
    metaPath,
    artifactDir,
    runDir,
} from '../paths'
import type {
    AwaitingInputKind,
    FailureMode,
    GameId,
    RunMeta,
    ScenarioId,
} from '../types'
import {
    deleteRun,
    findRun,
    getRun,
    insertRun,
    listIterations,
    listRuns,
    submitRubric,
    setRunStatus,
} from './db'
import { createRunner } from './dispatch'
import { handleEvent } from './event-handler'
import { loadConfig } from '../paths'
import { readEvents } from './ndjson'
import {
    dropRunner,
    getRunner,
    registerRunner,
} from './runner-registry'
import { dropRunState, endIteration } from './slop-instrument'
import { formatSse, subscribe } from './sse'

const GAME_IDS: GameId[] = ['dodger', 'breakout', 'platformer']
const SCENARIO_IDS: ScenarioId[] = ['slop', 'opencode-plain', 'opencode-roblox']
const AWAITING_KINDS: AwaitingInputKind[] = [
    'free_text',
    'clarification_cards',
    'plan_approval',
]
const FAILURE_MODES: FailureMode[] = ['none', 'planning', 'tool', 'scope']

function validateOrThrow<T extends string>(
    value: unknown,
    allowed: readonly T[],
    label: string
): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
        throw new Error(`Invalid ${label}: ${String(value)}`)
    }
    return value as T
}

function csvCell(value: unknown): string {
    if (value === null || value === undefined) return ''
    const s = String(value)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replaceAll('"', '""')}"`
    }
    return s
}

export const harnessRoutes = new Elysia({ prefix: '/harness' })
    .get('/config', () => loadConfig())
    .get('/runs', () => ({ runs: listRuns() }))
    .post('/runs', async ({ body, set }) => {
        const payload = body as {
            game?: string
            scenario?: string
            runNumber?: number
        }
        try {
            const game = validateOrThrow(payload.game, GAME_IDS, 'game')
            const scenario = validateOrThrow(
                payload.scenario,
                SCENARIO_IDS,
                'scenario'
            )
            const runNumber = Number(payload.runNumber)
            if (!Number.isInteger(runNumber) || runNumber < 1) {
                throw new Error('runNumber must be a positive integer')
            }
            const existing = findRun(game, scenario, runNumber)
            if (existing) {
                set.status = 409
                return {
                    error: 'duplicate',
                    existingRunId: existing.id,
                }
            }

            const runId = generateRunId(game, scenario, runNumber)
            const createdAt = Date.now()
            const initialPrompt = buildInitialPrompt(game, scenario)

            ensureRunDir(runId)
            insertRun({ id: runId, game, scenario, runNumber, createdAt })

            const meta: RunMeta = {
                runId,
                game,
                scenario,
                runNumber,
                initialPrompt,
                nudges: [],
                createdAt,
            }
            writeFileSync(metaPath(runId), JSON.stringify(meta, null, 2))

            // All scenarios emit run_started here; the runner (if any) does not.
            handleEvent(runId, {
                t: Date.now(),
                type: 'run_started',
                scenario,
                game,
            })

            if (scenario === 'slop') {
                // Slop runs live in the editor tab; no server-side runner. The
                // dashboard opens /?harnessRunId=<id> and the editor drives
                // /api/chat with harnessRunId fields that flow into slop-instrument.
                return {
                    runId,
                    initialPrompt,
                    editorUrl: `/?harnessRunId=${encodeURIComponent(runId)}`,
                }
            }

            const runner = createRunner(scenario)
            registerRunner(runId, runner)
            const config = loadConfig()
            runner
                .start(
                    {
                        runId,
                        game,
                        scenario,
                        initialPrompt,
                        artifactDir: artifactDir(runId),
                        config,
                    },
                    (event) => handleEvent(runId, event)
                )
                .catch((e) => {
                    handleEvent(runId, {
                        t: Date.now(),
                        type: 'run_stopped',
                        reason: 'error',
                        error: e instanceof Error ? e.message : String(e),
                    })
                    dropRunner(runId)
                })

            return { runId, initialPrompt }
        } catch (e) {
            set.status = 400
            return { error: e instanceof Error ? e.message : String(e) }
        }
    })
    .get('/runs/:id', ({ params, set }) => {
        const run = getRun(params.id)
        if (!run) {
            set.status = 404
            return { error: 'not found' }
        }
        return { run, iterations: listIterations(params.id) }
    })
    .get('/runs/:id/history', async ({ params, set }) => {
        const run = getRun(params.id)
        if (!run) {
            set.status = 404
            return { error: 'not found' }
        }
        const events = await readEvents(params.id)
        return { events }
    })
    .get('/runs/:id/meta', ({ params, set }) => {
        const run = getRun(params.id)
        if (!run) {
            set.status = 404
            return { error: 'not found' }
        }
        const path = metaPath(params.id)
        if (!existsSync(path)) {
            set.status = 404
            return { error: 'meta missing' }
        }
        return JSON.parse(readFileSync(path, 'utf-8')) as RunMeta
    })
    .get('/runs/:id/events', ({ params, set }) => {
        if (!getRun(params.id)) {
            set.status = 404
            return { error: 'not found' }
        }
        const stream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder()
                let closed = false
                const send = (chunk: string): boolean => {
                    if (closed) return false
                    try {
                        controller.enqueue(encoder.encode(chunk))
                        return true
                    } catch {
                        closed = true
                        return false
                    }
                }
                send(`: connected ${Date.now()}\n\n`)
                const unsubscribe = subscribe(params.id, (event) => {
                    send(formatSse(event))
                })
                // Keep-alive must be well under Bun.serve's idleTimeout (we set
                // it to 255s server-side, but a 5s heartbeat is cheap and
                // makes reconnects immediate if a client disconnects).
                const keepAlive = setInterval(() => {
                    if (!send(`: ping ${Date.now()}\n\n`)) {
                        clearInterval(keepAlive)
                        unsubscribe()
                    }
                }, 5000)
                const teardown = () => {
                    closed = true
                    clearInterval(keepAlive)
                    unsubscribe()
                    try {
                        controller.close()
                    } catch {
                        // already closed
                    }
                }
                ;(
                    controller as unknown as { _teardown?: () => void }
                )._teardown = teardown
            },
            cancel() {
                const t = (this as unknown as { _teardown?: () => void })
                    ._teardown
                if (t) t()
            },
        })
        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache, no-transform',
                Connection: 'keep-alive',
            },
        })
    })
    .post('/runs/:id/nudge', async ({ params, body, set }) => {
        const runner = getRunner(params.id)
        if (!runner) {
            set.status = 404
            return { error: 'no active runner' }
        }
        const payload = body as {
            text?: string
            kind?: string
            cardChoice?: string
        }
        try {
            const kind = validateOrThrow(payload.kind, AWAITING_KINDS, 'kind')
            const text = String(payload.text ?? '')
            await runner.nudge({
                text,
                kind,
                cardChoice: payload.cardChoice,
            })
            return { ok: true }
        } catch (e) {
            set.status = 400
            return { error: e instanceof Error ? e.message : String(e) }
        }
    })
    .post('/runs/:id/stop', async ({ params, set }) => {
        const run = getRun(params.id)
        if (!run) {
            set.status = 404
            return { error: 'not found' }
        }
        const runner = getRunner(params.id)
        if (runner) {
            await runner.stop()
            dropRunner(params.id)
        } else {
            endIteration(params.id)
            handleEvent(params.id, {
                t: Date.now(),
                type: 'run_stopped',
                reason: 'user',
            })
            dropRunState(params.id)
        }
        return { ok: true }
    })
    .post('/runs/:id/abort', async ({ params, set }) => {
        const run = getRun(params.id)
        if (!run) {
            set.status = 404
            return { error: 'not found' }
        }
        const runner = getRunner(params.id)
        if (runner) {
            await runner.abort()
            dropRunner(params.id)
        } else {
            endIteration(params.id)
            handleEvent(params.id, {
                t: Date.now(),
                type: 'run_stopped',
                reason: 'error',
                error: 'aborted',
            })
            dropRunState(params.id)
        }
        return { ok: true }
    })
    .delete('/runs/:id', ({ params, set }) => {
        const run = getRun(params.id)
        if (!run) {
            set.status = 404
            return { error: 'not found' }
        }
        // If there's still an active runner, kick it so it doesn't keep writing.
        const runner = getRunner(params.id)
        if (runner) {
            runner.abort().catch(() => {
                /* ignore */
            })
            dropRunner(params.id)
        }
        dropRunState(params.id)
        deleteRun(params.id)
        try {
            rmSync(runDir(params.id), { recursive: true, force: true })
        } catch {
            // Filesystem may already be gone. The DB delete is the source of
            // truth for the UI; leftover files on disk are harmless.
        }
        return { ok: true }
    })
    .post('/runs/:id/grade', ({ params, body, set }) => {
        const run = getRun(params.id)
        if (!run) {
            set.status = 404
            return { error: 'not found' }
        }
        const payload = body as {
            movement?: number
            win?: number
            lose?: number
            noCrash?: number
            failureMode?: string
            notes?: string
        }
        try {
            const failureMode = validateOrThrow(
                payload.failureMode,
                FAILURE_MODES,
                'failureMode'
            )
            submitRubric(
                params.id,
                {
                    movement: payload.movement ? 1 : 0,
                    win: payload.win ? 1 : 0,
                    lose: payload.lose ? 1 : 0,
                    noCrash: payload.noCrash ? 1 : 0,
                    failureMode,
                    notes: String(payload.notes ?? ''),
                },
                Date.now()
            )
            return { ok: true }
        } catch (e) {
            set.status = 400
            return { error: e instanceof Error ? e.message : String(e) }
        }
    })
    .get('/export.csv', () => {
        const runs = listRuns()
        const cols: Array<keyof (typeof runs)[number]> = [
            'id',
            'game',
            'scenario',
            'run_number',
            'status',
            'created_at',
            'started_at',
            'stopped_at',
            'total_duration_ms',
            'total_input_tokens',
            'total_output_tokens',
            'total_cached_tokens',
            'total_iterations',
            'total_tool_calls',
            'rubric_movement',
            'rubric_win',
            'rubric_lose',
            'rubric_no_crash',
            'rubric_failure_mode',
            'rubric_notes',
            'graded_at',
        ]
        const csv = [cols.join(',')]
        for (const r of runs) {
            csv.push(cols.map((c) => csvCell(r[c])).join(','))
        }
        return new Response(csv.join('\n'), {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': 'attachment; filename="runs.csv"',
            },
        })
    })
    .get('/export-iterations.csv', () => {
        const runs = listRuns()
        const cols = [
            'run_id',
            'game',
            'scenario',
            'run_number',
            'iteration_index',
            'iteration_kind',
            'prompt_text',
            'duration_ms',
            'input_tokens',
            'output_tokens',
            'cached_tokens',
            'tool_call_count',
        ]
        const csv = [cols.join(',')]
        for (const run of runs) {
            for (const it of listIterations(run.id)) {
                csv.push(
                    [
                        run.id,
                        run.game,
                        run.scenario,
                        run.run_number,
                        it.index_,
                        it.kind,
                        it.prompt_text,
                        it.duration_ms,
                        it.input_tokens,
                        it.output_tokens,
                        it.cached_tokens,
                        it.tool_call_count,
                    ]
                        .map(csvCell)
                        .join(',')
                )
            }
        }
        return new Response(csv.join('\n'), {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition':
                    'attachment; filename="iterations.csv"',
            },
        })
    })
    .get('/provider-status', async () => {
        let config
        try {
            config = loadConfig()
        } catch (e) {
            return {
                reachable: false,
                provider: 'unknown',
                error: e instanceof Error ? e.message : String(e),
            }
        }
        if (config.provider === 'lmstudio' && config.lmstudio) {
            try {
                const res = await fetch(
                    `${config.lmstudio.baseUrl}/models`,
                    { method: 'GET' }
                )
                return {
                    reachable: res.ok,
                    provider: 'lmstudio',
                    detail: `LM Studio ${config.lmstudio.modelId}`,
                }
            } catch (e) {
                return {
                    reachable: false,
                    provider: 'lmstudio',
                    error: e instanceof Error ? e.message : String(e),
                }
            }
        }
        if (config.provider === 'azure' && config.azure) {
            // We don't probe Azure (would spend a request). We just confirm
            // credentials are non-empty; a bad key will surface on the first
            // real LLM call.
            return {
                reachable: true,
                provider: 'azure',
                detail: `Azure · ${config.azure.deployment}`,
            }
        }
        return {
            reachable: false,
            provider: config.provider,
            error: 'provider not configured',
        }
    })
