import { createSignal, For, Show } from 'solid-js'
import { Spinner } from '../../ui/Spinner'
import type { ToolUIPart } from './types'
import { getToolNameFromPart } from './types'
import {
    getSubagent,
    type SubagentTurn,
    type SubagentToolCall,
} from './subagentStore'
import { parseContent } from './utils'
import { CodeBlock } from './CodeBlock'

function toolLabel(
    name: string,
    inp: Record<string, unknown> | undefined,
    done: boolean,
    error: boolean
): string {
    switch (name) {
        case 'create_script': {
            const path = inp?.path as string | undefined
            if (error) return `Failed to create ${path ?? 'script'}`
            if (done) return `Created ${path ?? 'script'}`
            return `Creating ${path ?? 'script'}...`
        }
        case 'get_scene':
            if (done) return 'Retrieved scene'
            return 'Reading scene...'
        case 'add_mesh': {
            const t = inp?.type as string | undefined
            if (error) return `Failed to add ${t ?? 'mesh'}`
            if (done) return `Added ${t ?? 'mesh'}`
            return `Adding ${t ?? 'mesh'}...`
        }
        case 'add_light': {
            const t = inp?.type as string | undefined
            if (error) return `Failed to add ${t ?? 'light'} light`
            if (done) return `Added ${t ?? 'light'} light`
            return `Adding ${t ?? 'light'} light...`
        }
        case 'update_node': {
            const n = inp?.name as string | undefined
            if (error) return `Failed to update "${n ?? 'node'}"`
            if (done) return `Updated "${n ?? 'node'}"`
            return `Updating "${n ?? 'node'}"...`
        }
        case 'delete_node': {
            const n = inp?.name as string | undefined
            if (error) return `Failed to delete "${n ?? 'node'}"`
            if (done) return `Deleted "${n ?? 'node'}"`
            return `Deleting "${n ?? 'node'}"...`
        }
        case 'create_group': {
            const n = inp?.name as string | undefined
            if (error) return `Failed to create group "${n ?? 'group'}"`
            if (done) return `Created group "${n ?? 'group'}"`
            return `Creating group "${n ?? 'group'}"...`
        }
        case 'set_parent': {
            const n = inp?.node as string | undefined
            const p = inp?.parent as string | undefined
            if (error) return `Failed to set parent of "${n ?? 'node'}"`
            if (done)
                return p ? `Parented "${n}" under "${p}"` : `Unparented "${n}"`
            return `Setting parent of "${n ?? 'node'}"...`
        }
        case 'bulk_scene': {
            const ops = inp?.operations as unknown[] | undefined
            const count = ops?.length ?? 0
            if (error) return `Bulk operation failed (${count} ops)`
            if (done) return `Completed ${count} operations`
            return `Running ${count} operations...`
        }
        case 'list_scripts':
            if (done) return 'Listed scripts'
            return 'Listing scripts...'
        case 'attach_script': {
            const s = inp?.script as string | undefined
            const n = inp?.node as string | undefined
            if (error) return `Failed to attach ${s ?? 'script'}`
            if (done) return `Attached ${s ?? 'script'} to "${n ?? 'node'}"`
            return `Attaching ${s ?? 'script'}...`
        }
        case 'detach_script': {
            const s = inp?.script as string | undefined
            const n = inp?.node as string | undefined
            if (error) return `Failed to detach ${s ?? 'script'}`
            if (done) return `Detached ${s ?? 'script'} from "${n ?? 'node'}"`
            return `Detaching ${s ?? 'script'}...`
        }
        case 'read_script': {
            const p = inp?.path as string | undefined
            if (error) return `Failed to read ${p ?? 'script'}`
            if (done) return `Read ${p ?? 'script'}`
            return `Reading ${p ?? 'script'}...`
        }
        case 'edit_script': {
            const p = inp?.path as string | undefined
            if (error) return `Failed to edit ${p ?? 'script'}`
            if (done) return `Edited ${p ?? 'script'}`
            return `Editing ${p ?? 'script'}...`
        }
        case 'delete_script': {
            const p = inp?.path as string | undefined
            if (error) return `Failed to delete ${p ?? 'script'}`
            if (done) return `Deleted ${p ?? 'script'}`
            return `Deleting ${p ?? 'script'}...`
        }
        case 'list_assets':
            if (done) return 'Listed assets'
            return 'Listing assets...'
        case 'import_asset': {
            const p = inp?.path as string | undefined
            if (error) return `Failed to import ${p ?? 'model'}`
            if (done) return `Imported ${p ?? 'model'}`
            return `Importing ${p ?? 'model'}...`
        }
        case 'save_prefab': {
            const n = inp?.node as string | undefined
            const p = inp?.path as string | undefined
            if (error) return `Failed to save prefab for ${n ?? 'node'}`
            if (done) {
                return p
                    ? `Saved prefab ${p}`
                    : `Saved prefab for ${n ?? 'node'}`
            }
            return `Saving prefab for ${n ?? 'node'}...`
        }
        case 'play_simulation':
            if (error) return 'Failed to start simulation'
            if (done) return 'Started simulation'
            return 'Starting simulation...'
        case 'stop_simulation':
            if (error) return 'Failed to stop simulation'
            if (done) return 'Stopped simulation'
            return 'Stopping simulation...'
        case 'sleep': {
            const sec = inp?.seconds as number | undefined
            if (error) return 'Sleep failed'
            if (done) return `Waited ${sec ?? '?'}s`
            return `Waiting ${sec ?? '?'}s...`
        }
        case 'get_console_logs':
            if (error) return 'Failed to read console'
            if (done) return 'Read console logs'
            return 'Reading console...'
        case 'spawn_agent': {
            const agentType = inp?.agentType as string | undefined
            const task = inp?.task as string | undefined
            const typeLabel =
                agentType === 'script'
                    ? 'Script Writer'
                    : agentType === 'scene'
                      ? 'Scene Builder'
                      : agentType === 'ui'
                        ? 'UI Builder'
                        : 'Agent'
            const short = task
                ? task.length > 50
                    ? task.slice(0, 47) + '...'
                    : task
                : 'task'
            if (error) return `${typeLabel} failed: ${short}`
            if (done) return `${typeLabel} done: ${short}`
            return `${typeLabel} running: ${short}...`
        }
        default:
            if (done) return `Ran ${name}`
            return `Running ${name}...`
    }
}

function formatInputValue(
    key: string,
    value: unknown
): { kind: 'text' | 'code'; text: string } {
    if (
        (key === 'content' || key === 'old_string' || key === 'new_string') &&
        typeof value === 'string' &&
        value.includes('\n')
    ) {
        return { kind: 'code', text: value }
    }
    if (typeof value === 'string') return { kind: 'text', text: value }
    return { kind: 'text', text: JSON.stringify(value, null, 2) }
}

function truncateOutput(text: string, max = 500): string {
    if (text.length <= max) return text
    return text.slice(0, max) + `\n... (${text.length - max} more chars)`
}

function ToolInputOutput(props: Readonly<{ part: ToolUIPart }>) {
    const [showFullOutput, setShowFullOutput] = createSignal(false)
    const input = () =>
        (props.part.input as Record<string, unknown> | undefined) ?? {}
    const output = () => {
        if (props.part.state === 'output-error')
            return props.part.errorText ?? 'Unknown error'
        const o = props.part.output
        if (typeof o === 'string') return o
        if (o != null) return JSON.stringify(o, null, 2)
        return undefined
    }
    const inputKeys = () => Object.keys(input())
    const outputText = () => output()
    const isLongOutput = () => (outputText()?.length ?? 0) > 500

    return (
        <div class="mt-1.5 space-y-2 text-xs">
            <Show when={inputKeys().length > 0}>
                <div>
                    <div class="text-gray-500 font-medium mb-1">Input</div>
                    <div class="space-y-1">
                        <For each={inputKeys()}>
                            {(key) => {
                                const formatted = () =>
                                    formatInputValue(key, input()[key])
                                return (
                                    <Show
                                        when={formatted().kind === 'code'}
                                        fallback={
                                            <div class="flex gap-1.5">
                                                <span class="text-gray-500 shrink-0">
                                                    {key}:
                                                </span>
                                                <span class="text-gray-300 break-all">
                                                    {formatted().text}
                                                </span>
                                            </div>
                                        }
                                    >
                                        <div>
                                            <span class="text-gray-500">
                                                {key}:
                                            </span>
                                            <pre class="mt-0.5 bg-gray-950 rounded p-2 overflow-x-auto text-gray-300 text-[11px] leading-tight max-h-48 overflow-y-auto whitespace-pre-wrap">
                                                {formatted().text}
                                            </pre>
                                        </div>
                                    </Show>
                                )
                            }}
                        </For>
                    </div>
                </div>
            </Show>
            <Show when={outputText()}>
                <div>
                    <div
                        class={`font-medium mb-1 ${
                            props.part.state === 'output-error'
                                ? 'text-red-400'
                                : 'text-gray-500'
                        }`}
                    >
                        {props.part.state === 'output-error'
                            ? 'Error'
                            : 'Output'}
                    </div>
                    <pre
                        class={`rounded p-2 overflow-x-auto text-[11px] leading-tight max-h-60 overflow-y-auto whitespace-pre-wrap ${
                            props.part.state === 'output-error'
                                ? 'bg-red-950/30 text-red-300'
                                : 'bg-gray-950 text-gray-300'
                        }`}
                    >
                        {showFullOutput() || !isLongOutput()
                            ? outputText()
                            : truncateOutput(outputText()!)}
                    </pre>
                    <Show when={isLongOutput()}>
                        <button
                            class="text-blue-400 hover:text-blue-300 text-[10px] mt-0.5"
                            onClick={() => setShowFullOutput((v) => !v)}
                            type="button"
                        >
                            {showFullOutput()
                                ? 'Show less'
                                : 'Show full output'}
                        </button>
                    </Show>
                </div>
            </Show>
        </div>
    )
}

function SubagentToolItem(props: Readonly<{ tc: SubagentToolCall }>) {
    const [expanded, setExpanded] = createSignal(false)
    const label = () =>
        toolLabel(
            props.tc.name,
            props.tc.args,
            props.tc.status === 'done',
            props.tc.status === 'error'
        )

    return (
        <div class="my-0.5">
            <button
                class={`flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 w-full text-left transition-colors ${
                    props.tc.status === 'error'
                        ? 'bg-red-950/30 text-red-400 hover:bg-red-950/50'
                        : props.tc.status === 'done'
                        ? 'bg-green-950/30 text-green-400 hover:bg-green-950/50'
                        : 'bg-gray-800/50 text-gray-400 hover:bg-gray-700/50'
                }`}
                onClick={() => setExpanded((v) => !v)}
                type="button"
            >
                <Show
                    when={props.tc.status !== 'pending'}
                    fallback={<Spinner size="xs" />}
                >
                    <span class="w-3 text-center shrink-0">
                        {props.tc.status === 'done' ? '\u2713' : '\u2717'}
                    </span>
                </Show>
                <span class="truncate flex-1">{label()}</span>
                <svg
                    class={`w-2.5 h-2.5 shrink-0 transition-transform ${
                        expanded() ? 'rotate-90' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2.5"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                </svg>
            </button>
            <Show when={expanded()}>
                <div class="ml-3 mt-1 mb-1 border-l border-gray-700/50 pl-2 space-y-1">
                    <Show when={Object.keys(props.tc.args).length > 0}>
                        <div class="text-gray-500 text-[10px] font-medium">
                            Input
                        </div>
                        <pre class="bg-gray-950 rounded p-1.5 overflow-x-auto text-gray-300 text-[10px] leading-tight max-h-32 overflow-y-auto whitespace-pre-wrap">
                            {JSON.stringify(props.tc.args, null, 2)}
                        </pre>
                    </Show>
                    <Show when={props.tc.result}>
                        <div class="text-gray-500 text-[10px] font-medium">
                            Output
                        </div>
                        <pre class="bg-gray-950 rounded p-1.5 overflow-x-auto text-gray-300 text-[10px] leading-tight max-h-32 overflow-y-auto whitespace-pre-wrap">
                            {truncateOutput(props.tc.result!, 300)}
                        </pre>
                    </Show>
                    <Show when={props.tc.error}>
                        <div class="text-red-400 text-[10px] font-medium">
                            Error
                        </div>
                        <pre class="bg-red-950/30 rounded p-1.5 overflow-x-auto text-red-300 text-[10px] leading-tight">
                            {props.tc.error}
                        </pre>
                    </Show>
                </div>
            </Show>
        </div>
    )
}

function SubagentTurnView(props: Readonly<{ turn: SubagentTurn }>) {
    return (
        <div class="mb-2">
            <Show when={props.turn.role === 'user'}>
                <div class="flex items-start gap-1.5 mb-1">
                    <span class="text-[10px] text-blue-400 font-medium shrink-0 mt-0.5">
                        Task
                    </span>
                    <span class="text-[11px] text-gray-300">
                        {props.turn.text}
                    </span>
                </div>
            </Show>
            <Show when={props.turn.role === 'assistant'}>
                <Show when={props.turn.text.trim().length > 0}>
                    <div class="mb-1">
                        <For each={parseContent(props.turn.text)}>
                            {(part) =>
                                part.kind === 'code' ? (
                                    <CodeBlock
                                        lang={part.lang}
                                        code={part.code}
                                    />
                                ) : (
                                    <div
                                        class="md-content text-[11px] text-gray-300 leading-snug"
                                        innerHTML={part.html}
                                    />
                                )
                            }
                        </For>
                    </div>
                </Show>
                <Show when={props.turn.toolCalls}>
                    <For each={props.turn.toolCalls}>
                        {(tc) => <SubagentToolItem tc={tc} />}
                    </For>
                </Show>
            </Show>
        </div>
    )
}

function SubagentThread(props: Readonly<{ toolCallId: string }>) {
    const state = () => getSubagent(props.toolCallId)

    return (
        <div class="mt-1.5">
            <Show
                when={state()}
                fallback={
                    <div class="text-[11px] text-gray-500 italic">
                        No conversation data available
                    </div>
                }
            >
                {(s) => (
                    <div class="border-l-2 border-gray-700 pl-2">
                        <For each={s().turns}>
                            {(turn) => <SubagentTurnView turn={turn} />}
                        </For>
                        <Show when={s().status === 'running'}>
                            <div class="flex items-center gap-1.5 text-[11px] text-gray-400">
                                <Spinner size="xs" />
                                <span>Working...</span>
                            </div>
                        </Show>
                    </div>
                )}
            </Show>
        </div>
    )
}

export function ToolCallIndicator(props: Readonly<{ part: ToolUIPart }>) {
    const [expanded, setExpanded] = createSignal(false)
    const name = () => getToolNameFromPart(props.part)
    const isDone = () =>
        props.part.state === 'output-available' ||
        props.part.state === 'output-error'
    const isError = () => props.part.state === 'output-error'
    const isPending = () => !isDone()
    const isSpawnAgent = () => name() === 'spawn_agent'
    const inp = () => props.part.input as Record<string, unknown> | undefined
    const label = () => toolLabel(name(), inp(), isDone(), isError())

    return (
        <div class="my-1.5">
            <button
                class={`flex items-center gap-1.5 text-xs rounded px-2 py-1 border w-full text-left transition-colors cursor-pointer ${
                    isError()
                        ? 'bg-red-950/40 border-red-800/50 text-red-400 hover:bg-red-950/60'
                        : isDone()
                        ? 'bg-green-950/40 border-green-800/50 text-green-400 hover:bg-green-950/60'
                        : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'
                }`}
                onClick={() => setExpanded((v) => !v)}
                type="button"
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
                <span class="flex-1 truncate">{label()}</span>
                <svg
                    class={`w-3 h-3 shrink-0 transition-transform ${
                        expanded() ? 'rotate-90' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                </svg>
            </button>
            <Show when={expanded()}>
                <div class="mx-1 mt-1 border border-gray-700/50 rounded-md bg-gray-900/50 p-2">
                    <Show
                        when={isSpawnAgent()}
                        fallback={<ToolInputOutput part={props.part} />}
                    >
                        <SubagentThread toolCallId={props.part.toolCallId} />
                    </Show>
                </div>
            </Show>
        </div>
    )
}
