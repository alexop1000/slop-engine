import { createSignal, For, Show } from 'solid-js'
import type { ClarificationOption } from './types'

const iconPaths: Record<string, string> = {
    palette: 'M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z',
    gamepad:
        'M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 01-.657.643 48.39 48.39 0 01-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 01-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 00-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 01-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 00.657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 01-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 005.427-.63 48.05 48.05 0 00.582-4.717.532.532 0 00-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 00.658-.663 48.422 48.422 0 00-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 01-.61-.58v0z',
    zap: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z',
    layout: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
    sparkles:
        'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z',
    cube: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
    eye: 'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    music: 'M9 19.5V6l12-3v13.5m-12 3a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z',
}

function OptionIcon(props: { icon?: string }) {
    const path = () => (props.icon ? iconPaths[props.icon] : undefined)
    return (
        <Show when={path()} fallback={null}>
            <svg
                class="w-5 h-5 shrink-0 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="1.5"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d={path()!}
                />
            </svg>
        </Show>
    )
}

export function PlanningCards(props: {
    question: string
    options: ClarificationOption[]
    allowCustom?: boolean
    multiSelect?: boolean
    onSubmit: (selectedIds: string[], customText?: string) => void
    disabled: boolean
}) {
    const [selected, setSelected] = createSignal<Set<string>>(new Set())
    const [customText, setCustomText] = createSignal('')
    const [submitted, setSubmitted] = createSignal(false)

    const isDisabled = () => props.disabled || submitted()

    const toggleOption = (id: string) => {
        if (isDisabled()) return
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                if (!props.multiSelect) next.clear()
                next.add(id)
            }
            return next
        })
    }

    const handleSubmit = () => {
        if (isDisabled()) return
        const ids = [...selected()]
        const custom = customText().trim()
        if (ids.length === 0 && !custom) return
        setSubmitted(true)
        props.onSubmit(ids, custom || undefined)
    }

    return (
        <div class="my-2">
            <p class="text-sm font-medium text-gray-100 mb-2.5">
                {props.question}
            </p>

            <div class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))">
                <For each={props.options}>
                    {(option) => {
                        const isSelected = () => selected().has(option.id)
                        return (
                            <button
                                type="button"
                                class={`text-left rounded-lg border p-2.5 transition-all duration-150 ${
                                    isDisabled()
                                        ? isSelected()
                                            ? 'border-blue-500/60 bg-blue-500/15 opacity-80'
                                            : 'border-gray-700/50 bg-gray-800/30 opacity-50'
                                        : isSelected()
                                          ? 'border-blue-500 bg-blue-500/15 ring-1 ring-blue-500/40'
                                          : 'border-gray-700 bg-gray-800/50 hover:border-gray-500 hover:bg-gray-800'
                                }`}
                                onClick={() => toggleOption(option.id)}
                                disabled={isDisabled()}
                            >
                                <div class="flex items-start gap-2">
                                    <OptionIcon icon={option.icon} />
                                    <div class="min-w-0 flex-1">
                                        <div class="flex items-center gap-1.5">
                                            <span class="text-xs font-semibold text-gray-100 leading-tight">
                                                {option.label}
                                            </span>
                                            <Show when={isSelected()}>
                                                <svg
                                                    class="w-3.5 h-3.5 text-blue-400 shrink-0"
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
                                        </div>
                                        <p class="text-[11px] text-gray-400 mt-0.5 leading-snug">
                                            {option.description}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        )
                    }}
                </For>
            </div>

            <Show when={(props.allowCustom ?? true) && !isDisabled()}>
                <div class="mt-2">
                    <input
                        type="text"
                        class="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-500 focus:border-blue-500/60 focus:outline-none"
                        placeholder="Or type your own idea..."
                        value={customText()}
                        onInput={(e) => setCustomText(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSubmit()
                        }}
                    />
                </div>
            </Show>

            <Show when={!isDisabled()}>
                <div class="mt-2.5 flex justify-end">
                    <button
                        type="button"
                        class="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={handleSubmit}
                        disabled={
                            selected().size === 0 && !customText().trim()
                        }
                    >
                        Continue
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
                                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                            />
                        </svg>
                    </button>
                </div>
            </Show>

            <Show when={submitted()}>
                <div class="mt-2 flex items-center gap-1.5 text-[11px] text-green-400">
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
                    Choice submitted
                </div>
            </Show>
        </div>
    )
}
