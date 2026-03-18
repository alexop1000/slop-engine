import { createSignal, For, Show } from 'solid-js'
import type { PlanStep } from './types'

const agentColors: Record<string, { bg: string; text: string; label: string }> =
    {
        scene: {
            bg: 'bg-emerald-500/20',
            text: 'text-emerald-400',
            label: 'Scene',
        },
        script: {
            bg: 'bg-violet-500/20',
            text: 'text-violet-400',
            label: 'Script',
        },
        ui: {
            bg: 'bg-amber-500/20',
            text: 'text-amber-400',
            label: 'UI',
        },
        asset: {
            bg: 'bg-pink-500/20',
            text: 'text-pink-400',
            label: 'Asset',
        },
    }

export function PlanSummary(props: {
    title: string
    steps: PlanStep[]
    onApprove: () => void
    onReject: () => void
    disabled: boolean
}) {
    const [decision, setDecision] = createSignal<
        'approved' | 'rejected' | null
    >(null)

    const isDisabled = () => props.disabled || decision() !== null

    const handleApprove = () => {
        if (isDisabled()) return
        setDecision('approved')
        props.onApprove()
    }

    const handleReject = () => {
        if (isDisabled()) return
        setDecision('rejected')
        props.onReject()
    }

    return (
        <div class="my-2 rounded-lg border border-gray-700 bg-gray-800/60 overflow-hidden">
            {/* Header */}
            <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-700/60 bg-gray-800/80">
                <svg
                    class="w-4 h-4 text-blue-400 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="1.5"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                    />
                </svg>
                <span class="text-sm font-semibold text-gray-100">
                    {props.title}
                </span>
            </div>

            {/* Steps */}
            <div class="px-3 py-2.5 space-y-2">
                <For each={props.steps}>
                    {(step, index) => {
                        const colors = () =>
                            agentColors[step.agent] ?? agentColors.scene
                        return (
                            <div class="flex items-start gap-2.5">
                                <span class="text-[11px] font-mono text-gray-500 mt-0.5 w-4 shrink-0 text-right">
                                    {index() + 1}.
                                </span>
                                <span
                                    class={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0 ${colors().bg} ${colors().text}`}
                                >
                                    {colors().label}
                                </span>
                                <span class="text-xs text-gray-300 leading-relaxed">
                                    {step.description}
                                </span>
                            </div>
                        )
                    }}
                </For>
            </div>

            {/* Actions */}
            <Show when={!isDisabled()}>
                <div class="flex items-center gap-2 px-3 py-2.5 border-t border-gray-700/60">
                    <button
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-400"
                        onClick={handleApprove}
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
                                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                            />
                        </svg>
                        Build it!
                    </button>
                    <button
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700/50 hover:text-gray-100"
                        onClick={handleReject}
                    >
                        Let me change something
                    </button>
                </div>
            </Show>

            {/* Decision badge */}
            <Show when={decision() !== null}>
                <div
                    class={`flex items-center gap-1.5 px-3 py-2 border-t border-gray-700/60 text-[11px] font-medium ${
                        decision() === 'approved'
                            ? 'text-green-400'
                            : 'text-amber-400'
                    }`}
                >
                    <Show
                        when={decision() === 'approved'}
                        fallback={
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
                                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
                                />
                            </svg>
                        }
                    >
                        <svg
                            class="w-3.5 h-3.5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    </Show>
                    {decision() === 'approved'
                        ? 'Plan approved — building now...'
                        : 'Revising plan...'}
                </div>
            </Show>
        </div>
    )
}
