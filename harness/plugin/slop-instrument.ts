import type { LanguageModelUsage, ProviderMetadata } from 'ai'

import type { IterationKind } from '../types'
import { maxIterationIndex } from './db'
import { handleEvent } from './event-handler'

const currentIteration = new Map<string, number>()
const nextIterationIndex = new Map<string, number>()
const runStarted = new Set<string>()

export function ensureRunStarted(
    runId: string,
    game: string,
    scenario: string
): void {
    if (runStarted.has(runId)) return
    runStarted.add(runId)
    handleEvent(runId, {
        t: Date.now(),
        type: 'run_started',
        scenario: scenario as 'slop',
        game: game as 'dodger',
    })
}

export function beginIteration(
    runId: string,
    kind: IterationKind,
    prompt: string
): number {
    // Take the max of the in-memory counter and (DB max + 1) so we never
    // collide with rows from a prior server lifetime. The DB query is cheap
    // and only runs once per user-driven turn.
    const inMemory = nextIterationIndex.get(runId) ?? 0
    const dbNext = maxIterationIndex(runId) + 1
    const index = Math.max(inMemory, dbNext)
    nextIterationIndex.set(runId, index + 1)
    currentIteration.set(runId, index)
    handleEvent(runId, {
        t: Date.now(),
        type: 'iteration_started',
        index,
        kind,
        prompt,
    })
    return index
}

export function endIteration(runId: string): void {
    const index = currentIteration.get(runId)
    if (index === undefined) return
    currentIteration.delete(runId)
    handleEvent(runId, {
        t: Date.now(),
        type: 'iteration_ended',
        index,
    })
    handleEvent(runId, {
        t: Date.now(),
        type: 'awaiting_input',
        iteration: index,
        kind: 'free_text',
    })
}

export function getCurrentIteration(runId: string): number | undefined {
    return currentIteration.get(runId)
}

export function recordLlmCall(
    runId: string,
    step: {
        usage?: LanguageModelUsage
        providerMetadata?: ProviderMetadata
        finishReason?: string
        durationMs: number
        modelId: string
    }
): void {
    const iteration = currentIteration.get(runId)
    if (iteration === undefined) return
    const usage = step.usage
    handleEvent(runId, {
        t: Date.now(),
        type: 'llm_call',
        iteration,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cachedTokens: usage?.cachedInputTokens ?? 0,
        durationMs: step.durationMs,
        model: step.modelId,
        finishReason: step.finishReason,
    })
}

export function recordToolCall(
    runId: string,
    toolName: string,
    input: unknown,
    output?: unknown,
    error?: string
): void {
    const iteration = currentIteration.get(runId)
    if (iteration === undefined) return
    handleEvent(runId, {
        t: Date.now(),
        type: 'tool_call',
        iteration,
        toolName,
        inputPreview: safePreview(input, 200),
        outputPreview:
            output !== undefined ? safePreview(output, 200) : undefined,
        error,
    })
}

function safePreview(value: unknown, max: number): string {
    try {
        const s = typeof value === 'string' ? value : JSON.stringify(value)
        return s.length <= max ? s : `${s.slice(0, max)}… (+${s.length - max})`
    } catch {
        return '[unserializable]'
    }
}

/** Reset harness-side state. Called when a run is marked stopped/aborted. */
export function dropRunState(runId: string): void {
    currentIteration.delete(runId)
    nextIterationIndex.delete(runId)
    runStarted.delete(runId)
}
