import { convertToModelMessages, type UIMessage, type ModelMessage } from 'ai'
import type { FilePart } from '@ai-sdk/provider-utils'

type ExtractedImage = {
    msgIndex: number
    mediaType: string
    base64: string
}

const DATA_URI_RE = /^data:([^;]+);base64,(.+)$/

function isDataUriFilePart(
    p: UIMessage['parts'][number]
): p is { type: 'file'; url: string; mediaType: string } {
    return (
        p.type === 'file' &&
        'url' in p &&
        typeof p.url === 'string' &&
        p.url.startsWith('data:')
    )
}

function extractAndClean(messages: UIMessage[]) {
    const extracted: ExtractedImage[] = []

    const cleaned = messages.map((msg, idx) => {
        if (!msg.parts?.some(isDataUriFilePart)) return msg

        const filteredParts = msg.parts.filter((p) => {
            if (!isDataUriFilePart(p)) return true
            const match = DATA_URI_RE.exec(p.url)
            if (match) {
                extracted.push({
                    msgIndex: idx,
                    mediaType: match[1],
                    base64: match[2],
                })
            }
            return false
        })

        return { ...msg, parts: filteredParts } as UIMessage
    })

    return { cleaned, extracted }
}

function injectImages(
    messages: UIMessage[],
    modelMessages: ModelMessage[],
    extracted: ExtractedImage[]
) {
    for (const img of extracted) {
        let userCountTarget = 0
        for (let i = 0; i <= img.msgIndex && i < messages.length; i++) {
            if (messages[i].role === 'user') userCountTarget++
        }

        let userCountSeen = 0
        for (const mm of modelMessages) {
            if (mm.role !== 'user') continue
            userCountSeen++
            if (userCountSeen !== userCountTarget) continue

            const filePart: FilePart = {
                type: 'file',
                data: img.base64,
                mediaType: img.mediaType,
            }
            if (typeof mm.content === 'string') {
                mm.content = [
                    { type: 'text', text: mm.content },
                    filePart,
                ]
            } else if (Array.isArray(mm.content)) {
                mm.content.push(filePart)
            }
            break
        }
    }
}

/**
 * Workaround for AI SDK v6 bug where convertToModelMessages tries to
 * download data: URIs (which its download function doesn't support).
 * Strips data URI file parts before conversion, then re-injects them
 * as inline FileParts with base64 data.
 */
export async function convertToModelMessagesWithDataUris(
    messages: UIMessage[],
    options?: Parameters<typeof convertToModelMessages>[1]
): Promise<ModelMessage[]> {
    const { cleaned, extracted } = extractAndClean(messages)
    const modelMessages = await convertToModelMessages(cleaned, options)
    if (extracted.length > 0) {
        injectImages(messages, modelMessages, extracted)
    }
    return modelMessages
}
