import { JSX, splitProps, Show } from 'solid-js'

export interface CheckboxProps
    extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    label?: string
    description?: string
}

export function Checkbox(props: CheckboxProps) {
    const [local, rest] = splitProps(props, [
        'label',
        'description',
        'class',
        'id',
    ])

    const inputId = () =>
        local.id ?? `checkbox-${Math.random().toString(36).slice(2, 9)}`

    return (
        <div class="flex items-start">
            <div class="flex items-center h-5">
                <input
                    type="checkbox"
                    id={inputId()}
                    class={`
                        h-4 w-4 rounded cursor-pointer
                        text-blue-600 dark:text-blue-500
                        bg-white dark:bg-gray-900
                        border-gray-300 dark:border-gray-600
                        focus:ring-2 focus:ring-blue-500 focus:ring-offset-0
                        disabled:cursor-not-allowed disabled:opacity-50
                        ${local.class ?? ''}
                    `}
                    {...rest}
                />
            </div>
            <Show when={local.label || local.description}>
                <div class="ml-2">
                    <Show when={local.label}>
                        <label
                            for={inputId()}
                            class="text-sm font-medium text-gray-700 dark:text-gray-200 cursor-pointer"
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
