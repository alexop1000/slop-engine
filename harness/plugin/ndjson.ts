import {
    createReadStream,
    createWriteStream,
    existsSync,
    type WriteStream,
} from 'node:fs'
import { createInterface } from 'node:readline'

import { eventsPath } from '../paths'
import type { RunEvent } from '../types'

const writers = new Map<string, WriteStream>()

function getWriter(runId: string): WriteStream {
    const existing = writers.get(runId)
    if (existing) return existing
    const w = createWriteStream(eventsPath(runId), { flags: 'a' })
    writers.set(runId, w)
    return w
}

export function appendEvent(runId: string, event: RunEvent): void {
    const line = `${JSON.stringify(event)}\n`
    getWriter(runId).write(line)
}

export function closeWriter(runId: string): Promise<void> {
    const w = writers.get(runId)
    if (!w) return Promise.resolve()
    writers.delete(runId)
    return new Promise((resolve) => {
        w.end(() => resolve())
    })
}

export async function readEvents(runId: string): Promise<RunEvent[]> {
    const path = eventsPath(runId)
    if (!existsSync(path)) return []
    const events: RunEvent[] = []
    const rl = createInterface({
        input: createReadStream(path, { encoding: 'utf-8' }),
        crlfDelay: Infinity,
    })
    for await (const line of rl) {
        if (!line.trim()) continue
        try {
            events.push(JSON.parse(line) as RunEvent)
        } catch {
            // Skip malformed lines rather than abort — NDJSON may have a
            // partially-written tail if the process crashed mid-write.
        }
    }
    return events
}
