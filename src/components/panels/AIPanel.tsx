import { useChat } from '@kodehort/ai-sdk-solid'
import {
    type Accessor,
    type Setter,
    createSignal,
    For,
    Show,
    createEffect,
    onMount,
    untrack,
} from 'solid-js'
import type { Scene, Node } from 'babylonjs'
import { makePersisted } from '@solid-primitives/storage'
import { marked, type Token, type Tokens, type TokensList } from 'marked'
import { Button } from '../ui'
import { Spinner } from '../ui/Spinner'
import {
    type ChatSession,
    getAllSessions,
    getSession,
    saveSession,
    deleteSession,
    generateChatId,
    titleFromMessages,
    formatSessionDate,
} from '../../chatHistoryStore'
import { getAssetStore, getBlob, setBlob, deleteBlob } from '../../assetStore'
import { openScript, openScriptFile } from '../../scriptEditorStore'
import {
    addMeshToScene,
    addLightToScene,
    updateNodeInScene,
    deleteNodeFromScene,
    getSceneSnapshot,
    importModelToScene,
    createGroupInScene,
    setParentInScene,
    executeBulkOperations,
    type AddMeshOptions,
    type AddLightOptions,
    type UpdateNodeOptions,
    type CreateGroupOptions,
    type BulkOperation,
    type AssetResolver,
} from '../../scene/SceneOperations'

marked.setOptions({ breaks: true, gfm: true })

// ── Tool call types (AI SDK v6 UIToolInvocation format) ─────────────

interface ToolUIPart {
    type: string // "tool-{name}" e.g. "tool-create_script"
    toolCallId: string
    state: string
    input?: Record<string, unknown>
    output?: unknown
    errorText?: string
}

function isToolPart(part: { type: string }): part is ToolUIPart {
    return part.type.startsWith('tool-')
}

function getToolNameFromPart(part: ToolUIPart): string {
    return part.type.replace(/^tool-/, '')
}

// ── Markdown content parser (via marked) ────────────────────────────

type ContentPart =
    | { kind: 'html'; html: string }
    | { kind: 'code'; lang: string; code: string }

/** Tokenize markdown, extracting code blocks for interactive rendering */
function parseContent(raw: string): ContentPart[] {
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

// ── Code block component ─────────────────────────────────────────────

function CodeBlock(props: Readonly<{ lang: string; code: string }>) {
    const [copied, setCopied] = createSignal(false)

    const handleCopy = async () => {
        await navigator.clipboard.writeText(props.code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div class="my-2 rounded-md overflow-hidden border border-gray-700">
            <div class="flex items-center justify-between bg-gray-800 px-3 py-1">
                <span class="text-xs text-gray-400 font-mono">
                    {props.lang}
                </span>
                <button
                    class="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    onClick={handleCopy}
                    type="button"
                >
                    {copied() ? 'Copied!' : 'Copy'}
                </button>
            </div>
            <pre class="p-3 overflow-x-auto bg-gray-950 text-sm leading-relaxed">
                <code class="font-mono text-gray-200 whitespace-pre">
                    {props.code}
                </code>
            </pre>
        </div>
    )
}

// ── Tool call indicator ──────────────────────────────────────────────

function ToolCallIndicator(props: Readonly<{ part: ToolUIPart }>) {
    const toolName = () => getToolNameFromPart(props.part)
    const isDone = () =>
        props.part.state === 'output-available' ||
        props.part.state === 'output-error'
    const isError = () => props.part.state === 'output-error'
    const isPending = () => !isDone()

    const label = () => {
        const name = toolName()
        const inp = props.part.input as Record<string, unknown> | undefined

        switch (name) {
            case 'create_script': {
                const path = inp?.path as string | undefined
                if (isError()) return `Failed to create ${path ?? 'script'}`
                if (isDone()) return `Created ${path ?? 'script'}`
                return `Creating ${path ?? 'script'}…`
            }
            case 'get_scene':
                if (isDone()) return 'Retrieved scene'
                return 'Reading scene…'
            case 'add_mesh': {
                const t = inp?.type as string | undefined
                if (isError()) return `Failed to add ${t ?? 'mesh'}`
                if (isDone()) return `Added ${t ?? 'mesh'}`
                return `Adding ${t ?? 'mesh'}…`
            }
            case 'add_light': {
                const t = inp?.type as string | undefined
                if (isError()) return `Failed to add ${t ?? 'light'} light`
                if (isDone()) return `Added ${t ?? 'light'} light`
                return `Adding ${t ?? 'light'} light…`
            }
            case 'update_node': {
                const n = inp?.name as string | undefined
                if (isError()) return `Failed to update "${n ?? 'node'}"`
                if (isDone()) return `Updated "${n ?? 'node'}"`
                return `Updating "${n ?? 'node'}"…`
            }
            case 'delete_node': {
                const n = inp?.name as string | undefined
                if (isError()) return `Failed to delete "${n ?? 'node'}"`
                if (isDone()) return `Deleted "${n ?? 'node'}"`
                return `Deleting "${n ?? 'node'}"…`
            }
            case 'create_group': {
                const n = inp?.name as string | undefined
                if (isError()) return `Failed to create group "${n ?? 'group'}"`
                if (isDone()) return `Created group "${n ?? 'group'}"`
                return `Creating group "${n ?? 'group'}"…`
            }
            case 'set_parent': {
                const n = inp?.node as string | undefined
                const p = inp?.parent as string | undefined
                if (isError()) return `Failed to set parent of "${n ?? 'node'}"`
                if (isDone())
                    return p
                        ? `Parented "${n}" under "${p}"`
                        : `Unparented "${n}"`
                return `Setting parent of "${n ?? 'node'}"…`
            }
            case 'bulk_scene': {
                const ops = inp?.operations as unknown[] | undefined
                const count = ops?.length ?? 0
                if (isError()) return `Bulk operation failed (${count} ops)`
                if (isDone()) return `Completed ${count} operations`
                return `Running ${count} operations…`
            }
            case 'list_scripts':
                if (isDone()) return 'Listed scripts'
                return 'Listing scripts…'
            case 'attach_script': {
                const s = inp?.script as string | undefined
                const n = inp?.node as string | undefined
                if (isError()) return `Failed to attach ${s ?? 'script'}`
                if (isDone())
                    return `Attached ${s ?? 'script'} to "${n ?? 'node'}"`
                return `Attaching ${s ?? 'script'}…`
            }
            case 'detach_script': {
                const s = inp?.script as string | undefined
                const n = inp?.node as string | undefined
                if (isError()) return `Failed to detach ${s ?? 'script'}`
                if (isDone())
                    return `Detached ${s ?? 'script'} from "${n ?? 'node'}"`
                return `Detaching ${s ?? 'script'}…`
            }
            case 'read_script': {
                const p = inp?.path as string | undefined
                if (isError()) return `Failed to read ${p ?? 'script'}`
                if (isDone()) return `Read ${p ?? 'script'}`
                return `Reading ${p ?? 'script'}…`
            }
            case 'edit_script': {
                const p = inp?.path as string | undefined
                if (isError()) return `Failed to edit ${p ?? 'script'}`
                if (isDone()) return `Edited ${p ?? 'script'}`
                return `Editing ${p ?? 'script'}…`
            }
            case 'delete_script': {
                const p = inp?.path as string | undefined
                if (isError()) return `Failed to delete ${p ?? 'script'}`
                if (isDone()) return `Deleted ${p ?? 'script'}`
                return `Deleting ${p ?? 'script'}…`
            }
            case 'list_assets':
                if (isDone()) return 'Listed assets'
                return 'Listing assets…'
            case 'import_asset': {
                const p = inp?.path as string | undefined
                if (isError()) return `Failed to import ${p ?? 'model'}`
                if (isDone()) return `Imported ${p ?? 'model'}`
                return `Importing ${p ?? 'model'}…`
            }
            default:
                if (isDone()) return `Ran ${name}`
                return `Running ${name}…`
        }
    }

    return (
        <div
            class={`my-1.5 flex items-center gap-1.5 text-xs rounded px-2 py-1 border ${
                isError()
                    ? 'bg-red-950/40 border-red-800/50 text-red-400'
                    : isDone()
                    ? 'bg-green-950/40 border-green-800/50 text-green-400'
                    : 'bg-gray-900 border-gray-700 text-gray-400'
            }`}
        >
            <Show when={isPending()}>
                <Spinner size="xs" />
            </Show>
            <Show when={isDone() && !isError()}>
                <svg
                    class="w-3 h-3 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2.5"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                    />
                </svg>
            </Show>
            <span>{label()}</span>
        </div>
    )
}

// ── Chat message component ───────────────────────────────────────────

/** Group parts into ordered segments preserving their original position */
type MessageSegment =
    | { kind: 'text'; text: string }
    | { kind: 'tool'; part: ToolUIPart }

function groupPartsInOrder(
    parts: Array<{ type: string; text?: string; [key: string]: unknown }>
): MessageSegment[] {
    const segments: MessageSegment[] = []
    let pendingText = ''

    const flushText = () => {
        if (pendingText) {
            segments.push({ kind: 'text', text: pendingText })
            pendingText = ''
        }
    }

    for (const part of parts) {
        if (isToolPart(part)) {
            flushText()
            segments.push({ kind: 'tool', part: part as unknown as ToolUIPart })
        } else if (part.type === 'text' && part.text) {
            pendingText += part.text
        }
    }
    flushText()

    return segments
}

function ChatMessage(
    props: Readonly<{
        role: string
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>
    }>
) {
    const isUser = () => props.role === 'user'

    const segments = () => groupPartsInOrder(props.parts)
    const hasContent = () =>
        props.parts.some(
            (p) =>
                isToolPart(p) ||
                (p.type === 'text' && (p.text?.length ?? 0) > 0)
        )

    return (
        <Show when={hasContent()}>
            <div
                class={`flex ${
                    isUser() ? 'justify-end' : 'justify-start'
                } mb-3`}
            >
                <div
                    class={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        isUser()
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800 text-gray-100'
                    }`}
                >
                    <Show when={!isUser()}>
                        <span class="text-xs text-gray-400 font-medium mb-1 block">
                            AI
                        </span>
                    </Show>
                    <For each={segments()}>
                        {(seg) =>
                            seg.kind === 'tool' ? (
                                <ToolCallIndicator part={seg.part} />
                            ) : (
                                <For each={parseContent(seg.text)}>
                                    {(part) =>
                                        part.kind === 'code' ? (
                                            <CodeBlock
                                                lang={part.lang}
                                                code={part.code}
                                            />
                                        ) : (
                                            <div
                                                class="md-content"
                                                innerHTML={part.html}
                                            />
                                        )
                                    }
                                </For>
                            )
                        }
                    </For>
                </div>
            </div>
        </Show>
    )
}

// ── Chat history list item ──────────────────────────────────────────

function HistoryItem(
    props: Readonly<{
        session: ChatSession
        isActive: boolean
        onSelect: () => void
        onDelete: () => void
    }>
) {
    return (
        <div
            class={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${
                props.isActive ? 'bg-gray-700/70' : 'hover:bg-gray-800/60'
            }`}
            onClick={props.onSelect}
        >
            <div class="flex-1 min-w-0">
                <div class="text-gray-200 truncate text-xs">
                    {props.session.title}
                </div>
                <div class="text-gray-500 text-[10px]">
                    {formatSessionDate(props.session.updatedAt)}
                    {' · '}
                    {props.session.messages.length} msg
                    {props.session.messages.length !== 1 ? 's' : ''}
                </div>
            </div>
            <button
                class="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5"
                onClick={(e) => {
                    e.stopPropagation()
                    props.onDelete()
                }}
                title="Delete chat"
                type="button"
            >
                <svg
                    class="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                </svg>
            </button>
        </div>
    )
}

// ── Main AI Panel ────────────────────────────────────────────────────

export default function AIPanel(
    props: Readonly<{
        scene: Accessor<Scene | undefined>
        selectedNode: Accessor<Node | undefined>
        setSelectedNode: (node: Node | undefined) => void
        setNodeTick: Setter<number>
        scheduleAutoSave: () => void
    }>
) {
    const [input, setInput] = createSignal('')
    const [showHistory, setShowHistory] = createSignal(false)
    const [sessions, setSessions] = createSignal<ChatSession[]>([])
    const recentAutoSendKeys: string[] = []
    let roundTripCount = 0
    const MAX_ROUND_TRIPS = 12
    const consecutiveErrorCounts = new Map<string, number>()
    const MAX_CONSECUTIVE_ERRORS = 3
    const [activeChatId, setActiveChatId] = makePersisted(
        createSignal(generateChatId()),
        { name: 'slop-ai-active-chat' }
    )

    let scrollContainer: HTMLDivElement | undefined
    let inputRef: HTMLTextAreaElement | undefined

    const chat = useChat({
        sendAutomaticallyWhen: ({ messages }) => {
            // After all tool outputs are resolved, automatically send
            // the updated messages back so the AI can respond with text.
            // But DON'T re-send if the AI already generated text after
            // the tool calls (that means the round-trip is complete).
            const last = messages.at(-1)
            if (!last || last.role !== 'assistant') return false

            const parts = last.parts as Array<{
                type: string
                text?: string
            }>
            const toolParts = parts.filter((p) =>
                p.type.startsWith('tool-')
            ) as unknown as ToolUIPart[]
            if (toolParts.length === 0) return false

            const allResolved = toolParts.every(
                (t) =>
                    t.state === 'output-available' || t.state === 'output-error'
            )
            if (!allResolved) return false

            // Check if there's text AFTER the last tool part — if so,
            // the AI already responded and we must not loop
            const lastToolIdx = parts.reduce(
                (max, p, i) => (p.type.startsWith('tool-') ? i : max),
                -1
            )
            const hasTextAfterTools = parts
                .slice(lastToolIdx + 1)
                .some((p) => p.type === 'text' && (p.text?.length ?? 0) > 0)

            if (hasTextAfterTools) return false

            // Build a key representing the exact tool call pattern
            const toolKey = toolParts
                .map((t) => {
                    const name = getToolNameFromPart(t)
                    return `${name}:${JSON.stringify(t.input ?? {})}`
                })
                .sort((a, b) => a.localeCompare(b))
                .join('|')

            // If the model produced narration text BEFORE/alongside tools
            // and this tool pattern was already auto-sent, the model is
            // stuck in a describe-then-call loop — stop it.
            const hasAnyText = parts.some(
                (p) => p.type === 'text' && (p.text?.trim().length ?? 0) > 0
            )
            if (hasAnyText && recentAutoSendKeys.includes(toolKey)) return false

            // Block if this exact tool pattern was the immediately
            // previous auto-send (consecutive duplicate)
            if (
                recentAutoSendKeys.length > 0 &&
                recentAutoSendKeys.at(-1) === toolKey
            )
                return false

            // Block if this pattern has appeared 2+ times in the
            // recent sliding window
            const repeatCount = recentAutoSendKeys.filter(
                (k) => k === toolKey
            ).length
            if (repeatCount >= 2) return false

            // Track consecutive errors per tool+path to stop loops
            // where the model keeps retrying with slight variations
            for (const t of toolParts) {
                const name = getToolNameFromPart(t)
                const inp = t.input as Record<string, unknown> | undefined
                const errorKey = `${name}:${(inp?.path as string) ?? ''}`
                if (t.state === 'output-error') {
                    const count =
                        (consecutiveErrorCounts.get(errorKey) ?? 0) + 1
                    consecutiveErrorCounts.set(errorKey, count)
                    if (count >= MAX_CONSECUTIVE_ERRORS) return false
                } else {
                    consecutiveErrorCounts.set(errorKey, 0)
                }
            }

            // Hard cap as a safety net
            if (roundTripCount >= MAX_ROUND_TRIPS) return false
            roundTripCount++

            recentAutoSendKeys.push(toolKey)
            if (recentAutoSendKeys.length > 8) recentAutoSendKeys.shift()

            return true
        },
    })

    // ── Persistence helpers ─────────────────────────────────────────

    const refreshSessions = async () => {
        setSessions(await getAllSessions())
    }

    const saveCurrentChat = async () => {
        const id = activeChatId()
        const messages = chat.messages
        if (!id || messages.length === 0) return

        const createdAt = untrack(
            () => sessions().find((s) => s.id === id)?.createdAt ?? Date.now()
        )

        await saveSession({
            id,
            title: titleFromMessages(messages),
            messages: JSON.parse(JSON.stringify(messages)),
            createdAt,
            updatedAt: Date.now(),
        })
        await refreshSessions()
    }

    // ── Lifecycle ───────────────────────────────────────────────────

    onMount(async () => {
        const allSessions = await getAllSessions()
        setSessions(allSessions)

        const id = activeChatId()
        if (id) {
            const session = allSessions.find((s) => s.id === id)
            if (session) {
                chat.setMessages(session.messages)
            }
        }

        if (!activeChatId()) {
            setActiveChatId(generateChatId())
        }

        inputRef?.focus()
    })

    // Auto-save after working completes
    createEffect((prev: boolean | undefined) => {
        const working = isWorking()
        const id = activeChatId()
        const msgCount = chat.messages.length

        // Save when working just finished (was working, now idle)
        if (prev === true && !working && id && msgCount > 0) {
            saveCurrentChat()
        }

        return working
    })

    // Auto-scroll when messages update
    createEffect(() => {
        const _msgs = chat.messages
        const el = scrollContainer
        if (el) {
            requestAnimationFrame(() => {
                el.scrollTop = el.scrollHeight
            })
        }
    })

    // ── Tool call handling ─────────────────────────────────────────

    const handledToolCalls = new Set<string>()

    const typeCheckContent = async (content: string): Promise<string[]> => {
        try {
            const res = await fetch('/api/typecheck', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            })
            const { errors } = (await res.json()) as { errors: string[] }
            return errors
        } catch {
            return []
        }
    }

    const executeCreateScript = async (args: {
        path: string
        content: string
    }): Promise<string> => {
        const store = getAssetStore()
        const parts = args.path.split('/')
        const fileName = parts.at(-1)!

        // Ensure parent directories exist
        let parentPath = ''
        for (let i = 0; i < parts.length - 1; i++) {
            const dirName = parts[i]
            const dirPath = parentPath ? `${parentPath}/${dirName}` : dirName
            if (!store.findNode(store.tree(), dirPath)) {
                store.addNode(parentPath, dirName, 'folder')
            }
            parentPath = dirPath
        }

        // Create file node if it doesn't exist
        if (!store.findNode(store.tree(), args.path)) {
            store.addNode(parentPath, fileName, 'file')
        }

        // Save content as blob
        await setBlob(
            args.path,
            new Blob([args.content], { type: 'text/plain' })
        )

        // Reload in script editor if this file is currently open
        if (openScript()?.path === args.path) {
            await openScriptFile(args.path)
        }

        // Type-check the script and report errors back to the AI
        const errors = await typeCheckContent(args.content)
        if (errors.length > 0) {
            return `Script created at "${
                args.path
            }" but has TypeScript errors:\n${errors.join(
                '\n'
            )}\n\nFix these errors with edit_script.`
        }

        return `Script created at "${args.path}"`
    }

    const executeGetScene = (): string => {
        const s = props.scene()
        if (!s) throw new Error('Scene not initialized')
        return JSON.stringify(getSceneSnapshot(s), null, 2)
    }

    const executeAddMesh = (args: AddMeshOptions): string => {
        const s = props.scene()
        if (!s) throw new Error('Scene not initialized')
        const mesh = addMeshToScene(s, args)
        props.setSelectedNode(mesh)
        props.setNodeTick((t) => t + 1)
        return `Created ${args.type} mesh "${mesh.name}"`
    }

    const executeAddLight = (args: AddLightOptions): string => {
        const s = props.scene()
        if (!s) throw new Error('Scene not initialized')
        const light = addLightToScene(s, args)
        props.setSelectedNode(light)
        props.setNodeTick((t) => t + 1)
        return `Created ${args.type} light "${light.name}"`
    }

    const executeUpdateNode = (args: UpdateNodeOptions): string => {
        const s = props.scene()
        if (!s) throw new Error('Scene not initialized')
        updateNodeInScene(s, args)
        props.setNodeTick((t) => t + 1)
        const fields = Object.keys(args)
            .filter((k) => k !== 'name')
            .join(', ')
        return `Updated "${args.name}" (${fields})`
    }

    const executeDeleteNode = (args: { name: string }): string => {
        const s = props.scene()
        if (!s) throw new Error('Scene not initialized')
        const node = s.getNodeByName(args.name)
        if (props.selectedNode() === node) {
            props.setSelectedNode(undefined)
        }
        deleteNodeFromScene(s, args.name)
        props.setNodeTick((t) => t + 1)
        return `Deleted node "${args.name}"`
    }

    const executeCreateGroup = (args: CreateGroupOptions): string => {
        const s = props.scene()
        if (!s) throw new Error('Scene not initialized')
        const group = createGroupInScene(s, args)
        props.setSelectedNode(group)
        props.setNodeTick((t) => t + 1)
        return `Created group "${group.name}"`
    }

    const executeSetParent = (args: {
        node: string
        parent: string | null
    }): string => {
        const s = props.scene()
        if (!s) throw new Error('Scene not initialized')
        setParentInScene(s, args.node, args.parent)
        props.setNodeTick((t) => t + 1)
        return args.parent
            ? `Set parent of "${args.node}" to "${args.parent}"`
            : `Unparented "${args.node}"`
    }

    const executeBulkScene = (args: {
        operations: BulkOperation[]
    }): string => {
        const s = props.scene()
        if (!s) throw new Error('Scene not initialized')
        const results = executeBulkOperations(s, args.operations)
        props.setNodeTick((t) => t + 1)
        const succeeded = results.filter((r) => r.success).length
        const failed = results.filter((r) => !r.success).length
        const summary = results
            .map((r) => (r.success ? `OK: ${r.message}` : `FAIL: ${r.message}`))
            .join('\n')
        return `Bulk: ${succeeded} succeeded, ${failed} failed\n${summary}`
    }

    const executeListScripts = (): string => {
        const store = getAssetStore()
        const SCRIPT_EXT = ['.ts', '.tsx', '.js', '.jsx']
        const allFiles = store.collectFilePaths(store.tree())
        const scripts = allFiles.filter((p) =>
            SCRIPT_EXT.some((ext) => p.toLowerCase().endsWith(ext))
        )
        if (scripts.length === 0) return 'No scripts found in asset store.'
        return JSON.stringify(scripts)
    }

    const executeAttachScript = (args: {
        node: string
        script: string
    }): string => {
        const s = props.scene()
        if (!s) throw new Error('Scene not initialized')
        const node = s.getNodeByName(args.node)
        if (!node) throw new Error(`Node "${args.node}" not found`)
        if (!node.metadata) node.metadata = {}
        const meta = node.metadata as Record<string, unknown>
        const scripts = (meta.scripts as string[] | undefined) ?? []
        if (scripts.includes(args.script)) {
            return `"${args.script}" is already attached to "${args.node}"`
        }
        meta.scripts = [...scripts, args.script]
        props.setNodeTick((t) => t + 1)
        return `Attached "${args.script}" to "${args.node}"`
    }

    const executeDetachScript = (args: {
        node: string
        script: string
    }): string => {
        const s = props.scene()
        if (!s) throw new Error('Scene not initialized')
        const node = s.getNodeByName(args.node)
        if (!node) throw new Error(`Node "${args.node}" not found`)
        const meta = node.metadata as { scripts?: string[] } | undefined
        const scripts = meta?.scripts ?? []
        if (!scripts.includes(args.script)) {
            throw new Error(
                `"${args.script}" is not attached to "${args.node}"`
            )
        }
        ;(node.metadata as Record<string, unknown>).scripts = scripts.filter(
            (s) => s !== args.script
        )
        props.setNodeTick((t) => t + 1)
        return `Detached "${args.script}" from "${args.node}"`
    }

    const executeReadScript = async (args: {
        path: string
    }): Promise<string> => {
        const blob = await getBlob(args.path)
        if (!blob) throw new Error(`Script "${args.path}" not found`)
        return await blob.text()
    }

    const executeEditScript = async (args: {
        path: string
        old_string: string
        new_string: string
    }): Promise<string> => {
        const blob = await getBlob(args.path)
        if (!blob) throw new Error(`Script "${args.path}" not found`)
        const content = await blob.text()

        // Normalize line endings so \r\n vs \n mismatches don't cause false negatives
        const normalizedContent = content.replace(/\r\n/g, '\n')
        const normalizedOld = args.old_string.replace(/\r\n/g, '\n')

        if (!normalizedContent.includes(normalizedOld)) {
            throw new Error(
                `Could not find the specified text in "${args.path}". Make sure you use read_script first and copy the exact text including whitespace. Current file content:\n\`\`\`\n${normalizedContent}\n\`\`\``
            )
        }
        // Use a function replacement to avoid $-sequence interpretation in new_string
        const updated = normalizedContent.replace(
            normalizedOld,
            () => args.new_string
        )
        await setBlob(args.path, new Blob([updated], { type: 'text/plain' }))
        // Reload in script editor if this file is currently open
        if (openScript()?.path === args.path) {
            await openScriptFile(args.path)
        }

        // Type-check the updated script and report errors back to the AI
        const errors = await typeCheckContent(updated)
        if (errors.length > 0) {
            return `Edited "${
                args.path
            }" but it has TypeScript errors:\n${errors.join(
                '\n'
            )}\n\nFix these errors with edit_script.`
        }

        return `Edited "${args.path}"`
    }

    const executeDeleteScript = async (args: {
        path: string
    }): Promise<string> => {
        // Detach from all nodes that reference this script
        const s = props.scene()
        if (s) {
            const allNodes = [
                ...s.meshes,
                ...s.lights,
                ...s.cameras,
                ...s.transformNodes,
            ]
            for (const node of allNodes) {
                const meta = node.metadata as { scripts?: string[] } | undefined
                if (meta?.scripts?.includes(args.path)) {
                    meta.scripts = meta.scripts.filter((p) => p !== args.path)
                }
            }
        }

        // Delete blob and asset tree node
        await deleteBlob(args.path)
        const store = getAssetStore()
        if (store.findNode(store.tree(), args.path)) {
            store.deleteNode(args.path)
        }

        props.setNodeTick((t) => t + 1)
        return `Deleted script "${args.path}"`
    }

    const MODEL_EXT = ['.glb', '.gltf', '.obj']

    const executeListAssets = (): string => {
        const store = getAssetStore()
        const allFiles = store.collectFilePaths(store.tree())
        const models = allFiles.filter((p) =>
            MODEL_EXT.some((ext) => p.toLowerCase().endsWith(ext))
        )
        if (models.length === 0) return 'No model assets found in asset store.'
        return JSON.stringify(models)
    }

    const resolveAsset: AssetResolver = (path) => getBlob(path)

    const executeImportAsset = async (args: {
        path: string
        position?: [number, number, number]
        scale?: [number, number, number]
    }): Promise<string> => {
        const s = props.scene()
        if (!s) throw new Error('Scene not initialized')

        const store = getAssetStore()
        const node = store.findNode(store.tree(), args.path)
        if (!node || node.type !== 'file') {
            throw new Error(`Asset "${args.path}" not found in asset store`)
        }

        const blob = await getBlob(args.path)
        if (!blob) throw new Error(`Could not read asset "${args.path}"`)

        const filename = args.path.slice(args.path.lastIndexOf('/') + 1)
        const lastSlash = args.path.lastIndexOf('/')
        const assetDir = lastSlash > 0 ? args.path.slice(0, lastSlash) : ''

        const root = await importModelToScene(
            s,
            blob,
            filename,
            assetDir,
            resolveAsset
        )

        if (args.position) {
            root.position.set(
                args.position[0],
                args.position[1],
                args.position[2]
            )
        }
        if (args.scale) {
            root.scaling.set(args.scale[0], args.scale[1], args.scale[2])
        }

        props.setSelectedNode(root)
        props.setNodeTick((t) => t + 1)
        return `Imported "${args.path}" as "${root.name}"`
    }

    const executeTool = async (
        toolName: string,
        input: unknown
    ): Promise<string> => {
        switch (toolName) {
            case 'create_script':
                return executeCreateScript(
                    input as { path: string; content: string }
                )
            case 'get_scene':
                return executeGetScene()
            case 'add_mesh':
                return executeAddMesh(input as AddMeshOptions)
            case 'add_light':
                return executeAddLight(input as AddLightOptions)
            case 'update_node':
                return executeUpdateNode(input as UpdateNodeOptions)
            case 'delete_node':
                return executeDeleteNode(input as { name: string })
            case 'create_group':
                return executeCreateGroup(input as CreateGroupOptions)
            case 'set_parent':
                return executeSetParent(
                    input as { node: string; parent: string | null }
                )
            case 'bulk_scene':
                return executeBulkScene(
                    input as { operations: BulkOperation[] }
                )
            case 'list_scripts':
                return executeListScripts()
            case 'attach_script':
                return executeAttachScript(
                    input as { node: string; script: string }
                )
            case 'detach_script':
                return executeDetachScript(
                    input as { node: string; script: string }
                )
            case 'read_script':
                return executeReadScript(input as { path: string })
            case 'edit_script':
                return executeEditScript(
                    input as {
                        path: string
                        old_string: string
                        new_string: string
                    }
                )
            case 'delete_script':
                return executeDeleteScript(input as { path: string })
            case 'list_assets':
                return executeListAssets()
            case 'import_asset':
                return executeImportAsset(
                    input as {
                        path: string
                        position?: [number, number, number]
                        scale?: [number, number, number]
                    }
                )
            default:
                throw new Error(`Unknown tool: ${toolName}`)
        }
    }

    // Watch for tool calls in messages and execute them
    createEffect(() => {
        for (const msg of chat.messages) {
            if (msg.role !== 'assistant') continue
            for (const part of msg.parts) {
                if (!isToolPart(part)) continue

                const toolPart = part as unknown as ToolUIPart
                if (toolPart.state !== 'input-available') continue
                if (handledToolCalls.has(toolPart.toolCallId)) continue
                handledToolCalls.add(toolPart.toolCallId)

                const name = getToolNameFromPart(toolPart)

                executeTool(
                    name,
                    (toolPart.input as Record<string, unknown>) ?? {}
                )
                    .then((result) => {
                        chat.addToolOutput({
                            tool: name,
                            toolCallId: toolPart.toolCallId,
                            output: result,
                        })
                        props.scheduleAutoSave()
                    })
                    .catch((err) => {
                        chat.addToolOutput({
                            tool: name,
                            toolCallId: toolPart.toolCallId,
                            state: 'output-error' as const,
                            errorText:
                                err instanceof Error
                                    ? err.message
                                    : 'Unknown error',
                        })
                    })
            }
        }
    })

    // ── Actions ─────────────────────────────────────────────────────

    const startNewChat = async () => {
        if (chat.messages.length > 0) {
            await saveCurrentChat()
        }

        const newId = generateChatId()
        setActiveChatId(newId)
        chat.setMessages([])
        roundTripCount = 0
        recentAutoSendKeys.length = 0
        consecutiveErrorCounts.clear()
        setShowHistory(false)
        inputRef?.focus()
    }

    const switchToChat = async (sessionId: string) => {
        if (sessionId === activeChatId()) {
            setShowHistory(false)
            return
        }

        if (chat.messages.length > 0) {
            await saveCurrentChat()
        }

        const session = await getSession(sessionId)
        if (session) {
            setActiveChatId(sessionId)
            chat.setMessages(session.messages)
        }
        setShowHistory(false)
        inputRef?.focus()
    }

    const handleDeleteChat = async (sessionId: string) => {
        await deleteSession(sessionId)
        await refreshSessions()

        if (sessionId === activeChatId()) {
            const remaining = sessions()
            if (remaining.length > 0) {
                await switchToChat(remaining[0].id)
            } else {
                const newId = generateChatId()
                setActiveChatId(newId)
                chat.setMessages([])
            }
        }
    }

    // Derived: true when streaming OR executing tool calls
    const hasPendingToolCalls = () => {
        const msgs = chat.messages
        for (let i = msgs.length - 1; i >= 0; i--) {
            const msg = msgs[i]
            if (msg.role !== 'assistant') continue
            for (const part of msg.parts) {
                if (
                    isToolPart(part) &&
                    (part as unknown as ToolUIPart).state !==
                        'output-available' &&
                    (part as unknown as ToolUIPart).state !== 'output-error'
                ) {
                    return true
                }
            }
            break // only check the last assistant message
        }
        return false
    }

    const isWorking = () =>
        chat.status === 'streaming' ||
        chat.status === 'submitted' ||
        hasPendingToolCalls()

    const handleSubmit = async (e: Event) => {
        e.preventDefault()
        const content = input().trim()
        if (!content || isWorking()) return

        setInput('')
        roundTripCount = 0
        recentAutoSendKeys.length = 0
        consecutiveErrorCounts.clear()
        await chat.sendMessage({ text: content })
    }

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit(e)
        }
    }

    // ── Render ──────────────────────────────────────────────────────

    return (
        <div class="flex flex-col h-full">
            {/* Header */}
            <div class="flex items-center justify-between px-2 pb-1 shrink-0 gap-1">
                <span class="text-xs text-gray-400 font-medium truncate">
                    {showHistory() ? 'Chat History' : 'AI Assistant'}
                </span>
                <div class="flex items-center gap-0.5 shrink-0">
                    <Show when={!showHistory()}>
                        <button
                            class="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors"
                            onClick={startNewChat}
                            title="New Chat"
                            type="button"
                        >
                            <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M12 4.5v15m7.5-7.5h-15"
                                />
                            </svg>
                        </button>
                    </Show>
                    <button
                        class={`p-1 rounded transition-colors ${
                            showHistory()
                                ? 'text-blue-400 bg-gray-700/50'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                        }`}
                        onClick={() => setShowHistory((v) => !v)}
                        title={showHistory() ? 'Back to chat' : 'Chat history'}
                        type="button"
                    >
                        <svg
                            class="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            {/* History view */}
            <Show when={showHistory()}>
                <div class="flex-1 min-h-0 overflow-y-auto px-1 py-1 ai-scrollbar">
                    <Show
                        when={sessions().length > 0}
                        fallback={
                            <div class="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                                <span class="text-xs">No saved chats</span>
                            </div>
                        }
                    >
                        <For each={sessions()}>
                            {(session) => (
                                <HistoryItem
                                    session={session}
                                    isActive={session.id === activeChatId()}
                                    onSelect={() => switchToChat(session.id)}
                                    onDelete={() =>
                                        handleDeleteChat(session.id)
                                    }
                                />
                            )}
                        </For>
                    </Show>
                </div>

                {/* New chat button at bottom of history */}
                <div class="shrink-0 px-2 pb-2 pt-1">
                    <Button
                        variant="outline"
                        size="sm"
                        fullWidth
                        onClick={startNewChat}
                    >
                        New Chat
                    </Button>
                </div>
            </Show>

            {/* Chat view (messages + input) */}
            <Show when={!showHistory()}>
                {/* Messages */}
                <div
                    ref={scrollContainer}
                    class="flex-1 min-h-0 overflow-y-auto px-2 py-1 ai-scrollbar"
                >
                    <Show
                        when={chat.messages.length > 0}
                        fallback={
                            <div class="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
                                <svg
                                    class="w-8 h-8 text-gray-600"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    stroke-width="1.5"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                                    />
                                </svg>
                                <span class="text-xs">Ask the AI anything</span>
                            </div>
                        }
                    >
                        <For each={chat.messages}>
                            {(message) => (
                                <ChatMessage
                                    role={message.role}
                                    parts={
                                        message.parts as Array<{
                                            type: string
                                            text?: string
                                        }>
                                    }
                                />
                            )}
                        </For>

                        {/* Working indicator (streaming or tool execution) */}
                        <Show when={isWorking()}>
                            <div class="flex justify-start mb-3">
                                <div class="flex items-center gap-2 text-gray-400 text-xs px-3 py-1">
                                    <Spinner size="xs" />
                                    <span>
                                        {hasPendingToolCalls() &&
                                        chat.status !== 'streaming'
                                            ? 'Running tools…'
                                            : 'Generating…'}
                                    </span>
                                </div>
                            </div>
                        </Show>
                    </Show>
                </div>

                {/* Error */}
                <Show when={chat.error}>
                    <div class="mx-2 mb-1 rounded bg-red-900/50 border border-red-700 px-2 py-1 text-xs text-red-300">
                        {chat.error?.message ?? 'An error occurred'}
                    </div>
                </Show>

                {/* Input */}
                <form
                    class="shrink-0 flex gap-1.5 px-2 pb-2 pt-1"
                    onSubmit={handleSubmit}
                >
                    <textarea
                        ref={inputRef}
                        class="
                            flex-1 rounded-md px-3 py-2 text-sm resize-none
                            bg-gray-900 text-gray-100
                            border border-gray-700
                            placeholder:text-gray-500
                            focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500
                            disabled:opacity-50 disabled:cursor-not-allowed
                        "
                        rows={1}
                        placeholder="Ask the AI…"
                        value={input()}
                        onInput={(e) => setInput(e.currentTarget.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isWorking()}
                    />
                    <Show
                        when={!isWorking()}
                        fallback={
                            <Button
                                variant="danger"
                                size="sm"
                                type="button"
                                onClick={() => chat.stop()}
                            >
                                Stop
                            </Button>
                        }
                    >
                        <Button
                            variant="primary"
                            size="sm"
                            type="submit"
                            disabled={!input().trim()}
                        >
                            Send
                        </Button>
                    </Show>
                </form>
            </Show>
        </div>
    )
}
