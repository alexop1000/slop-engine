import {
    finalizeIteration,
    insertIteration,
    setRunStatus,
    updateRunSummary,
} from './db'
import { appendEvent, closeWriter } from './ndjson'
import { broadcast } from './sse'
import type { RunEvent } from '../types'

interface IterationAggregate {
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    toolCallCount: number
    startedAt: number
    endedAt: number | null
    /** Latest llm_call/tool_call timestamp. Used as a fallback end for
     *  iterations that never emit iteration_ended (e.g. when the LLM
     *  finishes with tool-calls and waits on user input). */
    lastActivityT: number
}

interface RunAggregate {
    startedAt: number
    iterationCount: number
    toolCallCount: number
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    iterations: Map<number, IterationAggregate>
    runtimeErrors: number
}

const aggregates = new Map<string, RunAggregate>()

function getAggregate(runId: string): RunAggregate {
    let a = aggregates.get(runId)
    if (!a) {
        a = {
            startedAt: Date.now(),
            iterationCount: 0,
            toolCallCount: 0,
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            iterations: new Map(),
            runtimeErrors: 0,
        }
        aggregates.set(runId, a)
    }
    return a
}

function getIterationAggregate(
    run: RunAggregate,
    index: number,
    startedAtFallback: number
): IterationAggregate {
    let it = run.iterations.get(index)
    if (!it) {
        it = {
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            toolCallCount: 0,
            startedAt: startedAtFallback,
            endedAt: null,
            lastActivityT: startedAtFallback,
        }
        run.iterations.set(index, it)
    }
    return it
}

/**
 * Sum of per-iteration "active" durations.
 * - Completed iterations use endedAt (set by iteration_ended).
 * - Iterations that never emit iteration_ended (clarification/plan_approval
 *   turns, where the LLM finishes with tool-calls) fall back to the latest
 *   activity timestamp. This avoids inflating their duration with user
 *   think-time.
 */
function sumActiveMs(agg: RunAggregate): number {
    let total = 0
    for (const it of agg.iterations.values()) {
        const end = it.endedAt ?? it.lastActivityT
        total += Math.max(0, end - it.startedAt)
    }
    return total
}

export function handleEvent(runId: string, event: RunEvent): void {
    appendEvent(runId, event)
    broadcast(runId, event)

    const agg = getAggregate(runId)

    if (event.type === 'run_started') {
        agg.startedAt = event.t
        setRunStatus(runId, 'running', { startedAt: event.t })
    } else if (event.type === 'iteration_started') {
        // If a previous iteration is still in-flight (no iteration_ended
        // fired — common for clarification/plan_approval turns), close it
        // out using its last activity timestamp so its duration reflects
        // active LLM time only, not user think-time.
        for (const [idx, it] of agg.iterations) {
            if (it.endedAt !== null) continue
            it.endedAt = it.lastActivityT
            finalizeIteration(runId, idx, {
                endedAt: it.endedAt,
                inputTokens: it.inputTokens,
                outputTokens: it.outputTokens,
                cachedTokens: it.cachedTokens,
                toolCallCount: it.toolCallCount,
            })
        }
        agg.iterationCount += 1
        const it = getIterationAggregate(agg, event.index, event.t)
        it.startedAt = event.t
        it.endedAt = null
        it.lastActivityT = event.t
        insertIteration({
            runId,
            index: event.index,
            kind: event.kind,
            promptText: event.prompt,
            startedAt: event.t,
        })
        setRunStatus(runId, 'running')
    } else if (event.type === 'llm_call') {
        const it = getIterationAggregate(agg, event.iteration, event.t)
        it.inputTokens += event.inputTokens
        it.outputTokens += event.outputTokens
        it.cachedTokens += event.cachedTokens
        if (event.t > it.lastActivityT) it.lastActivityT = event.t
        agg.inputTokens += event.inputTokens
        agg.outputTokens += event.outputTokens
        agg.cachedTokens += event.cachedTokens
    } else if (event.type === 'tool_call') {
        const it = getIterationAggregate(agg, event.iteration, event.t)
        it.toolCallCount += 1
        if (event.t > it.lastActivityT) it.lastActivityT = event.t
        agg.toolCallCount += 1
    } else if (event.type === 'iteration_ended') {
        const it = getIterationAggregate(agg, event.index, event.t)
        it.endedAt = event.t
        if (event.t > it.lastActivityT) it.lastActivityT = event.t
        finalizeIteration(runId, event.index, {
            endedAt: event.t,
            inputTokens: it.inputTokens,
            outputTokens: it.outputTokens,
            cachedTokens: it.cachedTokens,
            toolCallCount: it.toolCallCount,
        })
    } else if (event.type === 'awaiting_input') {
        setRunStatus(runId, 'idle')
    } else if (event.type === 'runtime_error') {
        if (!event.duringIteration) agg.runtimeErrors += 1
    } else if (event.type === 'run_stopped') {
        const stoppedAt = event.t
        // Close out any in-flight iteration so its duration is captured.
        for (const [idx, it] of agg.iterations) {
            if (it.endedAt !== null) continue
            it.endedAt = Math.min(it.lastActivityT, stoppedAt)
            finalizeIteration(runId, idx, {
                endedAt: it.endedAt,
                inputTokens: it.inputTokens,
                outputTokens: it.outputTokens,
                cachedTokens: it.cachedTokens,
                toolCallCount: it.toolCallCount,
            })
        }
        updateRunSummary(runId, {
            totalDurationMs: sumActiveMs(agg),
            totalInputTokens: agg.inputTokens,
            totalOutputTokens: agg.outputTokens,
            totalCachedTokens: agg.cachedTokens,
            totalIterations: agg.iterationCount,
            totalToolCalls: agg.toolCallCount,
            runtimeErrors: agg.runtimeErrors,
        })
        setRunStatus(runId, 'stopped', { stoppedAt })
        aggregates.delete(runId)
        closeWriter(runId).catch((e) =>
            console.error('[harness] closeWriter failed:', e)
        )
    }
}

export function dropAggregate(runId: string): void {
    aggregates.delete(runId)
}
