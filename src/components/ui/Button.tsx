import { JSX, splitProps } from 'solid-js'

export type ButtonVariant =
    | 'primary'
    | 'secondary'
    | 'outline'
    | 'ghost'
    | 'danger'

export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps
    extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    size?: ButtonSize
    loading?: boolean
    fullWidth?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
    primary:
        'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 focus:ring-blue-500',
    secondary:
        'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600 focus:ring-gray-500',
    outline:
        'border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 focus:ring-gray-500',
    ghost: 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 focus:ring-red-500',
}

const sizeClasses: Record<ButtonSize, string> = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
}

export function Button(props: ButtonProps) {
    const [local, rest] = splitProps(props, [
        'variant',
        'size',
        'loading',
        'fullWidth',
        'class',
        'children',
        'disabled',
    ])

    const variant = () => local.variant ?? 'primary'
    const size = () => local.size ?? 'md'

    return (
        <button
            class={`
                inline-flex items-center justify-center font-medium rounded-md
                transition-colors duration-150 ease-in-out
                focus:outline-none focus:ring-2 focus:ring-offset-2
                dark:focus:ring-offset-gray-900
                disabled:opacity-50 disabled:cursor-not-allowed
                ${variantClasses[variant()]}
                ${sizeClasses[size()]}
                ${local.fullWidth ? 'w-full' : ''}
                ${local.class ?? ''}
            `}
            disabled={local.disabled || local.loading}
            {...rest}
        >
            {local.loading && (
                <svg
                    class="animate-spin -ml-1 mr-2 h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                    />
                    <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
            )}
            {local.children}
        </button>
    )
}
