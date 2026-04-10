import type { LanguageModelUsage, ProviderMetadata, UIMessage } from 'ai'

const MAX_TEXT = 4000
const MAX_TOOL_JSON = 2000

function truncateText(s: string, max: number): string {
    if (s.length <= max) return s
    return `${s.slice(0, max)}… (+${s.length - max} chars)`
}

function summarizeUnknownForLog(value: unknown, maxJson: number): unknown {
    if (
        value === null ||
        typeof value === 'boolean' ||
        typeof value === 'number'
    ) {
        return value
    }
    if (typeof value === 'string') {
        return truncateText(value, MAX_TEXT)
    }
    try {
        const s = JSON.stringify(value)
        return truncateText(s, maxJson)
    } catch {
        return '[unserializable]'
    }
}

function summarizeFileUrl(url: string): string {
    if (url.startsWith('data:')) {
        return `data-url chars=${url.length}`
    }
    return truncateText(url, 500)
}

function summarizeUIMessagePart(part: UIMessage['parts'][number]): unknown {
    if (part.type === 'text') {
        return { type: 'text', text: truncateText(part.text, MAX_TEXT) }
    }
    if (part.type === 'reasoning') {
        return { type: 'reasoning', text: truncateText(part.text, MAX_TEXT) }
    }
    if (part.type === 'file') {
        return {
            type: 'file',
            mediaType: part.mediaType,
            filename: part.filename,
            url: summarizeFileUrl(part.url),
        }
    }
    if (part.type === 'dynamic-tool') {
        return {
            type: 'dynamic-tool',
            toolName: part.toolName,
            state: part.state,
            input:
                'input' in part && part.input !== undefined
                    ? summarizeUnknownForLog(part.input, MAX_TOOL_JSON)
                    : undefined,
        }
    }
    if (part.type.startsWith('tool-')) {
        const p = part as {
            type: string
            state: string
            input?: unknown
        }
        return {
            type: p.type,
            state: p.state,
            input:
                p.input !== undefined
                    ? summarizeUnknownForLog(p.input, MAX_TOOL_JSON)
                    : undefined,
        }
    }
    return { type: part.type }
}

export function summarizeChatRequest(messages: UIMessage[]): unknown {
    return messages.map((m) => ({
        role: m.role,
        parts: m.parts.map(summarizeUIMessagePart),
    }))
}

export type SubagentMessageForLog = {
    role: 'user' | 'assistant' | 'tool'
    content: unknown
}

export function summarizeSubagentRequest(
    messages: SubagentMessageForLog[]
): unknown {
    return messages.map((m) => {
        if (m.role === 'user') {
            const c = m.content
            if (typeof c === 'string') {
                return { role: m.role, content: truncateText(c, MAX_TEXT) }
            }
            if (Array.isArray(c)) {
                return {
                    role: m.role,
                    content: c.map((p) => {
                        if (
                            p &&
                            typeof p === 'object' &&
                            'type' in p &&
                            (p as { type: string }).type === 'text'
                        ) {
                            return {
                                type: 'text',
                                text: truncateText(
                                    String(
                                        (p as { text?: string }).text ?? ''
                                    ),
                                    MAX_TEXT
                                ),
                            }
                        }
                        if (
                            p &&
                            typeof p === 'object' &&
                            'type' in p &&
                            (p as { type: string }).type === 'image'
                        ) {
                            const img = (p as { image?: string }).image
                            const len =
                                typeof img === 'string' ? img.length : 0
                            return {
                                type: 'image',
                                chars: len,
                                mediaType: (p as { mediaType?: string })
                                    .mediaType,
                            }
                        }
                        return summarizeUnknownForLog(p, MAX_TOOL_JSON)
                    }),
                }
            }
            return {
                role: m.role,
                content: summarizeUnknownForLog(c, MAX_TOOL_JSON),
            }
        }
        if (m.role === 'assistant' && Array.isArray(m.content)) {
            return {
                role: m.role,
                content: m.content.map((p) => {
                    if (
                        p &&
                        typeof p === 'object' &&
                        'type' in p &&
                        (p as { type: string }).type === 'text'
                    ) {
                        return {
                            type: 'text',
                            text: truncateText(
                                String((p as { text?: string }).text ?? ''),
                                MAX_TEXT
                            ),
                        }
                    }
                    if (
                        p &&
                        typeof p === 'object' &&
                        'type' in p &&
                        (p as { type: string }).type === 'tool-call'
                    ) {
                        const tc = p as {
                            toolName?: string
                            input?: unknown
                        }
                        return {
                            type: 'tool-call',
                            toolName: tc.toolName,
                            input: summarizeUnknownForLog(
                                tc.input,
                                MAX_TOOL_JSON
                            ),
                        }
                    }
                    return summarizeUnknownForLog(p, MAX_TOOL_JSON)
                }),
            }
        }
        if (m.role === 'tool' && Array.isArray(m.content)) {
            return {
                role: m.role,
                content: m.content.map((p) => {
                    if (
                        p &&
                        typeof p === 'object' &&
                        'type' in p &&
                        (p as { type: string }).type === 'tool-result'
                    ) {
                        const tr = p as {
                            toolName?: string
                            output?: { type?: string; value?: string }
                        }
                        const val = tr.output?.value
                        return {
                            type: 'tool-result',
                            toolName: tr.toolName,
                            outputPreview:
                                typeof val === 'string'
                                    ? truncateText(val, MAX_TEXT)
                                    : undefined,
                        }
                    }
                    return summarizeUnknownForLog(p, MAX_TOOL_JSON)
                }),
            }
        }
        return {
            role: m.role,
            content: summarizeUnknownForLog(m.content, MAX_TOOL_JSON),
        }
    })
}

function readOpenRouterCost(
    meta: ProviderMetadata | undefined
): number | undefined {
    if (!meta || typeof meta !== 'object') return undefined
    const openrouter = (meta as Record<string, unknown>).openrouter
    if (!openrouter || typeof openrouter !== 'object') return undefined
    const usage = (openrouter as Record<string, unknown>).usage
    if (!usage || typeof usage !== 'object') return undefined
    const cost = (usage as Record<string, unknown>).cost
    return typeof cost === 'number' && cost >= 0 ? cost : undefined
}

function readRawUsageCost(raw: LanguageModelUsage['raw']): number | undefined {
    if (!raw || typeof raw !== 'object') return undefined
    const o = raw as Record<string, unknown>
    const c = o.cost
    if (typeof c === 'number') return c
    const nested = o.usage
    if (nested && typeof nested === 'object') {
        const nc = (nested as Record<string, unknown>).cost
        if (typeof nc === 'number') return nc
    }
    return undefined
}

/** Prefer summing per-step OpenRouter costs when multiple LLM steps ran. */
export function aggregateCostUsd(options: {
    providerMetadata: ProviderMetadata | undefined
    steps?: Array<{ providerMetadata?: ProviderMetadata | undefined }>
    usage: LanguageModelUsage
}): number | undefined {
    const fromSteps = options.steps
        ?.map((s) => readOpenRouterCost(s.providerMetadata))
        .filter((n): n is number => n !== undefined)
    if (fromSteps && fromSteps.length > 0) {
        return fromSteps.reduce((a, b) => a + b, 0)
    }
    const single = readOpenRouterCost(options.providerMetadata)
    if (single !== undefined) return single
    return readRawUsageCost(options.usage.raw)
}

export function logAgentLlmCall(entry: {
    route: 'chat' | 'subagent'
    provider: string
    modelId: string
    agentRole: 'orchestrator' | 'scene' | 'script' | 'ui' | 'asset' | 'test'
    request: unknown
    usage: LanguageModelUsage
    totalUsage: LanguageModelUsage
    costUsd: number | undefined
    finishReason: string | undefined
    selectedNode?: { name: string; type: string }
}): void {
    const line = JSON.stringify({
        tag: 'agent_llm',
        route: entry.route,
        provider: entry.provider,
        modelId: entry.modelId,
        agentRole: entry.agentRole,
        selectedNode: entry.selectedNode,
        request: entry.request,
        tokens: {
            input: entry.totalUsage.inputTokens,
            output: entry.totalUsage.outputTokens,
            total: entry.totalUsage.totalTokens,
        },
        costUsd: entry.costUsd ?? null,
        finishReason: entry.finishReason ?? null,
    })
    console.log(line)
}
