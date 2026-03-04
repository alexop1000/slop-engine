import { createSignal } from 'solid-js'

export interface SubagentToolCall {
    name: string
    args: Record<string, unknown>
    result?: string
    error?: string
    status: 'pending' | 'done' | 'error'
}

export interface SubagentTurn {
    role: 'user' | 'assistant'
    text: string
    toolCalls?: SubagentToolCall[]
}

export interface SubagentState {
    turns: SubagentTurn[]
    status: 'running' | 'done' | 'error'
}

const store = new Map<string, SubagentState>()
const [tick, setTick] = createSignal(0)

export function updateSubagent(
    toolCallId: string,
    state: SubagentState
): void {
    store.set(toolCallId, JSON.parse(JSON.stringify(state)))
    setTick((t) => t + 1)
}

export function getSubagent(
    toolCallId: string
): SubagentState | undefined {
    tick()
    return store.get(toolCallId)
}
