import { splitProps } from 'solid-js'

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface SpinnerProps {
    size?: SpinnerSize
    class?: string
}

const sizeClasses: Record<SpinnerSize, string> = {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
    xl: 'h-12 w-12',
}

export function Spinner(props: SpinnerProps) {
    const [local] = splitProps(props, ['size', 'class'])

    const size = () => local.size ?? 'md'

    return (
        <svg
            class={`
                animate-spin text-blue-600 dark:text-blue-400
                ${sizeClasses[size()]}
                ${local.class ?? ''}
            `}
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
    )
}
