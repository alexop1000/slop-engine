import { For, Show, createEffect } from 'solid-js'
import { logs, clearLogs, type LogEntry } from '../../scripting/consoleStore'
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

export default function ConsolePanel() {
    let scrollContainer: HTMLDivElement | undefined

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
                <span class="text-xs text-gray-400">Console</span>
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
                    <For each={logs()}>
                        {(entry) => (
                            <div
                                class={`px-2 py-0.5 border-b border-gray-700/50 whitespace-pre-wrap break-all ${levelColors[entry.level]}`}
                            >
                                {entry.args.map(formatArg).join(' ')}
                            </div>
                        )}
                    </For>
                </Show>
            </div>
        </div>
    )
}
