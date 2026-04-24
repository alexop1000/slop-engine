/**
 * Client-side harness coordination. When the editor is opened with
 * `?harnessRunId=<id>`, this module tracks the active run id and a pending
 * iteration descriptor that the next user-initiated /api/chat post will carry
 * to the server. Auto-sends triggered by tool-result continuations read `null`
 * and thus don't start new iterations.
 */

import { createSignal } from 'solid-js'

type IterationKind = 'initial' | 'nudge' | 'clarification' | 'plan_approval'

let harnessRunId: string | null = null
let pendingIteration: { kind: IterationKind; prompt: string } | null = null

const [pendingInitialPrompt, setPendingInitialPromptSignal] = createSignal<
    string | null
>(null)

export { pendingInitialPrompt }

export function setHarnessRunId(id: string | null): void {
    harnessRunId = id
    pendingIteration = null
    if (id === null) setPendingInitialPromptSignal(null)
}

export function setPendingInitialPrompt(prompt: string | null): void {
    setPendingInitialPromptSignal(prompt)
}

export function consumePendingInitialPrompt(): string | null {
    const p = pendingInitialPrompt()
    if (p !== null) setPendingInitialPromptSignal(null)
    return p
}

export function getHarnessRunId(): string | null {
    return harnessRunId
}

export function inHarnessMode(): boolean {
    return harnessRunId !== null
}

export function queueHarnessIteration(
    kind: IterationKind,
    prompt: string
): void {
    if (!harnessRunId) return
    pendingIteration = { kind, prompt }
}

export function consumePendingHarnessIteration():
    | { kind: IterationKind; prompt: string }
    | null {
    const p = pendingIteration
    pendingIteration = null
    return p
}

export interface HarnessRequestFields {
    harnessRunId?: string
    harnessIteration?: { kind: IterationKind; prompt: string }
}

/** Build the request-body extensions to attach to /api/chat and /api/subagent. */
export function buildHarnessBodyFields(options: {
    consumePending: boolean
}): HarnessRequestFields {
    if (!harnessRunId) return {}
    const fields: HarnessRequestFields = { harnessRunId }
    if (options.consumePending) {
        const p = consumePendingHarnessIteration()
        if (p) fields.harnessIteration = p
    }
    return fields
}

/**
 * Forward a runtime error from the editor to the harness backend. The server
 * decides whether to count it (only errors that fire while no iteration is
 * active are counted as "post-LLM" runtime errors). No-op when not in harness
 * mode. Failures are swallowed — reporting must never disrupt the editor.
 */
export function reportHarnessRuntimeError(message: string): void {
    if (!harnessRunId) return
    void fetch(
        `/api/harness/runs/${encodeURIComponent(harnessRunId)}/runtime-error`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        }
    ).catch(() => {
        // Reporting failures must not surface to the editor.
    })
}
