// ── Planning store ───────────────────────────────────────────────────
// Manages interactive tool resolution for ask_clarification / present_plan.
// The tool executor creates a pending entry; the UI component resolves it.

import { createSignal } from 'solid-js'

export interface PendingPlanning {
    toolCallId: string
    resolve: (result: string) => void
}

const [pending, setPending] = createSignal<Map<string, PendingPlanning>>(
    new Map()
)

/** Register a pending interactive tool. Returns a Promise that resolves when the user responds. */
export function createPlanningPromise(toolCallId: string): Promise<string> {
    return new Promise<string>((resolve) => {
        setPending((prev) => {
            const next = new Map(prev)
            next.set(toolCallId, { toolCallId, resolve })
            return next
        })
    })
}

/** Resolve a pending interactive tool with the user's response. */
export function resolvePlanning(toolCallId: string, result: string) {
    const entry = pending().get(toolCallId)
    if (!entry) return
    entry.resolve(result)
    setPending((prev) => {
        const next = new Map(prev)
        next.delete(toolCallId)
        return next
    })
}

/** Check if a tool call is still waiting for user input. */
export function isPlanningPending(toolCallId: string): boolean {
    return pending().has(toolCallId)
}
