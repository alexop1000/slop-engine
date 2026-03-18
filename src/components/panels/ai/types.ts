// ── Tool call types (AI SDK v6 UIToolInvocation format) ─────────────

export interface ToolUIPart {
    type: string // "tool-{name}" e.g. "tool-create_script"
    toolCallId: string
    state: string
    input?: Record<string, unknown>
    output?: unknown
    errorText?: string
}

export function isToolPart(part: { type: string }): part is ToolUIPart {
    return part.type.startsWith('tool-')
}

export function getToolNameFromPart(part: ToolUIPart): string {
    return part.type.replace(/^tool-/, '')
}

// ── Message segment types ───────────────────────────────────────────

export type ContentPart =
    | { kind: 'html'; html: string }
    | { kind: 'code'; lang: string; code: string }

export interface FileUIPart {
    type: 'file'
    mediaType: string
    url: string
    filename?: string
}

export type MessageSegment =
    | { kind: 'text'; text: string }
    | { kind: 'tool'; part: ToolUIPart }
    | { kind: 'file'; part: FileUIPart }

// ── Planning mode types ─────────────────────────────────────────────

export interface ClarificationOption {
    id: string
    label: string
    description: string
    icon?: string
}

export interface ClarificationInput {
    question: string
    options: ClarificationOption[]
    allowCustom?: boolean
    multiSelect?: boolean
}

export interface PlanStep {
    agent: 'scene' | 'script' | 'ui' | 'asset'
    description: string
}

export interface PlanInput {
    title: string
    steps: PlanStep[]
}
