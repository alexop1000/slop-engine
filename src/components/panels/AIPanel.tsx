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
import { makePersisted } from '@solid-primitives/storage'
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
} from '../../chatHistoryStore'
import { isToolPart, getToolNameFromPart, type ToolUIPart } from './ai/types'
import { ChatMessage } from './ai/ChatMessage'
import { HistoryItem } from './ai/HistoryItem'
import { createToolExecutor } from './ai/toolExecutor'

const MAX_ROUND_TRIPS = 12
const MAX_CONSECUTIVE_ERRORS = 3

export default function AIPanel(
    props: Readonly<{
        scene: Accessor<import('babylonjs').Scene | undefined>
        selectedNode: Accessor<import('babylonjs').Node | undefined>
        setSelectedNode: (node: import('babylonjs').Node | undefined) => void
        setNodeTick: Setter<number>
        scheduleAutoSave: () => void
        isPlaying: Accessor<boolean>
        requestPlay: () => Promise<void>
        requestStop: () => Promise<void>
    }>
) {
    const [input, setInput] = createSignal('')
    const [showHistory, setShowHistory] = createSignal(false)
    const [sessions, setSessions] = createSignal<ChatSession[]>([])
    const recentAutoSendKeys: string[] = []
    let roundTripCount = 0
    const consecutiveErrorCounts = new Map<string, number>()
    const [activeChatId, setActiveChatId] = makePersisted(
        createSignal(generateChatId()),
        { name: 'slop-ai-active-chat' }
    )

    let scrollContainer: HTMLDivElement | undefined
    let inputRef: HTMLTextAreaElement | undefined

    const executeTool = createToolExecutor({
        scene: props.scene,
        selectedNode: props.selectedNode,
        setSelectedNode: props.setSelectedNode,
        setNodeTick: props.setNodeTick,
        isPlaying: props.isPlaying,
        requestPlay: props.requestPlay,
        requestStop: props.requestStop,
    })

    const chat = useChat({
        sendAutomaticallyWhen: ({ messages }) => {
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

            const lastToolIdx = parts.reduce(
                (max, p, i) => (p.type.startsWith('tool-') ? i : max),
                -1
            )
            const hasTextAfterTools = parts
                .slice(lastToolIdx + 1)
                .some((p) => p.type === 'text' && (p.text?.length ?? 0) > 0)

            if (hasTextAfterTools) return false

            const toolKey = toolParts
                .map((t) => {
                    const name = getToolNameFromPart(t)
                    return `${name}:${JSON.stringify(t.input ?? {})}`
                })
                .sort((a, b) => a.localeCompare(b))
                .join('|')

            const hasAnyText = parts.some(
                (p) => p.type === 'text' && (p.text?.trim().length ?? 0) > 0
            )
            if (hasAnyText && recentAutoSendKeys.includes(toolKey)) return false

            if (
                recentAutoSendKeys.length > 0 &&
                recentAutoSendKeys.at(-1) === toolKey
            )
                return false

            const repeatCount = recentAutoSendKeys.filter(
                (k) => k === toolKey
            ).length
            if (repeatCount >= 2) return false

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

            if (roundTripCount >= MAX_ROUND_TRIPS) return false
            roundTripCount++

            recentAutoSendKeys.push(toolKey)
            if (recentAutoSendKeys.length > 8) recentAutoSendKeys.shift()

            return true
        },
    })

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

    const handledToolCalls = new Set<string>()

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
            break
        }
        return false
    }

    const isWorking = () =>
        chat.status === 'streaming' ||
        chat.status === 'submitted' ||
        hasPendingToolCalls()

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

    createEffect((prev: boolean | undefined) => {
        const working = isWorking()
        const id = activeChatId()
        const msgCount = chat.messages.length

        if (prev === true && !working && id && msgCount > 0) {
            saveCurrentChat()
        }

        return working
    })

    createEffect(() => {
        const _msgs = chat.messages
        const el = scrollContainer
        if (el) {
            requestAnimationFrame(() => {
                el.scrollTop = el.scrollHeight
            })
        }
    })

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
                    (toolPart.input as Record<string, unknown>) ?? {},
                    toolPart.toolCallId
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

    return (
        <div class="flex flex-col h-full">
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

            <Show when={showHistory()}>
                <div class="flex-1 min-h-0 overflow-y-auto px-1 py-1">
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

            <Show when={!showHistory()}>
                <div
                    ref={scrollContainer}
                    class="flex-1 min-h-0 overflow-y-auto px-2 py-1"
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

                <Show when={chat.error}>
                    <div class="mx-2 mb-1 rounded bg-red-900/50 border border-red-700 px-2 py-1 text-xs text-red-300">
                        {chat.error?.message ?? 'An error occurred'}
                    </div>
                </Show>

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
