import { JSX, splitProps, Show } from 'solid-js'

export type AlertVariant = 'info' | 'success' | 'warning' | 'error'

export interface AlertProps extends JSX.HTMLAttributes<HTMLDivElement> {
    variant?: AlertVariant
    title?: string
    onClose?: () => void
}

const variantClasses: Record<
    AlertVariant,
    { container: string; icon: string; title: string }
> = {
    info: {
        container:
            'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
        icon: 'text-blue-500 dark:text-blue-400',
        title: 'text-blue-800 dark:text-blue-200',
    },
    success: {
        container:
            'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
        icon: 'text-green-500 dark:text-green-400',
        title: 'text-green-800 dark:text-green-200',
    },
    warning: {
        container:
            'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800',
        icon: 'text-yellow-500 dark:text-yellow-400',
        title: 'text-yellow-800 dark:text-yellow-200',
    },
    error: {
        container:
            'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
        icon: 'text-red-500 dark:text-red-400',
        title: 'text-red-800 dark:text-red-200',
    },
}

const icons: Record<AlertVariant, JSX.Element> = {
    info: (
        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clip-rule="evenodd"
            />
        </svg>
    ),
    success: (
        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd"
            />
        </svg>
    ),
    warning: (
        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
                fill-rule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clip-rule="evenodd"
            />
        </svg>
    ),
    error: (
        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clip-rule="evenodd"
            />
        </svg>
    ),
}

export function Alert(props: AlertProps) {
    const [local, rest] = splitProps(props, [
        'variant',
        'title',
        'onClose',
        'class',
        'children',
    ])

    const variant = () => local.variant ?? 'info'
    const classes = () => variantClasses[variant()]

    return (
        <div
            role="alert"
            class={`
                rounded-lg border p-4
                ${classes().container}
                ${local.class ?? ''}
            `}
            {...rest}
        >
            <div class="flex">
                <div class={`flex-shrink-0 ${classes().icon}`}>
                    {icons[variant()]}
                </div>
                <div class="ml-3 flex-1">
                    <Show when={local.title}>
                        <h3 class={`text-sm font-medium ${classes().title}`}>
                            {local.title}
                        </h3>
                    </Show>
                    <div
                        class={`text-sm text-gray-700 dark:text-gray-300 ${
                            local.title ? 'mt-1' : ''
                        }`}
                    >
                        {local.children}
                    </div>
                </div>
                <Show when={local.onClose}>
                    <button
                        type="button"
                        onClick={local.onClose}
                        class={`
                            ml-auto -mx-1.5 -my-1.5 inline-flex h-8 w-8 items-center justify-center
                            rounded-lg p-1.5 focus:ring-2 focus:ring-offset-2
                            ${classes().icon}
                            hover:bg-black/5 dark:hover:bg-white/10
                        `}
                    >
                        <span class="sr-only">Dismiss</span>
                        <svg
                            class="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    </button>
                </Show>
            </div>
        </div>
    )
}
