import type { RunEvent } from '../types'

type Subscriber = (event: RunEvent) => void

const subscribers = new Map<string, Set<Subscriber>>()

export function subscribe(runId: string, cb: Subscriber): () => void {
    let set = subscribers.get(runId)
    if (!set) {
        set = new Set()
        subscribers.set(runId, set)
    }
    set.add(cb)
    return () => {
        const s = subscribers.get(runId)
        if (!s) return
        s.delete(cb)
        if (s.size === 0) subscribers.delete(runId)
    }
}

export function broadcast(runId: string, event: RunEvent): void {
    const set = subscribers.get(runId)
    if (!set) return
    for (const cb of set) {
        try {
            cb(event)
        } catch (e) {
            console.error('[harness sse] subscriber threw:', e)
        }
    }
}

export function formatSse(event: RunEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`
}
