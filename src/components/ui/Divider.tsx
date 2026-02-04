import { JSX, splitProps, Show } from 'solid-js'

export interface DividerProps extends JSX.HTMLAttributes<HTMLDivElement> {
    orientation?: 'horizontal' | 'vertical'
    label?: string
}

export function Divider(props: DividerProps) {
    const [local, rest] = splitProps(props, ['orientation', 'label', 'class'])

    const isHorizontal = () =>
        (local.orientation ?? 'horizontal') === 'horizontal'

    return (
        <Show
            when={isHorizontal()}
            fallback={
                <div
                    class={`
                        w-px bg-gray-200 dark:bg-gray-700 self-stretch
                        ${local.class ?? ''}
                    `}
                    role="separator"
                    aria-orientation="vertical"
                    {...rest}
                />
            }
        >
            <div
                class={`
                    flex items-center w-full
                    ${local.class ?? ''}
                `}
                role="separator"
                aria-orientation="horizontal"
                {...rest}
            >
                <Show
                    when={local.label}
                    fallback={
                        <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    }
                >
                    <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                    <span class="px-3 text-sm text-gray-500 dark:text-gray-400">
                        {local.label}
                    </span>
                    <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </Show>
            </div>
        </Show>
    )
}
