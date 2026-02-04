import { JSX, splitProps } from 'solid-js'

export type BadgeVariant =
    | 'default'
    | 'primary'
    | 'success'
    | 'warning'
    | 'danger'
    | 'info'
export type BadgeSize = 'sm' | 'md' | 'lg'

export interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant
    size?: BadgeSize
}

const variantClasses: Record<BadgeVariant, string> = {
    default: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    primary: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
    success:
        'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
    warning:
        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    info: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200',
}

const sizeClasses: Record<BadgeSize, string> = {
    sm: 'px-1.5 py-0.5 text-xs',
    md: 'px-2 py-0.5 text-xs',
    lg: 'px-2.5 py-1 text-sm',
}

export function Badge(props: BadgeProps) {
    const [local, rest] = splitProps(props, [
        'variant',
        'size',
        'class',
        'children',
    ])

    const variant = () => local.variant ?? 'default'
    const size = () => local.size ?? 'md'

    return (
        <span
            class={`
                inline-flex items-center font-medium rounded-full
                ${variantClasses[variant()]}
                ${sizeClasses[size()]}
                ${local.class ?? ''}
            `}
            {...rest}
        >
            {local.children}
        </span>
    )
}
