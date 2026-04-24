import { createSignal, For, Show } from 'solid-js'
import {
    isToolPart,
    getToolNameFromPart,
    type ToolUIPart,
    type ClarificationInput,
    type PlanInput,
} from './types'
import { groupPartsInOrder, parseContent } from './utils'
import { CodeBlock } from './CodeBlock'
import { ToolCallIndicator } from './ToolCallIndicator'
import { PlanningCards } from './PlanningCards'
import { PlanSummary } from './PlanSummary'
import { resolvePlanning } from './planningStore'
import { queueHarnessIteration } from '../../../harnessClient'
import { Spinner } from '../../ui/Spinner'

/** Reactive wrapper for ask_clarification tool — tracks input/state changes */
function PlanningClarification(props: { part: ToolUIPart }) {
    const input = () => props.part.input as ClarificationInput | undefined
    const isDone = () =>
        props.part.state === 'output-available' ||
        props.part.state === 'output-error'

    return (
        <Show
            when={input()}
            fallback={
                <div class="flex items-center gap-2 text-gray-400 text-xs py-2">
                    <Spinner size="xs" />
                    <span>Preparing question...</span>
                </div>
            }
        >
            {(ci) => (
                <PlanningCards
                    question={ci().question}
                    options={ci().options ?? []}
                    allowCustom={ci().allowCustom}
                    multiSelect={ci().multiSelect}
                    disabled={isDone()}
                    onSubmit={(ids, custom) => {
                        const parts: string[] = []
                        if (ids.length > 0) {
                            const labels = ids.map(
                                (id) =>
                                    ci().options?.find((o) => o.id === id)
                                        ?.label ?? id
                            )
                            parts.push(
                                `User selected: ${labels.join(', ')}`
                            )
                        }
                        if (custom) {
                            parts.push(`User wrote: "${custom}"`)
                        }
                        const answer = parts.join('. ')
                        queueHarnessIteration('clarification', answer)
                        resolvePlanning(props.part.toolCallId, answer)
                    }}
                />
            )}
        </Show>
    )
}

/** Reactive wrapper for present_plan tool — tracks input/state changes */
function PlanningPlanPresentation(props: { part: ToolUIPart }) {
    const input = () => props.part.input as PlanInput | undefined
    const isDone = () =>
        props.part.state === 'output-available' ||
        props.part.state === 'output-error'

    return (
        <Show
            when={input()}
            fallback={
                <div class="flex items-center gap-2 text-gray-400 text-xs py-2">
                    <Spinner size="xs" />
                    <span>Building plan...</span>
                </div>
            }
        >
            {(pi) => (
                <PlanSummary
                    title={pi().title}
                    steps={pi().steps ?? []}
                    disabled={isDone()}
                    onApprove={() => {
                        queueHarnessIteration(
                            'plan_approval',
                            'approved'
                        )
                        resolvePlanning(
                            props.part.toolCallId,
                            'Plan approved by user. Proceed with execution.'
                        )
                    }}
                    onReject={() => {
                        queueHarnessIteration(
                            'plan_approval',
                            'rejected'
                        )
                        resolvePlanning(
                            props.part.toolCallId,
                            'User wants to change the plan. Ask what they would like to adjust.'
                        )
                    }}
                />
            )}
        </Show>
    )
}

export function ChatMessage(
    props: Readonly<{
        role: string
        parts: Array<{ type: string; text?: string; [key: string]: unknown }>
        onUndo?: () => Promise<void>
    }>
) {
    const isUser = () => props.role === 'user'
    const [isUndoing, setIsUndoing] = createSignal(false)

    const segments = () => groupPartsInOrder(props.parts, isToolPart)
    const hasContent = () =>
        props.parts.some(
            (p) =>
                isToolPart(p) ||
                p.type === 'file' ||
                (p.type === 'text' && (p.text?.length ?? 0) > 0)
        )

    const handleUndo = async () => {
        if (!props.onUndo || isUndoing()) return
        setIsUndoing(true)
        try {
            await props.onUndo()
        } finally {
            setIsUndoing(false)
        }
    }

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
                        {(seg) => {
                            if (seg.kind === 'tool') {
                                const toolPart =
                                    seg.part as unknown as ToolUIPart
                                const toolName = getToolNameFromPart(toolPart)

                                if (toolName === 'ask_clarification') {
                                    return (
                                        <PlanningClarification
                                            part={toolPart}
                                        />
                                    )
                                }

                                if (toolName === 'present_plan') {
                                    return (
                                        <PlanningPlanPresentation
                                            part={toolPart}
                                        />
                                    )
                                }

                                return <ToolCallIndicator part={seg.part} />
                            }

                            return seg.kind === 'file' &&
                              seg.part.mediaType?.startsWith('image/') ? (
                                <div class="mt-1.5">
                                    <img
                                        src={seg.part.url}
                                        alt={seg.part.filename ?? 'image'}
                                        class="max-w-full max-h-48 rounded object-contain"
                                    />
                                </div>
                            ) : seg.kind === 'text' ? (
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
                            ) : null
                        }}
                    </For>
                    <Show when={props.onUndo}>
                        <div class="mt-2 pt-2 border-t border-gray-700">
                            <button
                                type="button"
                                class="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={handleUndo}
                                disabled={isUndoing()}
                                title="Undo all scene changes from this response"
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
                                        d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                                    />
                                </svg>
                                {isUndoing()
                                    ? 'Restoring…'
                                    : 'Undo scene changes'}
                            </button>
                        </div>
                    </Show>
                </div>
            </div>
        </Show>
    )
}
