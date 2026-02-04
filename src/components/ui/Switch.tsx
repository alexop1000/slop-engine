import { JSX, splitProps, Show, createUniqueId } from 'solid-js'

export interface SwitchProps {
    checked?: boolean
    onChange?: (checked: boolean) => void
    disabled?: boolean
    label?: string
    description?: string
    size?: 'sm' | 'md' | 'lg'
    class?: string
}

const sizeClasses = {
    sm: {
        track: 'w-8 h-4',
        thumb: 'h-3 w-3',
        translate: 'translate-x-4',
    },
    md: {
        track: 'w-11 h-6',
        thumb: 'h-5 w-5',
        translate: 'translate-x-5',
    },
    lg: {
        track: 'w-14 h-7',
        thumb: 'h-6 w-6',
        translate: 'translate-x-7',
    },
}

export function Switch(props: SwitchProps) {
    const [local, rest] = splitProps(props, [
        'checked',
        'onChange',
        'disabled',
        'label',
        'description',
        'size',
        'class',
    ])

    const id = createUniqueId()
    const size = () => local.size ?? 'md'
    const sizeClass = () => sizeClasses[size()]

    return (
        <div class={`flex items-start ${local.class ?? ''}`}>
            <button
                type="button"
                role="switch"
                aria-checked={local.checked}
                aria-labelledby={local.label ? `${id}-label` : undefined}
                disabled={local.disabled}
                onClick={() => local.onChange?.(!local.checked)}
                class={`
                    relative inline-flex shrink-0 cursor-pointer rounded-full
                    transition-colors duration-200 ease-in-out
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    dark:focus:ring-offset-gray-900
                    disabled:cursor-not-allowed disabled:opacity-50
                    ${sizeClass().track}
                    ${
                        local.checked
                            ? 'bg-blue-600 dark:bg-blue-500'
                            : 'bg-gray-200 dark:bg-gray-700'
                    }
                `}
            >
                <span
                    class={`
                        pointer-events-none inline-block rounded-full
                        bg-white shadow ring-0 transition duration-200 ease-in-out
                        ${sizeClass().thumb}
                        ${
                            local.checked
                                ? sizeClass().translate
                                : 'translate-x-0.5'
                        }
                    `}
                />
            </button>
            <Show when={local.label || local.description}>
                <div class="ml-3">
                    <Show when={local.label}>
                        <label
                            id={`${id}-label`}
                            class="text-sm font-medium text-gray-700 dark:text-gray-200 cursor-pointer"
                            onClick={() =>
                                !local.disabled &&
                                local.onChange?.(!local.checked)
                            }
                        >
                            {local.label}
                        </label>
                    </Show>
                    <Show when={local.description}>
                        <p class="text-sm text-gray-500 dark:text-gray-400">
                            {local.description}
                        </p>
                    </Show>
                </div>
            </Show>
        </div>
    )
}
