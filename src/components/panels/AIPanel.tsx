import { useChat } from '@kodehort/ai-sdk-solid'
import { DefaultChatTransport } from 'ai'
import {
    type Accessor,
    type Setter,
    createSignal,
    For,
    Show,
    createEffect,
    onCleanup,
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
import { fixErrorRequest, clearFixErrorRequest } from '../../aiRequestStore'
import { isToolPart, getToolNameFromPart, type ToolUIPart } from './ai/types'
import {
    getSubagent,
    restoreSubagentStates,
    type SubagentState,
} from './ai/subagentStore'
import { ChatMessage } from './ai/ChatMessage'
import { HistoryItem } from './ai/HistoryItem'
import { createToolExecutor } from './ai/toolExecutor'
import { modelSettings } from '../../modelSettingsStore'
import { ModelSettingsPanel } from './ai/ModelSettingsPanel'

const MAX_ROUND_TRIPS = 12
const MAX_CONSECUTIVE_ERRORS = 3

export default function AIPanel(
    props: Readonly<{
        scene: Accessor<import('babylonjs').Scene | undefined>
        selectedNode: Accessor<import('babylonjs').Node | undefined>
        setSelectedNode: (node: import('babylonjs').Node | undefined) => void
        setNodeTick: Setter<number>
        scheduleAutoSave: () => void
        pushUndoState: () => void
        isPlaying: Accessor<boolean>
        requestPlay: () => Promise<void>
        requestStop: () => Promise<void>
        captureCheckpoint: () => Promise<
            import('../../hooks/useEditorEngine').Checkpoint | null
        >
        restoreCheckpoint: (
            cp: import('../../hooks/useEditorEngine').Checkpoint
        ) => Promise<void>
    }>
) {
    const [input, setInput] = createSignal('')
    const [pendingFiles, setPendingFiles] = createSignal<FileList | undefined>(
        undefined
    )
    let fileInputRef: HTMLInputElement | undefined
    type AIPanelView = 'chat' | 'history' | 'settings'
    const [view, setView] = createSignal<AIPanelView>('chat')
    const [sessions, setSessions] = createSignal<ChatSession[]>([])
    const toolErrorCounts = new Map<string, number>()
    let roundTripCount = 0
    const [activeChatId, setActiveChatId] = makePersisted(
        createSignal(generateChatId()),
        { name: 'slop-ai-active-chat' }
    )
    const [openTabs, setOpenTabs] = makePersisted(createSignal<string[]>([]), {
        name: 'slop-ai-open-tabs',
    })

    // Checkpoint system: map from user message index to full checkpoint
    const checkpoints = new Map<
        number,
        import('../../hooks/useEditorEngine').Checkpoint
    >()
    const [checkpointTick, setCheckpointTick] = createSignal(0)
    const [shouldAutoScroll, setShouldAutoScroll] = createSignal(true)

    let scrollContainer: HTMLDivElement | undefined
    let inputRef: HTMLTextAreaElement | undefined

    const chat = useChat({
        transport: new DefaultChatTransport({
            body: () => {
                const node = props.selectedNode()
                const selectedNode = node
                    ? {
                          name: node.name,
                          type:
                              (
                                  node as { getClassName?: () => string }
                              ).getClassName?.() ?? 'Node',
                      }
                    : undefined
                return {
                    modelSettings: modelSettings(),
                    ...(selectedNode && { selectedNode }),
                }
            },
        }),
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
            // No tool calls = model is done naturally
            if (toolParts.length === 0) return false

            // Wait for all tools to finish executing
            const allResolved = toolParts.every(
                (t) =>
                    t.state === 'output-available' || t.state === 'output-error'
            )
            if (!allResolved) return false

            // Don't retry the same tool if it keeps erroring
            for (const t of toolParts) {
                const name = getToolNameFromPart(t)
                const inp = t.input as Record<string, unknown> | undefined
                const errorKey = `${name}:${(inp?.path as string) ?? ''}`
                if (t.state === 'output-error') {
                    const count =
                        (toolErrorCounts.get(errorKey) ?? 0) + 1
                    toolErrorCounts.set(errorKey, count)
                    if (count >= MAX_CONSECUTIVE_ERRORS) return false
                } else {
                    toolErrorCounts.set(errorKey, 0)
                }
            }

            // Hard cap on round trips per user message
            if (roundTripCount >= MAX_ROUND_TRIPS) return false
            roundTripCount++

            return true
        },
    })

    const executeTool = createToolExecutor({
        scene: props.scene,
        selectedNode: props.selectedNode,
        setSelectedNode: props.setSelectedNode,
        setNodeTick: props.setNodeTick,
        pushUndoState: props.pushUndoState,
        isPlaying: props.isPlaying,
        requestPlay: props.requestPlay,
        requestStop: props.requestStop,
        modelSettings,
        messages: () => chat.messages,
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

        const subagentStates: Record<string, SubagentState> = {}
        for (const msg of messages) {
            if (msg.role !== 'assistant') continue
            for (const part of msg.parts ?? []) {
                if (!isToolPart(part)) continue
                const toolPart = part as unknown as ToolUIPart
                const state = getSubagent(toolPart.toolCallId)
                if (state) subagentStates[toolPart.toolCallId] = state
            }
        }

        await saveSession({
            id,
            title: titleFromMessages(messages),
            messages: JSON.parse(JSON.stringify(messages)),
            subagentStates: Object.keys(subagentStates).length
                ? subagentStates
                : undefined,
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

    const isNearBottom = (el: HTMLDivElement) =>
        el.scrollHeight - el.scrollTop - el.clientHeight <= 32

    const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
        const el = scrollContainer
        if (!el) return

        el.scrollTo({ top: el.scrollHeight, behavior })
    }

    const handleScroll = (e: Event & { currentTarget: HTMLDivElement }) => {
        setShouldAutoScroll(isNearBottom(e.currentTarget))
    }

    onMount(async () => {
        const allSessions = await getAllSessions()
        setSessions(allSessions)

        let id = activeChatId()
        if (!id) {
            id = generateChatId()
            setActiveChatId(id)
        }

        setOpenTabs((tabs) => {
            const next = tabs.length > 0 ? [...tabs] : [id!]
            if (!next.includes(id!)) {
                next.unshift(id!)
            }
            return next
        })

        const session = allSessions.find((s) => s.id === id)
        if (session) {
            chat.setMessages(session.messages)
            restoreSubagentStates(session.subagentStates ?? {})
        }

        setShouldAutoScroll(true)
        requestAnimationFrame(() => scrollToBottom())
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
        if (!shouldAutoScroll()) return

        requestAnimationFrame(() => {
            scrollToBottom()
        })
    })

    createEffect(() => {
        if (!shouldAutoScroll() || chat.status !== 'streaming') return

        let frame = 0

        const tick = () => {
            scrollToBottom()
            frame = requestAnimationFrame(tick)
        }

        frame = requestAnimationFrame(tick)

        onCleanup(() => {
            cancelAnimationFrame(frame)
        })
    })

    createEffect(() => {
        const err = fixErrorRequest()
        if (!err) return
        clearFixErrorRequest()
        setView('chat')
        startNewChat().then(async () => {
            const checkpoint = await props.captureCheckpoint()
            const msgIndex = chat.messages.length
            if (checkpoint) {
                checkpoints.set(msgIndex, checkpoint)
                setCheckpointTick((t) => t + 1)
            }
            chat.sendMessage({
                text: `Fix this error:\n\n${err}`,
            })
        })
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
        setOpenTabs((tabs) => [newId, ...tabs])
        setActiveChatId(newId)
        chat.setMessages([])
        restoreSubagentStates({})
        checkpoints.clear()
        setCheckpointTick((t) => t + 1)
        roundTripCount = 0
        toolErrorCounts.clear()
        setView('chat')
        setShouldAutoScroll(true)
        requestAnimationFrame(() => scrollToBottom())
        inputRef?.focus()
    }

    const switchToChat = async (sessionId: string) => {
        if (sessionId === activeChatId()) {
            setView('chat')
            return
        }

        if (chat.messages.length > 0) {
            await saveCurrentChat()
        }

        setOpenTabs((tabs) =>
            tabs.includes(sessionId) ? tabs : [sessionId, ...tabs]
        )

        const session = await getSession(sessionId)
        if (session) {
            setActiveChatId(sessionId)
            chat.setMessages(session.messages)
            restoreSubagentStates(session.subagentStates ?? {})
        }
        checkpoints.clear()
        setCheckpointTick((t) => t + 1)
        setView('chat')
        setShouldAutoScroll(true)
        requestAnimationFrame(() => scrollToBottom())
        inputRef?.focus()
    }

    const switchToTab = (tabId: string) => {
        if (tabId === activeChatId()) return
        switchToChat(tabId)
    }

    const closeTab = async (tabId: string, e: MouseEvent) => {
        e.stopPropagation()
        const currentTabs = openTabs()
        const tabs = currentTabs.filter((id) => id !== tabId)
        if (tabs.length === 0) {
            await startNewChat()
            return
        }
        setOpenTabs(tabs)
        if (tabId === activeChatId()) {
            const idx = currentTabs.indexOf(tabId)
            const nextIdx = Math.min(idx, tabs.length - 1)
            await switchToChat(tabs[nextIdx])
        }
    }

    const handleDeleteChat = async (sessionId: string) => {
        await deleteSession(sessionId)
        await refreshSessions()
        setOpenTabs((tabs) => tabs.filter((id) => id !== sessionId))

        if (sessionId === activeChatId()) {
            const remaining = sessions()
            if (remaining.length > 0) {
                await switchToChat(remaining[0].id)
            } else {
                const newId = generateChatId()
                setOpenTabs([newId])
                setActiveChatId(newId)
                chat.setMessages([])
            }
        }
    }

    const handleSubmit = async (e: Event) => {
        e.preventDefault()
        const content = input().trim()
        const files = pendingFiles()
        if ((!content && !files?.length) || isWorking()) return

        // Capture scene checkpoint before AI starts working
        const checkpoint = await props.captureCheckpoint()
        const msgIndex = chat.messages.length
        if (checkpoint) {
            checkpoints.set(msgIndex, checkpoint)
            setCheckpointTick((t) => t + 1)
        }

        setInput('')
        setPendingFiles(undefined)
        if (fileInputRef) fileInputRef.value = ''
        setShouldAutoScroll(true)
        requestAnimationFrame(() => scrollToBottom())
        roundTripCount = 0
        toolErrorCounts.clear()
        if (files?.length) {
            await chat.sendMessage(
                content ? { text: content, files } : { files }
            )
        } else {
            await chat.sendMessage({ text: content })
        }
    }

    const handleUndoCheckpoint = async (userMsgIndex: number) => {
        const cp = checkpoints.get(userMsgIndex)
        if (!cp) return
        await props.restoreCheckpoint(cp)
        checkpoints.delete(userMsgIndex)
        setCheckpointTick((t) => t + 1)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit(e)
        }
    }

    const getTabTitle = (tabId: string) => {
        if (tabId === activeChatId()) {
            const t = titleFromMessages(chat.messages)
            return t || 'New Chat'
        }
        return sessions().find((s) => s.id === tabId)?.title ?? 'New Chat'
    }

    const syncInputHeight = () => {
        const el = inputRef
        if (!el) return

        el.style.height = '0px'
        el.style.height = `${Math.min(el.scrollHeight, 180)}px`
    }

    const handleInput = (
        e: InputEvent & { currentTarget: HTMLTextAreaElement }
    ) => {
        setInput(e.currentTarget.value)
        syncInputHeight()
    }

    createEffect(() => {
        input()
        requestAnimationFrame(() => syncInputHeight())
    })

    return (
        <div class="flex flex-col h-full">
            <div class="flex items-center justify-between px-2 pb-1 shrink-0 gap-1">
                <span class="text-xs text-gray-400 font-medium truncate">
                    {view() === 'history'
                        ? 'Chat History'
                        : view() === 'settings'
                          ? 'Settings'
                          : 'AI Assistant'}
                </span>
                <div class="flex items-center gap-0.5 shrink-0">
                    <button
                        class={`p-1 rounded transition-colors ${
                            view() === 'history'
                                ? 'text-blue-400 bg-gray-700/50'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                        }`}
                        onClick={() =>
                            setView((v) =>
                                v === 'history' ? 'chat' : 'history'
                            )
                        }
                        title={
                            view() === 'history'
                                ? 'Back to chat'
                                : 'Chat history'
                        }
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
                    <button
                        class={`p-1 rounded transition-colors ${
                            view() === 'settings'
                                ? 'text-blue-400 bg-gray-700/50'
                                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                        }`}
                        onClick={() =>
                            setView((v) =>
                                v === 'settings' ? 'chat' : 'settings'
                            )
                        }
                        title={
                            view() === 'settings' ? 'Back to chat' : 'Settings'
                        }
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
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            <Show when={view() === 'history'}>
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

            <Show when={view() === 'settings'}>
                <div class="flex-1 min-h-0 overflow-y-auto px-2 py-2">
                    <ModelSettingsPanel />
                </div>
            </Show>

            <Show when={view() === 'chat'}>
                <div class="flex items-center gap-0.5 shrink-0 border-b border-gray-700/60 overflow-x-auto">
                    <For each={openTabs()}>
                        {(tabId) => (
                            <div
                                class={`group flex items-center gap-1 px-2 py-1.5 rounded-t text-xs cursor-pointer border-b-2 transition-colors min-w-0 max-w-28 ${
                                    tabId === activeChatId()
                                        ? 'bg-gray-800/80 border-blue-500 text-gray-100'
                                        : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                                }`}
                                onClick={() => switchToTab(tabId)}
                            >
                                <span class="truncate flex-1">
                                    {getTabTitle(tabId)}
                                </span>
                                <button
                                    class="p-0.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700/50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                    onClick={(e) => closeTab(tabId, e)}
                                    title="Close tab"
                                    type="button"
                                >
                                    <svg
                                        class="w-3 h-3"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </For>
                    <button
                        class="p-1.5 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700/50 transition-colors shrink-0"
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
                </div>
                <div
                    ref={scrollContainer}
                    class="flex-1 min-h-0 overflow-y-auto px-2 py-1"
                    onScroll={handleScroll}
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
                            {(message, index) => {
                                const hasToolCalls = () =>
                                    message.role === 'assistant' &&
                                    message.parts?.some((p: { type: string }) =>
                                        p.type.startsWith('tool-')
                                    )

                                const userMsgIndex = () => {
                                    const i = index()
                                    return i > 0 ? i - 1 : -1
                                }

                                const canUndoCheckpoint = () => {
                                    checkpointTick()
                                    return (
                                        hasToolCalls() &&
                                        !isWorking() &&
                                        checkpoints.has(userMsgIndex())
                                    )
                                }

                                return (
                                    <ChatMessage
                                        role={message.role}
                                        parts={
                                            message.parts as Array<{
                                                type: string
                                                text?: string
                                            }>
                                        }
                                        onUndo={
                                            canUndoCheckpoint()
                                                ? () =>
                                                      handleUndoCheckpoint(
                                                          userMsgIndex()
                                                      )
                                                : undefined
                                        }
                                    />
                                )
                            }}
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

                <form class="shrink-0 px-2 pb-2 pt-1" onSubmit={handleSubmit}>
                    <div
                        class="
                            rounded-xl border border-gray-700/80 bg-gray-900
                            transition-[border-color,box-shadow,background-color] duration-150
                            focus-within:border-blue-500/80
                            data-[disabled=true]:opacity-60
                        "
                        data-disabled={isWorking()}
                    >
                        <div class="flex items-end gap-2 px-3 pt-3">
                            <input
                                ref={(el) => {
                                    fileInputRef = el
                                }}
                                type="file"
                                accept="image/*"
                                multiple
                                class="hidden"
                                onChange={(e) => {
                                    const el = e.currentTarget
                                    setPendingFiles(el.files ?? undefined)
                                }}
                            />
                            <button
                                type="button"
                                class="mb-1 p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => fileInputRef?.click()}
                                disabled={isWorking()}
                                title="Attach image"
                            >
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                </svg>
                            </button>
                            <textarea
                                ref={inputRef}
                                class="
                                    min-h-11 max-h-45 flex-1 overflow-y-auto bg-transparent text-sm text-gray-100
                                    placeholder:text-gray-500 resize-none leading-5
                                    focus:outline-none disabled:cursor-not-allowed
                                "
                                rows={1}
                                placeholder="Ask for scene changes, scripts, or fixes…"
                                value={input()}
                                onInput={handleInput}
                                onKeyDown={handleKeyDown}
                                disabled={isWorking()}
                            />
                            <Show
                                when={!isWorking()}
                                fallback={
                                    <button
                                        class="
                                            mb-1 inline-flex h-10 items-center justify-center rounded-lg
                                            border border-red-500/40 bg-red-500/12 px-3 text-xs font-medium text-red-200
                                            transition-colors hover:bg-red-500/18 focus:outline-none focus:ring-2 focus:ring-red-500/50
                                        "
                                        type="button"
                                        onClick={() => chat.stop()}
                                    >
                                        Stop
                                    </button>
                                }
                            >
                                <button
                                    class="
                                        mb-1 inline-flex h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-medium
                                        transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500/60
                                        disabled:cursor-not-allowed disabled:opacity-45
                                        bg-blue-500 text-white hover:bg-blue-400
                                    "
                                    type="submit"
                                    disabled={
                                        !input().trim() &&
                                        !pendingFiles()?.length
                                    }
                                >
                                    <span>Send</span>
                                    <svg
                                        class="h-3.5 w-3.5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M5 12h14m-6-6 6 6-6 6"
                                        />
                                    </svg>
                                </button>
                            </Show>
                        </div>
                        <div class="flex items-center justify-between px-3 pb-2 pt-1 text-[11px] text-gray-500">
                            <span class="flex items-center gap-2">
                                Enter sends. Shift+Enter adds a new line.
                                <Show when={pendingFiles()?.length}>
                                    <span class="text-blue-400">
                                        {pendingFiles()!.length} image
                                        {pendingFiles()!.length === 1 ? '' : 's'}
                                        attached
                                    </span>
                                </Show>
                            </span>
                            <span class="text-gray-400/80">
                                {isWorking() ? 'AI is responding…' : 'Ready'}
                            </span>
                        </div>
                    </div>
                </form>
            </Show>
        </div>
    )
}
