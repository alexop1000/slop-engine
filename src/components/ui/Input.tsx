import { JSX, splitProps, Show } from 'solid-js'

export interface InputProps extends JSX.InputHTMLAttributes<HTMLInputElement> {
    label?: string
    error?: string
    hint?: string
}

export function Input(props: InputProps) {
    const [local, rest] = splitProps(props, [
        'label',
        'error',
        'hint',
        'class',
        'id',
    ])

    const inputId = () =>
        local.id ?? `input-${Math.random().toString(36).slice(2, 9)}`

    return (
        <div class="w-full">
            <Show when={local.label}>
                <label
                    for={inputId()}
                    class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
                >
                    {local.label}
                </label>
            </Show>
            <input
                id={inputId()}
                class={`
                    block w-full rounded-md px-3 py-2 text-sm
                    bg-white dark:bg-gray-900
                    text-gray-900 dark:text-gray-100
                    border transition-colors duration-150
                    placeholder:text-gray-400 dark:placeholder:text-gray-500
                    focus:outline-none focus:ring-2 focus:ring-offset-0
                    disabled:bg-gray-100 dark:disabled:bg-gray-800
                    disabled:cursor-not-allowed disabled:opacity-50
                    ${
                        local.error
                            ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                            : 'border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500'
                    }
                    ${local.class ?? ''}
                `}
                {...rest}
            />
            <Show when={local.error}>
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                    {local.error}
                </p>
            </Show>
            <Show when={local.hint && !local.error}>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {local.hint}
                </p>
            </Show>
        </div>
    )
}
