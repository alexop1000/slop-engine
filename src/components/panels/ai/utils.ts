import { marked, type Token, type Tokens, type TokensList } from 'marked'
import type {
    ContentPart,
    MessageSegment,
    ToolUIPart,
    FileUIPart,
} from './types'

marked.setOptions({ breaks: true, gfm: true })

const THINKING_BLOCK_RE =
    /<(think|thinking|thought|reasoning|inner_monologue)[\s>][\s\S]*?<\/\1>/gi

export function stripThinkingBlocks(text: string): string {
    return text.replaceAll(THINKING_BLOCK_RE, '').trim()
}

export function formatLogArg(arg: unknown): string {
    if (arg === null) return 'null'
    if (arg === undefined) return 'undefined'
    if (typeof arg === 'string') return arg
    if (typeof arg === 'object') {
        try {
            return JSON.stringify(arg, null, 2)
        } catch {
            return Object.prototype.toString.call(arg)
        }
    }
    return String(arg)
}

/** Tokenize markdown, extracting code blocks for interactive rendering */
export function parseContent(raw: string): ContentPart[] {
    const tokensList = marked.lexer(raw)
    const result: ContentPart[] = []
    let pending: Token[] = []

    const flushPending = () => {
        if (pending.length > 0) {
            const list = pending as unknown as TokensList
            list.links = tokensList.links
            result.push({ kind: 'html', html: marked.parser(list) })
            pending = []
        }
    }

    for (const token of tokensList) {
        if (token.type === 'code') {
            flushPending()
            const codeToken = token as Tokens.Code
            result.push({
                kind: 'code',
                lang: codeToken.lang || 'plaintext',
                code: codeToken.text,
            })
        } else {
            pending.push(token)
        }
    }
    flushPending()

    return result
}

function isFilePart(part: { type: string }): part is FileUIPart {
    return part.type === 'file'
}

/** Group parts into ordered segments preserving their original position */
export function groupPartsInOrder(
    parts: Array<{ type: string; text?: string; [key: string]: unknown }>,
    isToolPart: (p: { type: string }) => p is ToolUIPart
): MessageSegment[] {
    const segments: MessageSegment[] = []
    let pendingText = ''

    const flushText = () => {
        if (pendingText) {
            const cleaned = stripThinkingBlocks(pendingText)
            if (cleaned) {
                segments.push({ kind: 'text', text: cleaned })
            }
            pendingText = ''
        }
    }

    for (const part of parts) {
        if (
            part.type === 'reasoning' ||
            part.type === 'thinking' ||
            part.type === 'redacted-reasoning'
        ) {
            continue
        }
        if (isToolPart(part)) {
            flushText()
            segments.push({ kind: 'tool', part: part as unknown as ToolUIPart })
        } else if (isFilePart(part)) {
            flushText()
            segments.push({ kind: 'file', part: part as FileUIPart })
        } else if (part.type === 'text' && part.text) {
            pendingText += part.text
        }
    }
    flushText()

    return segments
}
