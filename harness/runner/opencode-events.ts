import type { RunEvent } from '../types'

export interface OpencodeEvent {
    type: string
    timestamp?: number
    sessionID?: string
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
 * The opencode event schema is not versioned and keys vary across releases.
 * This parser is permissive: it extracts whatever tokens/tool-calls it
 * recognizes and ignores the rest. Unknown shapes don't throw.
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

    const usage = pickUsage(ev)
    if (usage) {
        runEvents.push({
            t,
            type: 'llm_call',
            iteration: ctx.iteration,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cachedTokens: usage.cachedTokens,
            durationMs: usage.durationMs ?? 0,
            model: ctx.modelId,
            finishReason:
                typeof ev.finishReason === 'string'
                    ? ev.finishReason
                    : undefined,
        })
    }

    const toolCall = pickToolCall(ev)
    if (toolCall) {
        runEvents.push({
            t,
            type: 'tool_call',
            iteration: ctx.iteration,
            toolName: toolCall.toolName,
            inputPreview: safePreview(toolCall.input, 200),
            outputPreview:
                toolCall.output === undefined
                    ? undefined
                    : safePreview(toolCall.output, 200),
            error: toolCall.error,
        })
    }

    const text = pickTextChunk(ev)
    if (text) {
        runEvents.push({
            t,
            type: 'text_chunk',
            iteration: ctx.iteration,
            text,
        })
    }

    const errorText = pickError(ev)
    if (errorText) {
        runEvents.push({
            t,
            type: 'text_chunk',
            iteration: ctx.iteration,
            text: `[opencode error] ${errorText}`,
        })
    }

    return {
        sessionId: typeof ev.sessionID === 'string' ? ev.sessionID : undefined,
        runEvents,
    }
}

function pickUsage(ev: OpencodeEvent): {
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    durationMs?: number
} | null {
    const nested =
        asRecord(ev.usage) ??
        asRecord((asRecord(ev.message) ?? {}).usage) ??
        asRecord((asRecord(ev.response) ?? {}).usage)
    if (!nested) return null
    const input =
        num(nested.input_tokens) ??
        num(nested.inputTokens) ??
        num(nested.input)
    const output =
        num(nested.output_tokens) ??
        num(nested.outputTokens) ??
        num(nested.output)
    if (input === undefined && output === undefined) return null
    return {
        inputTokens: input ?? 0,
        outputTokens: output ?? 0,
        cachedTokens:
            num(nested.cached_tokens) ?? num(nested.cachedTokens) ?? 0,
        durationMs:
            num(ev.durationMs) ??
            num(ev.duration) ??
            num((asRecord(ev.message) ?? {}).durationMs) ??
            undefined,
    }
}

function pickToolCall(ev: OpencodeEvent): {
    toolName: string
    input: unknown
    output?: unknown
    error?: string
} | null {
    if (typeof ev.type !== 'string') return null
    if (!ev.type.includes('tool')) return null
    const toolName =
        (typeof ev.toolName === 'string' && ev.toolName) ||
        (typeof ev.tool === 'string' && ev.tool) ||
        (asRecord(ev.tool)?.name as string | undefined) ||
        'unknown-tool'
    const input = ev.input ?? ev.args ?? asRecord(ev.tool)?.input
    const output = ev.output ?? ev.result
    const error =
        typeof ev.error === 'string'
            ? ev.error
            : asRecord(ev.error)?.message !== undefined
                ? String(asRecord(ev.error)?.message)
                : undefined
    return { toolName, input, output, error }
}

function pickTextChunk(ev: OpencodeEvent): string | undefined {
    if (typeof ev.text === 'string' && ev.text) return ev.text
    if (typeof ev.content === 'string' && ev.content) return ev.content
    const msg = asRecord(ev.message)
    if (msg && typeof msg.text === 'string' && msg.text) return msg.text
    return undefined
}

function pickError(ev: OpencodeEvent): string | undefined {
    if (ev.type !== 'error') return undefined
    const err = asRecord(ev.error)
    if (!err) return 'unknown error'
    const data = asRecord(err.data)
    return (
        (typeof data?.message === 'string' && data.message) ||
        (typeof err.name === 'string' && err.name) ||
        'unknown error'
    )
}

function asRecord(v: unknown): Record<string, unknown> | null {
    return v && typeof v === 'object' && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null
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
