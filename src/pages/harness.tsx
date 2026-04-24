import {
    createEffect,
    createResource,
    createSignal,
    For,
    onCleanup,
    onMount,
    Show,
    Switch,
    Match,
    type Component,
} from 'solid-js'

type GameId = 'dodger' | 'breakout' | 'platformer'
type ScenarioId = 'slop' | 'opencode-plain' | 'opencode-roblox'
type IterationKind = 'initial' | 'nudge' | 'clarification' | 'plan_approval'
type AwaitingInputKind = 'free_text' | 'clarification_cards' | 'plan_approval'

type RunStatus = 'created' | 'running' | 'idle' | 'stopped' | 'graded'

interface RunRow {
    id: string
    game: GameId
    scenario: ScenarioId
    run_number: number
    status: RunStatus
    created_at: number
    stopped_at: number | null
    total_duration_ms: number | null
    total_input_tokens: number | null
    total_output_tokens: number | null
    total_iterations: number | null
    total_tool_calls: number | null
    rubric_movement: number | null
    rubric_win: number | null
    rubric_lose: number | null
    rubric_no_crash: number | null
}

type RunEvent =
    | { t: number; type: 'run_started'; scenario: ScenarioId; game: GameId }
    | { t: number; type: 'iteration_started'; index: number; kind: IterationKind; prompt: string }
    | { t: number; type: 'llm_call'; iteration: number; inputTokens: number; outputTokens: number; cachedTokens: number; durationMs: number; model: string; finishReason?: string }
    | { t: number; type: 'tool_call'; iteration: number; toolName: string; inputPreview: string; outputPreview?: string; error?: string }
    | { t: number; type: 'text_chunk'; iteration: number; text: string }
    | { t: number; type: 'awaiting_input'; iteration: number; kind: AwaitingInputKind; payload?: unknown }
    | { t: number; type: 'iteration_ended'; index: number }
    | { t: number; type: 'run_stopped'; reason: 'user' | 'error'; error?: string }

const GAMES: GameId[] = ['dodger', 'breakout', 'platformer']
const SCENARIOS: ScenarioId[] = ['slop', 'opencode-plain', 'opencode-roblox']

async function api<T>(
    path: string,
    init?: { method?: string; body?: unknown }
): Promise<T> {
    const opts: RequestInit = {
        method: init?.method ?? 'GET',
        headers:
            init?.body !== undefined
                ? { 'Content-Type': 'application/json' }
                : undefined,
        body:
            init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    }
    const res = await fetch(`/api/harness${path}`, opts)
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`${res.status} ${text}`)
    }
    return res.json() as Promise<T>
}

function fmtMs(ms: number | null | undefined): string {
    if (!ms) return '—'
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

const ProviderStatus: Component = () => {
    const [state, setState] = createSignal<'checking' | 'ok' | 'down'>(
        'checking'
    )
    const [detail, setDetail] = createSignal<string>('')
    const refresh = async () => {
        setState('checking')
        try {
            const r = await api<{
                reachable: boolean
                provider?: string
                detail?: string
                error?: string
            }>('/provider-status')
            setState(r.reachable ? 'ok' : 'down')
            setDetail(r.detail ?? r.error ?? r.provider ?? '')
        } catch (e) {
            setState('down')
            setDetail(e instanceof Error ? e.message : String(e))
        }
    }
    onMount(() => {
        refresh()
        const timer = setInterval(refresh, 30000)
        onCleanup(() => clearInterval(timer))
    })
    return (
        <button
            class="text-xs px-2 py-1 rounded border border-gray-700 hover:bg-gray-800"
            onClick={refresh}
            title={detail() || 'click to recheck'}
        >
            provider:{' '}
            <span
                class={
                    state() === 'ok'
                        ? 'text-green-400'
                        : state() === 'down'
                        ? 'text-red-400'
                        : 'text-yellow-400'
                }
            >
                {state() === 'ok' ? detail() || 'ok' : state()}
            </span>
        </button>
    )
}

const NewRunForm: Component<{ onStarted: (runId: string) => void }> = (
    props
) => {
    const [game, setGame] = createSignal<GameId>('dodger')
    const [scenario, setScenario] = createSignal<ScenarioId>('slop')
    const [runNumber, setRunNumber] = createSignal(1)
    const [runNumberTouched, setRunNumberTouched] = createSignal(false)
    const [error, setError] = createSignal<string | null>(null)
    const [submitting, setSubmitting] = createSignal(false)

    const [runsResource, { refetch: refetchRuns }] = createResource(() =>
        api<{ runs: RunRow[] }>('/runs')
    )
    onMount(() => {
        const timer = setInterval(() => refetchRuns(), 5000)
        onCleanup(() => clearInterval(timer))
    })

    const usedSlots = (): Set<number> => {
        const set = new Set<number>()
        for (const r of runsResource()?.runs ?? []) {
            if (r.game === game() && r.scenario === scenario()) {
                set.add(r.run_number)
            }
        }
        return set
    }

    const nextUnusedSlot = (): number | null => {
        const used = usedSlots()
        for (const n of [1, 2, 3]) if (!used.has(n)) return n
        return null
    }

    // Auto-pick an unused run number when game/scenario changes, unless the
    // user explicitly picked one.
    createEffect(() => {
        game()
        scenario()
        if (runNumberTouched()) return
        const next = nextUnusedSlot()
        if (next !== null) setRunNumber(next)
    })

    const pickRunNumber = (n: number) => {
        setRunNumber(n)
        setRunNumberTouched(true)
    }

    const selectedIsUsed = () => usedSlots().has(runNumber())

    const submit = async () => {
        setError(null)
        setSubmitting(true)
        try {
            const result = await api<{
                runId: string
                editorUrl?: string
            }>('/runs', {
                method: 'POST',
                body: {
                    game: game(),
                    scenario: scenario(),
                    runNumber: runNumber(),
                },
            })
            if (result.editorUrl) {
                globalThis.open(result.editorUrl, '_blank')
            }
            props.onStarted(result.runId)
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
            refetchRuns()
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div class="flex-1 overflow-auto p-6">
            <div class="max-w-2xl mx-auto space-y-6">
                <section>
                    <h2 class="text-sm uppercase tracking-wide text-gray-500 mb-2">
                        Game
                    </h2>
                    <div class="flex gap-2">
                        <For each={GAMES}>
                            {(g) => (
                                <button
                                    class={`px-3 py-2 rounded border ${
                                        game() === g
                                            ? 'bg-blue-600 border-blue-500 text-white'
                                            : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                                    }`}
                                    onClick={() => setGame(g)}
                                >
                                    {g}
                                </button>
                            )}
                        </For>
                    </div>
                </section>

                <section>
                    <h2 class="text-sm uppercase tracking-wide text-gray-500 mb-2">
                        Scenario
                    </h2>
                    <div class="flex gap-2">
                        <For each={SCENARIOS}>
                            {(s) => (
                                <button
                                    class={`px-3 py-2 rounded border ${
                                        scenario() === s
                                            ? 'bg-blue-600 border-blue-500 text-white'
                                            : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                                    }`}
                                    onClick={() => setScenario(s)}
                                >
                                    {s}
                                </button>
                            )}
                        </For>
                    </div>
                </section>

                <section>
                    <h2 class="text-sm uppercase tracking-wide text-gray-500 mb-2">
                        Run number
                    </h2>
                    <div class="flex gap-2">
                        <For each={[1, 2, 3]}>
                            {(n) => {
                                const used = () => usedSlots().has(n)
                                return (
                                    <button
                                        class={`w-12 h-12 rounded border relative ${
                                            runNumber() === n
                                                ? 'bg-blue-600 border-blue-500 text-white'
                                                : used()
                                                ? 'bg-gray-900 border-gray-800 text-gray-500 hover:bg-gray-800'
                                                : 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                                        }`}
                                        onClick={() => pickRunNumber(n)}
                                        title={
                                            used()
                                                ? 'slot already used'
                                                : 'free'
                                        }
                                    >
                                        <span>{n}</span>
                                        <Show when={used()}>
                                            <span class="absolute -top-1 -right-1 text-[10px] text-gray-400">
                                                ✓
                                            </span>
                                        </Show>
                                    </button>
                                )
                            }}
                        </For>
                        <Show when={selectedIsUsed()}>
                            <span class="self-center text-xs text-yellow-300">
                                slot already used — starting will fail
                            </span>
                        </Show>
                    </div>
                </section>

                <Show when={scenario() === 'opencode-roblox'}>
                    <section class="text-xs bg-yellow-900/30 border border-yellow-700 rounded p-3">
                        <p class="text-yellow-200 font-semibold mb-1">
                            Roblox checklist
                        </p>
                        <ul class="list-disc list-inside text-yellow-100/80 space-y-0.5">
                            <li>Roblox Studio is open</li>
                            <li>A blank baseplate place is loaded</li>
                            <li>The Roblox MCP plugin is active</li>
                        </ul>
                    </section>
                </Show>

                <div class="flex gap-3 items-center">
                    <button
                        class="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded text-white font-medium"
                        onClick={submit}
                        disabled={submitting() || selectedIsUsed()}
                    >
                        {submitting() ? 'Starting…' : 'Start run'}
                    </button>
                    <Show when={error()}>
                        <span class="text-red-400 text-sm">{error()}</span>
                    </Show>
                </div>
            </div>
        </div>
    )
}

const LiveRunView: Component<{
    runId: string
    onClose: () => void
}> = (props) => {
    const [events, setEvents] = createSignal<RunEvent[]>([])
    const [stopped, setStopped] = createSignal(false)
    const [nudgeText, setNudgeText] = createSignal('')
    const [nudgeError, setNudgeError] = createSignal<string | null>(null)

    const lastAwaitingKind = (): AwaitingInputKind | null => {
        const all = events()
        for (let i = all.length - 1; i >= 0; i--) {
            const e = all[i]
            if (e.type === 'awaiting_input') return e.kind
            if (e.type === 'iteration_started' || e.type === 'llm_call' || e.type === 'tool_call') return null
        }
        return null
    }

    const totals = () => {
        let inputTokens = 0
        let outputTokens = 0
        let toolCalls = 0
        let iterations = 0
        let startedAt: number | null = null
        let endedAt: number | null = null
        for (const e of events()) {
            if (e.type === 'run_started') startedAt = e.t
            if (e.type === 'run_stopped') endedAt = e.t
            if (e.type === 'iteration_started') iterations = e.index + 1
            if (e.type === 'llm_call') {
                inputTokens += e.inputTokens
                outputTokens += e.outputTokens
            }
            if (e.type === 'tool_call') toolCalls += 1
        }
        return {
            inputTokens,
            outputTokens,
            toolCalls,
            iterations,
            elapsedMs:
                startedAt === null
                    ? 0
                    : (endedAt ?? Date.now()) - startedAt,
        }
    }

    onMount(async () => {
        try {
            const history = await api<{ events: RunEvent[] }>(
                `/runs/${props.runId}/history`
            )
            setEvents(history.events)
            if (history.events.some((e) => e.type === 'run_stopped')) {
                setStopped(true)
            }
        } catch (e) {
            console.error('[harness] history load failed', e)
        }

        const es = new EventSource(`/api/harness/runs/${props.runId}/events`)
        es.onmessage = (msg) => {
            try {
                const event = JSON.parse(msg.data) as RunEvent
                setEvents((prev) => [...prev, event])
                if (event.type === 'run_stopped') {
                    setStopped(true)
                    es.close()
                }
            } catch (e) {
                console.error('[harness] event parse failed', e)
            }
        }
        es.onerror = () => {
            // SSE will reconnect automatically; if the run is already stopped the
            // server will close the connection and we don't need to retry.
        }
        onCleanup(() => es.close())
    })

    const sendNudge = async () => {
        if (!nudgeText().trim()) return
        setNudgeError(null)
        try {
            await api(`/runs/${props.runId}/nudge`, {
                method: 'POST',
                body: { text: nudgeText(), kind: 'free_text' },
            })
            setNudgeText('')
        } catch (e) {
            setNudgeError(e instanceof Error ? e.message : String(e))
        }
    }

    const stop = async () => {
        try {
            await api(`/runs/${props.runId}/stop`, { method: 'POST' })
        } catch (e) {
            console.error('[harness] stop failed', e)
        }
    }
    const abort = async () => {
        try {
            await api(`/runs/${props.runId}/abort`, { method: 'POST' })
        } catch (e) {
            console.error('[harness] abort failed', e)
        }
    }

    let scrollEl: HTMLDivElement | undefined
    createEffect(() => {
        events()
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
    })

    return (
        <div class="flex-1 flex flex-col min-h-0">
            <div class="border-b border-gray-800 px-4 py-2 flex items-center justify-between">
                <div class="text-sm">
                    <span class="text-gray-400">run</span>{' '}
                    <span class="font-mono text-gray-200">{props.runId}</span>
                </div>
                <div class="flex gap-4 text-xs text-gray-300">
                    <span>iter {totals().iterations}</span>
                    <span>in {totals().inputTokens}</span>
                    <span>out {totals().outputTokens}</span>
                    <span>tools {totals().toolCalls}</span>
                    <span>{fmtMs(totals().elapsedMs)}</span>
                </div>
                <button
                    onClick={props.onClose}
                    class="text-xs px-2 py-1 rounded border border-gray-700 hover:bg-gray-800"
                >
                    Close
                </button>
            </div>

            <div
                ref={scrollEl}
                class="flex-1 overflow-auto px-4 py-2 font-mono text-xs space-y-0.5"
            >
                <For each={events()}>
                    {(e) => <EventLine event={e} />}
                </For>
            </div>

            <Show when={!stopped()}>
                <div class="border-t border-gray-800 p-3 space-y-2">
                    <Show
                        when={props.runId.includes('-slop-')}
                        fallback={
                            <Switch>
                                <Match
                                    when={
                                        lastAwaitingKind() === 'free_text' ||
                                        lastAwaitingKind() === null
                                    }
                                >
                                    <div class="flex gap-2">
                                        <textarea
                                            class="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
                                            rows={2}
                                            placeholder={
                                                lastAwaitingKind() ===
                                                'free_text'
                                                    ? 'Agent is waiting — type a nudge'
                                                    : 'Agent running… nudge will queue'
                                            }
                                            value={nudgeText()}
                                            onInput={(e) =>
                                                setNudgeText(
                                                    e.currentTarget.value
                                                )
                                            }
                                        />
                                        <button
                                            class="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm"
                                            onClick={sendNudge}
                                        >
                                            Send
                                        </button>
                                    </div>
                                </Match>
                            </Switch>
                        }
                    >
                        <div class="text-xs text-gray-400 italic">
                            Nudges for Slop runs happen in the editor tab. This
                            view shows live events and the Stop button.
                        </div>
                    </Show>
                    <Show when={nudgeError()}>
                        <div class="text-xs text-red-400">{nudgeError()}</div>
                    </Show>
                    <div class="flex gap-2 text-xs">
                        <button
                            class="px-2 py-1 border border-gray-700 rounded hover:bg-gray-800"
                            onClick={stop}
                        >
                            Stop
                        </button>
                        <button
                            class="px-2 py-1 border border-red-900 text-red-300 rounded hover:bg-red-950"
                            onClick={abort}
                        >
                            Abort
                        </button>
                    </div>
                </div>
            </Show>
            <Show when={stopped()}>
                <div class="border-t border-gray-800 p-3 text-sm text-gray-400">
                    Run stopped. Grading UI lands in step 7.
                </div>
            </Show>
        </div>
    )
}

const EventLine: Component<{ event: RunEvent }> = (props) => {
    const prefix = () => {
        const d = new Date(props.event.t)
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
    }
    const color = () => {
        switch (props.event.type) {
            case 'run_started':
            case 'iteration_started':
                return 'text-green-400'
            case 'llm_call':
                return 'text-blue-300'
            case 'tool_call':
                return 'text-purple-300'
            case 'text_chunk':
                return 'text-gray-300'
            case 'awaiting_input':
                return 'text-yellow-300'
            case 'iteration_ended':
                return 'text-green-600'
            case 'run_stopped':
                return props.event.reason === 'error'
                    ? 'text-red-400'
                    : 'text-gray-400'
        }
    }
    const body = () => {
        const e = props.event
        switch (e.type) {
            case 'run_started':
                return `${e.game} / ${e.scenario} started`
            case 'iteration_started':
                return `iter ${e.index} (${e.kind}): ${e.prompt.slice(0, 80)}`
            case 'llm_call':
                return `llm_call in=${e.inputTokens} out=${e.outputTokens} ${e.durationMs}ms finish=${e.finishReason ?? '?'}`
            case 'tool_call':
                return `tool ${e.toolName} ${e.inputPreview.slice(0, 120)}${e.error ? ` ERROR: ${e.error}` : ''}`
            case 'text_chunk':
                return e.text
            case 'awaiting_input':
                return `awaiting_input (${e.kind})`
            case 'iteration_ended':
                return `iter ${e.index} ended`
            case 'run_stopped':
                return `stopped (${e.reason})${e.error ? ` — ${e.error}` : ''}`
        }
    }
    return (
        <div class={`whitespace-pre-wrap break-words ${color()}`}>
            <span class="text-gray-600">{prefix()}</span> {body()}
        </div>
    )
}

type FailureMode = 'none' | 'planning' | 'tool' | 'scope'

const RubricForm: Component<{
    run: RunRow
    onSubmitted: () => void
}> = (props) => {
    const [movement, setMovement] = createSignal(
        props.run.rubric_movement === 1
    )
    const [win, setWin] = createSignal(props.run.rubric_win === 1)
    const [lose, setLose] = createSignal(props.run.rubric_lose === 1)
    const [noCrash, setNoCrash] = createSignal(
        props.run.rubric_no_crash === 1
    )
    const [failureMode, setFailureMode] = createSignal<FailureMode>('none')
    const [notes, setNotes] = createSignal('')
    const [submitting, setSubmitting] = createSignal(false)
    const [error, setError] = createSignal<string | null>(null)

    const submit = async () => {
        setError(null)
        setSubmitting(true)
        try {
            await api(`/runs/${props.run.id}/grade`, {
                method: 'POST',
                body: {
                    movement: movement() ? 1 : 0,
                    win: win() ? 1 : 0,
                    lose: lose() ? 1 : 0,
                    noCrash: noCrash() ? 1 : 0,
                    failureMode: failureMode(),
                    notes: notes(),
                },
            })
            props.onSubmitted()
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            setSubmitting(false)
        }
    }

    const Check: Component<{
        label: string
        checked: () => boolean
        onChange: (v: boolean) => void
    }> = (p) => (
        <label class="flex items-center gap-2 cursor-pointer">
            <input
                type="checkbox"
                checked={p.checked()}
                onChange={(e) => p.onChange(e.currentTarget.checked)}
            />
            <span class="text-sm">{p.label}</span>
        </label>
    )

    return (
        <div class="bg-gray-900 border-l-2 border-blue-600 p-4 space-y-3">
            <div class="grid grid-cols-2 gap-3">
                <Check
                    label="Movement / core mechanic works"
                    checked={movement}
                    onChange={setMovement}
                />
                <Check
                    label="Win condition exists & triggers"
                    checked={win}
                    onChange={setWin}
                />
                <Check
                    label="Lose condition exists & triggers"
                    checked={lose}
                    onChange={setLose}
                />
                <Check
                    label="No crashes, game is playable"
                    checked={noCrash}
                    onChange={setNoCrash}
                />
            </div>
            <div class="flex items-center gap-2 text-sm">
                <span class="text-gray-400">Failure mode:</span>
                <For
                    each={
                        ['none', 'planning', 'tool', 'scope'] as FailureMode[]
                    }
                >
                    {(mode) => (
                        <label class="flex items-center gap-1 cursor-pointer">
                            <input
                                type="radio"
                                name={`fmode-${props.run.id}`}
                                checked={failureMode() === mode}
                                onChange={() => setFailureMode(mode)}
                            />
                            <span>{mode}</span>
                        </label>
                    )}
                </For>
            </div>
            <textarea
                class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
                rows={2}
                placeholder="Notes (free-form, not aggregated)"
                value={notes()}
                onInput={(e) => setNotes(e.currentTarget.value)}
            />
            <div class="flex gap-3 items-center">
                <button
                    class="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-white text-sm disabled:opacity-50"
                    onClick={submit}
                    disabled={submitting()}
                >
                    {submitting() ? 'Submitting…' : 'Submit grade'}
                </button>
                <span class="text-xs text-gray-500">
                    Artifact:{' '}
                    <Show
                        when={props.run.scenario === 'slop'}
                        fallback={
                            <span class="font-mono">
                                harness/runs/{props.run.id}/artifact/
                            </span>
                        }
                    >
                        <span class="font-mono">
                            harness/runs/{props.run.id}/artifact/scene.json
                        </span>
                    </Show>
                </span>
                <Show when={error()}>
                    <span class="text-xs text-red-400">{error()}</span>
                </Show>
            </div>
        </div>
    )
}

const HistoryView: Component<{
    onOpen: (runId: string) => void
}> = (props) => {
    const [data, { refetch }] = createResource(() =>
        api<{ runs: RunRow[] }>('/runs')
    )
    const [expanded, setExpanded] = createSignal<string | null>(null)
    onMount(() => {
        const timer = setInterval(() => refetch(), 3000)
        onCleanup(() => clearInterval(timer))
    })
    return (
        <div class="flex-1 overflow-auto p-4">
            <div class="flex gap-2 mb-3">
                <a
                    href="/api/harness/export.csv"
                    class="text-xs px-2 py-1 border border-gray-700 rounded hover:bg-gray-800"
                >
                    Export runs CSV
                </a>
                <a
                    href="/api/harness/export-iterations.csv"
                    class="text-xs px-2 py-1 border border-gray-700 rounded hover:bg-gray-800"
                >
                    Export iterations CSV
                </a>
            </div>
            <table class="w-full text-sm">
                <thead class="text-xs uppercase text-gray-500 border-b border-gray-800">
                    <tr>
                        <th class="text-left py-2 w-6" />
                        <th class="text-left">id</th>
                        <th class="text-left">game</th>
                        <th class="text-left">scenario</th>
                        <th class="text-right">run</th>
                        <th class="text-left">status</th>
                        <th class="text-right">iter</th>
                        <th class="text-right">tokens</th>
                        <th class="text-right">tools</th>
                        <th class="text-right">duration</th>
                        <th class="text-left">rubric</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    <Show when={data()}>
                        <For each={data()!.runs}>
                            {(r) => {
                                const totalTokens =
                                    (r.total_input_tokens ?? 0) +
                                    (r.total_output_tokens ?? 0)
                                const rubric =
                                    r.rubric_movement === null
                                        ? '—'
                                        : `${r.rubric_movement}${r.rubric_win}${r.rubric_lose}${r.rubric_no_crash}`
                                const isExpanded = () => expanded() === r.id
                                const canGrade = () =>
                                    r.status === 'stopped' ||
                                    r.status === 'graded'
                                return (
                                    <>
                                        <tr class="border-b border-gray-900 hover:bg-gray-900">
                                            <td class="py-2 text-gray-500">
                                                <Show when={canGrade()}>
                                                    <button
                                                        class="w-6"
                                                        onClick={() =>
                                                            setExpanded(
                                                                isExpanded()
                                                                    ? null
                                                                    : r.id
                                                            )
                                                        }
                                                    >
                                                        {isExpanded()
                                                            ? '▼'
                                                            : '▶'}
                                                    </button>
                                                </Show>
                                            </td>
                                            <td class="font-mono text-xs">
                                                {r.id}
                                            </td>
                                            <td>{r.game}</td>
                                            <td>{r.scenario}</td>
                                            <td class="text-right">
                                                {r.run_number}
                                            </td>
                                            <td>{r.status}</td>
                                            <td class="text-right">
                                                {r.total_iterations ?? '—'}
                                            </td>
                                            <td class="text-right">
                                                {totalTokens || '—'}
                                            </td>
                                            <td class="text-right">
                                                {r.total_tool_calls ?? '—'}
                                            </td>
                                            <td class="text-right">
                                                {fmtMs(r.total_duration_ms)}
                                            </td>
                                            <td class="font-mono text-xs">
                                                {rubric}
                                            </td>
                                            <td>
                                                <div class="flex gap-1">
                                                    <button
                                                        class="text-xs px-2 py-0.5 border border-gray-700 rounded hover:bg-gray-800"
                                                        onClick={() =>
                                                            props.onOpen(r.id)
                                                        }
                                                    >
                                                        open
                                                    </button>
                                                    <button
                                                        class="text-xs px-2 py-0.5 border border-red-900 text-red-300 rounded hover:bg-red-950"
                                                        title="Delete run — removes DB row and artifact directory"
                                                        onClick={async (e) => {
                                                            e.stopPropagation()
                                                            if (
                                                                !globalThis.confirm(
                                                                    `Delete run ${r.id}? This removes its events, meta, and artifacts.`
                                                                )
                                                            )
                                                                return
                                                            try {
                                                                await api(
                                                                    `/runs/${r.id}`,
                                                                    {
                                                                        method: 'DELETE',
                                                                    }
                                                                )
                                                                refetch()
                                                            } catch (err) {
                                                                console.error(
                                                                    '[harness] delete failed',
                                                                    err
                                                                )
                                                            }
                                                        }}
                                                    >
                                                        delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        <Show when={isExpanded()}>
                                            <tr>
                                                <td colspan={12}>
                                                    <RubricForm
                                                        run={r}
                                                        onSubmitted={() => {
                                                            setExpanded(null)
                                                            refetch()
                                                        }}
                                                    />
                                                </td>
                                            </tr>
                                        </Show>
                                    </>
                                )
                            }}
                        </For>
                    </Show>
                </tbody>
            </table>
        </div>
    )
}

export default function Harness() {
    const [tab, setTab] = createSignal<'new' | 'live' | 'history'>('new')
    const [activeRunId, setActiveRunId] = createSignal<string | null>(null)

    const goLive = (id: string) => {
        setActiveRunId(id)
        setTab('live')
    }

    return (
        <div class="h-screen flex flex-col bg-gray-900 text-gray-100 dark">
            <div class="border-b border-gray-800 px-4 py-2 flex items-center gap-4">
                <h1 class="font-semibold">Evaluation Harness</h1>
                <nav class="flex gap-1 text-sm ml-4">
                    <For each={['new', 'live', 'history'] as const}>
                        {(t) => (
                            <button
                                class={`px-3 py-1 rounded ${
                                    tab() === t
                                        ? 'bg-gray-800 text-white'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                                onClick={() => setTab(t)}
                                disabled={t === 'live' && !activeRunId()}
                            >
                                {t}
                            </button>
                        )}
                    </For>
                </nav>
                <div class="flex-1" />
                <ProviderStatus />
            </div>

            <Switch>
                <Match when={tab() === 'new'}>
                    <NewRunForm onStarted={goLive} />
                </Match>
                <Match when={tab() === 'live' && activeRunId()}>
                    <LiveRunView
                        runId={activeRunId()!}
                        onClose={() => setTab('history')}
                    />
                </Match>
                <Match when={tab() === 'history'}>
                    <HistoryView onOpen={goLive} />
                </Match>
            </Switch>
        </div>
    )
}
