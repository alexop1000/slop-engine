import { JSX, createSignal, splitProps } from 'solid-js'

export interface CollapsibleProps extends JSX.HTMLAttributes<HTMLDivElement> {
    title: string
    defaultOpen?: boolean
}

export function Collapsible(props: CollapsibleProps) {
    const [local, rest] = splitProps(props, [
        'title',
        'defaultOpen',
        'class',
        'children',
    ])

    const [open, setOpen] = createSignal(local.defaultOpen ?? true)

    return (
        <div class={local.class ?? ''} {...rest}>
            <button
                type="button"
                class="
                    flex items-center justify-between w-full
                    py-1 text-sm font-medium text-gray-500 dark:text-gray-400
                    hover:text-gray-700 dark:hover:text-gray-200
                    transition-colors duration-150
                "
                onClick={() => setOpen((prev) => !prev)}
            >
                <span>{local.title}</span>
                <svg
                    class={`w-4 h-4 transition-transform duration-200 ${open() ? 'rotate-180' : ''}`}
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>
            <div
                class={`overflow-hidden transition-all duration-200 ${open() ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
            >
                {local.children}
            </div>
        </div>
    )
}
