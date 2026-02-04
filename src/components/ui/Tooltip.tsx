import { JSX, splitProps, createSignal, Show } from 'solid-js'

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
    content: string | JSX.Element
    position?: TooltipPosition
    delay?: number
    children: JSX.Element
    class?: string
}

const positionClasses: Record<TooltipPosition, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

const arrowClasses: Record<TooltipPosition, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-gray-900 dark:border-t-gray-700 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-gray-900 dark:border-b-gray-700 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-gray-900 dark:border-l-gray-700 border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-gray-900 dark:border-r-gray-700 border-y-transparent border-l-transparent',
}

export function Tooltip(props: TooltipProps) {
    const [local] = splitProps(props, [
        'content',
        'position',
        'delay',
        'children',
        'class',
    ])

    const [show, setShow] = createSignal(false)
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const position = () => local.position ?? 'top'
    const delay = () => local.delay ?? 200

    const handleMouseEnter = () => {
        timeoutId = setTimeout(() => setShow(true), delay())
    }

    const handleMouseLeave = () => {
        if (timeoutId) {
            clearTimeout(timeoutId)
        }
        setShow(false)
    }

    return (
        <div
            class={`relative inline-block ${local.class ?? ''}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {local.children}
            <Show when={show()}>
                <div
                    class={`
                        absolute z-50 px-2 py-1 text-xs font-medium
                        text-white bg-gray-900 dark:bg-gray-700
                        rounded shadow-lg whitespace-nowrap
                        ${positionClasses[position()]}
                    `}
                    role="tooltip"
                >
                    {local.content}
                    <span
                        class={`
                            absolute w-0 h-0 border-4
                            ${arrowClasses[position()]}
                        `}
                    />
                </div>
            </Show>
        </div>
    )
}
