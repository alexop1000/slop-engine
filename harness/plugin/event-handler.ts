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
}

interface RunAggregate {
    startedAt: number
    iterationCount: number
    toolCallCount: number
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    iterations: Map<number, IterationAggregate>
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
        }
        aggregates.set(runId, a)
    }
    return a
}

function getIterationAggregate(
    run: RunAggregate,
    index: number
): IterationAggregate {
    let it = run.iterations.get(index)
    if (!it) {
        it = {
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0,
            toolCallCount: 0,
        }
        run.iterations.set(index, it)
    }
    return it
}

export function handleEvent(runId: string, event: RunEvent): void {
    appendEvent(runId, event)
    broadcast(runId, event)

    const agg = getAggregate(runId)

    if (event.type === 'run_started') {
        agg.startedAt = event.t
        setRunStatus(runId, 'running', { startedAt: event.t })
    } else if (event.type === 'iteration_started') {
        agg.iterationCount += 1
        insertIteration({
            runId,
            index: event.index,
            kind: event.kind,
            promptText: event.prompt,
            startedAt: event.t,
        })
        setRunStatus(runId, 'running')
    } else if (event.type === 'llm_call') {
        const it = getIterationAggregate(agg, event.iteration)
        it.inputTokens += event.inputTokens
        it.outputTokens += event.outputTokens
        it.cachedTokens += event.cachedTokens
        agg.inputTokens += event.inputTokens
        agg.outputTokens += event.outputTokens
        agg.cachedTokens += event.cachedTokens
    } else if (event.type === 'tool_call') {
        const it = getIterationAggregate(agg, event.iteration)
        it.toolCallCount += 1
        agg.toolCallCount += 1
    } else if (event.type === 'iteration_ended') {
        const it = getIterationAggregate(agg, event.index)
        finalizeIteration(runId, event.index, {
            endedAt: event.t,
            inputTokens: it.inputTokens,
            outputTokens: it.outputTokens,
            cachedTokens: it.cachedTokens,
            toolCallCount: it.toolCallCount,
        })
    } else if (event.type === 'awaiting_input') {
        setRunStatus(runId, 'idle')
    } else if (event.type === 'run_stopped') {
        const stoppedAt = event.t
        updateRunSummary(runId, {
            totalDurationMs: stoppedAt - agg.startedAt,
            totalInputTokens: agg.inputTokens,
            totalOutputTokens: agg.outputTokens,
            totalCachedTokens: agg.cachedTokens,
            totalIterations: agg.iterationCount,
            totalToolCalls: agg.toolCallCount,
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
