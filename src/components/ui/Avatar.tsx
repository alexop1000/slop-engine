import { JSX, splitProps, Show, createMemo } from 'solid-js'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface AvatarProps extends JSX.HTMLAttributes<HTMLDivElement> {
    src?: string
    alt?: string
    name?: string
    size?: AvatarSize
}

const sizeClasses: Record<AvatarSize, string> = {
    xs: 'h-6 w-6 text-xs',
    sm: 'h-8 w-8 text-sm',
    md: 'h-10 w-10 text-base',
    lg: 'h-12 w-12 text-lg',
    xl: 'h-16 w-16 text-xl',
}

const bgColors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-yellow-500',
    'bg-lime-500',
    'bg-green-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-sky-500',
    'bg-blue-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-purple-500',
    'bg-fuchsia-500',
    'bg-pink-500',
    'bg-rose-500',
]

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) {
        return parts[0].charAt(0).toUpperCase()
    }
    return (
        parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
    ).toUpperCase()
}

function hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash
    }
    return Math.abs(hash)
}

export function Avatar(props: AvatarProps) {
    const [local, rest] = splitProps(props, [
        'src',
        'alt',
        'name',
        'size',
        'class',
    ])

    const size = () => local.size ?? 'md'

    const initials = createMemo(() =>
        local.name ? getInitials(local.name) : '?'
    )
    const bgColor = createMemo(() => {
        const str = local.name ?? local.alt ?? ''
        const hash = hashString(str)
        return bgColors[hash % bgColors.length]
    })

    return (
        <div
            class={`
                relative inline-flex items-center justify-center
                rounded-full overflow-hidden
                ${sizeClasses[size()]}
                ${!local.src ? bgColor() : ''}
                ${local.class ?? ''}
            `}
            {...rest}
        >
            <Show
                when={local.src}
                fallback={
                    <span class="font-medium text-white">{initials()}</span>
                }
            >
                <img
                    src={local.src}
                    alt={local.alt ?? local.name ?? 'Avatar'}
                    class="h-full w-full object-cover"
                />
            </Show>
        </div>
    )
}
