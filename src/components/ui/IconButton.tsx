import { JSX, splitProps } from 'solid-js'

export type IconButtonVariant = 'default' | 'primary' | 'ghost' | 'danger'
export type IconButtonSize = 'sm' | 'md' | 'lg'

export interface IconButtonProps
    extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: IconButtonVariant
    size?: IconButtonSize
    label: string // Required for accessibility
}

const variantClasses: Record<IconButtonVariant, string> = {
    default:
        'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:ring-gray-500',
    primary:
        'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 focus:ring-blue-500',
    ghost: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 focus:ring-gray-500',
    danger: 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 focus:ring-red-500',
}

const sizeClasses: Record<IconButtonSize, string> = {
    sm: 'p-1',
    md: 'p-2',
    lg: 'p-3',
}

export function IconButton(props: IconButtonProps) {
    const [local, rest] = splitProps(props, [
        'variant',
        'size',
        'label',
        'class',
        'children',
    ])

    const variant = () => local.variant ?? 'default'
    const size = () => local.size ?? 'md'

    return (
        <button
            type="button"
            aria-label={local.label}
            title={local.label}
            class={`
                inline-flex items-center justify-center rounded-md
                transition-colors duration-150 ease-in-out
                focus:outline-none focus:ring-2 focus:ring-offset-2
                dark:focus:ring-offset-gray-900
                disabled:opacity-50 disabled:cursor-not-allowed
                ${variantClasses[variant()]}
                ${sizeClasses[size()]}
                ${local.class ?? ''}
            `}
            {...rest}
        >
            {local.children}
        </button>
    )
}
