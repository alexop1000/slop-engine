import type { RunEvent } from '../types'

export interface OpencodeEvent {
    type: string
    timestamp?: number
    sessionID?: string
    part?: unknown
    [k: string]: unknown
}

export interface ParsedOpencodeEvent {
    sessionId?: string
    runEvents: RunEvent[]
}

interface ParseContext {
    iteration: number
    modelId: string
}

/**
 * Convert one opencode stdout event into zero or more harness RunEvents.
 *
 * Opencode v1.14.x event shape:
 * - `type: "step_start"`  — ignored (no harness equivalent).
 * - `type: "text"`        — `part.text` is assistant commentary.
 * - `type: "tool_use"`    — `part.tool`, `part.callID`, `part.state.{status,input,output,error,time}`.
 * - `type: "step_finish"` — `part.reason`, `part.tokens.{input,output,cache.read,total}`, `part.cost`.
 * - `type: "error"`       — top-level `error.data.message` / `error.name`.
 *
 * This parser matches that shape exactly; unknown event types produce no
 * RunEvents so new opencode versions that add events won't break the run.
 */
export function parseOpencodeEvent(
    ev: OpencodeEvent,
    ctx: ParseContext
): ParsedOpencodeEvent {
    const runEvents: RunEvent[] = []
    const t =
        typeof ev.timestamp === 'number' && ev.timestamp > 0
            ? ev.timestamp
            : Date.now()
    const part = asRecord(ev.part) ?? {}

    switch (ev.type) {
        case 'text': {
            const text = str(part.text)
            if (text) {
                runEvents.push({
                    t,
                    type: 'text_chunk',
                    iteration: ctx.iteration,
                    text,
                })
            }
            break
        }
        case 'tool_use': {
            const toolName =
                str(part.tool) ??
                str(asRecord(part.tool)?.name) ??
                'unknown-tool'
            const state = asRecord(part.state) ?? {}
            const status = str(state.status)
            const input = state.input
            const output = state.output
            const error =
                status === 'error'
                    ? str(state.error) ??
                      str(asRecord(state.error)?.message) ??
                      'error'
                    : undefined
            const time = asRecord(state.time)
            const startMs = num(time?.start)
            const endMs = num(time?.end)
            const toolTs = endMs ?? startMs ?? t
            runEvents.push({
                t: toolTs,
                type: 'tool_call',
                iteration: ctx.iteration,
                toolName,
                inputPreview: safePreview(input, 200),
                outputPreview:
                    output === undefined
                        ? undefined
                        : safePreview(output, 200),
                error,
            })
            break
        }
        case 'step_finish': {
            const tokens = asRecord(part.tokens) ?? {}
            const cache = asRecord(tokens.cache) ?? {}
            const inputTokens = num(tokens.input) ?? 0
            const outputTokens = num(tokens.output) ?? 0
            const cachedTokens = num(cache.read) ?? 0
            const finishReason = str(part.reason)
            runEvents.push({
                t,
                type: 'llm_call',
                iteration: ctx.iteration,
                inputTokens,
                outputTokens,
                cachedTokens,
                // Opencode doesn't expose per-step duration directly; leave 0
                // and rely on harness-side timestamps (start-of-run → event.t)
                // for wall-clock measurement.
                durationMs: 0,
                model: ctx.modelId,
                finishReason,
            })
            break
        }
        case 'error': {
            const errRec = asRecord(ev.error)
            const data = asRecord(errRec?.data)
            const message =
                str(data?.message) ??
                str(errRec?.name) ??
                str(ev.error) ??
                'unknown opencode error'
            runEvents.push({
                t,
                type: 'text_chunk',
                iteration: ctx.iteration,
                text: `[opencode error] ${message}`,
            })
            break
        }
        // step_start and any unrecognized event type: no harness event.
        default:
            break
    }

    return {
        sessionId: str(ev.sessionID),
        runEvents,
    }
}

function asRecord(v: unknown): Record<string, unknown> | null {
    return v && typeof v === 'object' && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null
}

function str(v: unknown): string | undefined {
    return typeof v === 'string' && v.length > 0 ? v : undefined
}

function num(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function safePreview(value: unknown, max: number): string {
    if (value === undefined) return ''
    if (value === null) return 'null'
    try {
        const s = typeof value === 'string' ? value : JSON.stringify(value)
        if (s === undefined) return ''
        return s.length <= max ? s : `${s.slice(0, max)}… (+${s.length - max})`
    } catch {
        return '[unserializable]'
    }
}
