import { JSX, splitProps } from 'solid-js'

export interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'outlined' | 'elevated'
}

export interface CardHeaderProps extends JSX.HTMLAttributes<HTMLDivElement> {}
export interface CardContentProps extends JSX.HTMLAttributes<HTMLDivElement> {}
export interface CardFooterProps extends JSX.HTMLAttributes<HTMLDivElement> {}

const variantClasses = {
    default:
        'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
    outlined: 'bg-transparent border-2 border-gray-300 dark:border-gray-600',
    elevated: 'bg-white dark:bg-gray-800 shadow-lg dark:shadow-gray-900/50',
}

export function Card(props: CardProps) {
    const [local, rest] = splitProps(props, ['variant', 'class', 'children'])
    const variant = () => local.variant ?? 'default'

    return (
        <div
            class={`
                rounded-lg overflow-hidden
                ${variantClasses[variant()]}
                ${local.class ?? ''}
            `}
            {...rest}
        >
            {local.children}
        </div>
    )
}

export function CardHeader(props: CardHeaderProps) {
    const [local, rest] = splitProps(props, ['class', 'children'])

    return (
        <div
            class={`
                px-4 py-3 border-b border-gray-200 dark:border-gray-700
                ${local.class ?? ''}
            `}
            {...rest}
        >
            {local.children}
        </div>
    )
}

export function CardContent(props: CardContentProps) {
    const [local, rest] = splitProps(props, ['class', 'children'])

    return (
        <div class={`px-4 py-4 ${local.class ?? ''}`} {...rest}>
            {local.children}
        </div>
    )
}

export function CardFooter(props: CardFooterProps) {
    const [local, rest] = splitProps(props, ['class', 'children'])

    return (
        <div
            class={`
                px-4 py-3 border-t border-gray-200 dark:border-gray-700
                bg-gray-50 dark:bg-gray-800/50
                ${local.class ?? ''}
            `}
            {...rest}
        >
            {local.children}
        </div>
    )
}
