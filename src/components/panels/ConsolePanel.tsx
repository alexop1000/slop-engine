import { For, Show, createEffect, createMemo } from 'solid-js'
import { logs, clearLogs, type LogEntry } from '../../scripting/consoleStore'
import { requestFixError } from '../../aiRequestStore'
import { Button } from '../ui'

function formatArg(arg: unknown): string {
    if (arg === null) return 'null'
    if (arg === undefined) return 'undefined'
    if (typeof arg === 'string') return arg
    if (typeof arg === 'object') {
        try {
            return JSON.stringify(arg, null, 2)
        } catch {
            return String(arg)
        }
    }
    return String(arg)
}

const levelColors: Record<LogEntry['level'], string> = {
    log: 'text-gray-300',
    warn: 'text-yellow-400',
    error: 'text-red-400',
}

type DeduplicatedEntry = {
    level: LogEntry['level']
    message: string
    count: number
}

function deduplicateLogs(entries: LogEntry[]): DeduplicatedEntry[] {
    const result: DeduplicatedEntry[] = []
    for (const entry of entries) {
        const message = entry.args.map(formatArg).join(' ')
        const last = result.at(-1)
        if (last?.level === entry.level && last.message === message) {
            last.count++
        } else {
            result.push({ level: entry.level, message, count: 1 })
        }
    }
    return result
}

export default function ConsolePanel() {
    let scrollContainer: HTMLDivElement | undefined

    const deduplicatedLogs = createMemo(() => deduplicateLogs(logs()))

    // Auto-scroll to bottom when new logs arrive
    createEffect(() => {
        logs() // subscribe
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight
        }
    })

    return (
        <div class="flex flex-col h-full">
            <div class="flex items-center justify-between px-1 pb-1 shrink-0">
                <Show when={logs().length > 0}>
                    <Button variant="ghost" size="sm" onClick={clearLogs}>
                        Clear
                    </Button>
                </Show>
            </div>
            <div
                ref={scrollContainer}
                class="flex-1 min-h-0 overflow-y-auto font-mono text-xs"
            >
                <Show
                    when={logs().length > 0}
                    fallback={
                        <p class="text-gray-500 text-xs p-2">
                            No log output yet. Use{' '}
                            <code class="text-gray-400">this.log()</code> in
                            scripts.
                        </p>
                    }
                >
                    <For each={deduplicatedLogs()}>
                        {(entry) => (
                            <div
                                class={`px-2 py-0.5 border-b border-gray-700/50 whitespace-pre-wrap break-all flex items-start gap-1 ${
                                    levelColors[entry.level]
                                }`}
                            >
                                <span class="flex-1 min-w-0">
                                    {entry.message}
                                    {entry.count > 1 ? (
                                        <span class="text-gray-500">
                                            {' '}
                                            ({entry.count})
                                        </span>
                                    ) : null}
                                </span>
                                <Show when={entry.level === 'error'}>
                                    <button
                                        type="button"
                                        class="shrink-0 p-0.5 rounded text-gray-500 hover:text-blue-400 hover:bg-gray-700/50 transition-colors"
                                        title="Fix with AI"
                                        onClick={() =>
                                            requestFixError(entry.message)
                                        }
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
                                                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                                            />
                                        </svg>
                                    </button>
                                </Show>
                            </div>
                        )}
                    </For>
                </Show>
            </div>
        </div>
    )
}
