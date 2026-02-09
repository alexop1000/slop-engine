import { For, Show, createSignal, createEffect, onCleanup, JSX } from 'solid-js'
import { Portal } from 'solid-js/web'
import { Icon } from 'solid-heroicons'
import { chevronRight } from 'solid-heroicons/solid'

export interface ContextMenuItem {
    id: string
    label: string
    icon?: { path: JSX.Element; outline?: boolean; mini?: boolean }
    disabled?: boolean
    danger?: boolean
    separator?: boolean
    children?: ContextMenuItem[]
}

export interface ContextMenuProps {
    open: boolean
    x: number
    y: number
    items: ContextMenuItem[]
    onSelect: (id: string) => void
    onClose: () => void
}

export function ContextMenu(props: ContextMenuProps) {
    let menuRef: HTMLDivElement | undefined
    const [adjustedPos, setAdjustedPos] = createSignal({ x: 0, y: 0 })
    const [hoveredSubmenu, setHoveredSubmenu] = createSignal<string | null>(
        null
    )

    createEffect(() => {
        if (!props.open) return

        // Start at cursor position, clamp after render
        setAdjustedPos({ x: props.x, y: props.y })

        requestAnimationFrame(() => {
            if (!menuRef) return
            const rect = menuRef.getBoundingClientRect()
            let x = props.x
            let y = props.y
            if (x + rect.width > window.innerWidth) {
                x = window.innerWidth - rect.width - 4
            }
            if (y + rect.height > window.innerHeight) {
                y = window.innerHeight - rect.height - 4
            }
            setAdjustedPos({ x: Math.max(0, x), y: Math.max(0, y) })
        })

        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                props.onClose()
            }
        }
        document.addEventListener('keydown', handleKeydown)

        onCleanup(() => {
            document.removeEventListener('keydown', handleKeydown)
        })
    })

    const handleSelect = (item: ContextMenuItem) => {
        if (item.disabled || item.children) return
        props.onSelect(item.id)
    }

    return (
        <Show when={props.open}>
            <Portal>
                <div
                    class="fixed inset-0 z-50"
                    onClick={() => props.onClose()}
                    onContextMenu={(e) => {
                        e.preventDefault()
                        props.onClose()
                    }}
                />
                <div
                    ref={menuRef}
                    class="fixed z-50 min-w-[160px] bg-gray-800 border border-gray-700 rounded-md shadow-lg py-1"
                    style={{
                        left: `${adjustedPos().x}px`,
                        top: `${adjustedPos().y}px`,
                    }}
                >
                    <For each={props.items}>
                        {(item) => (
                            <>
                                <Show when={item.separator}>
                                    <div class="border-t border-gray-700 my-1" />
                                </Show>
                                <Show when={!item.separator || item.label}>
                                    <Show
                                        when={!item.children}
                                        fallback={
                                            <SubmenuItem
                                                item={item}
                                                hoveredSubmenu={hoveredSubmenu}
                                                setHoveredSubmenu={
                                                    setHoveredSubmenu
                                                }
                                                onSelect={props.onSelect}
                                            />
                                        }
                                    >
                                        <button
                                            type="button"
                                            class={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
                                                item.disabled
                                                    ? 'text-gray-500 cursor-default'
                                                    : item.danger
                                                      ? 'text-red-400 hover:bg-gray-700 hover:text-red-300'
                                                      : 'text-gray-300 hover:bg-gray-700'
                                            }`}
                                            onClick={() => handleSelect(item)}
                                            onMouseEnter={() =>
                                                setHoveredSubmenu(null)
                                            }
                                        >
                                            <Show when={item.icon}>
                                                <Icon
                                                    path={item.icon!}
                                                    class="size-4 shrink-0"
                                                />
                                            </Show>
                                            {item.label}
                                        </button>
                                    </Show>
                                </Show>
                            </>
                        )}
                    </For>
                </div>
            </Portal>
        </Show>
    )
}

function SubmenuItem(props: {
    item: ContextMenuItem
    hoveredSubmenu: () => string | null
    setHoveredSubmenu: (id: string | null) => void
    onSelect: (id: string) => void
}) {
    let submenuRef: HTMLDivElement | undefined
    const [submenuFlip, setSubmenuFlip] = createSignal(false)

    const isOpen = () => props.hoveredSubmenu() === props.item.id

    createEffect(() => {
        if (!isOpen() || !submenuRef) return
        requestAnimationFrame(() => {
            if (!submenuRef) return
            const rect = submenuRef.getBoundingClientRect()
            setSubmenuFlip(rect.right > window.innerWidth)
        })
    })

    return (
        <div
            class="relative"
            onMouseEnter={() => props.setHoveredSubmenu(props.item.id)}
            onMouseLeave={() => props.setHoveredSubmenu(null)}
        >
            <button
                type="button"
                class="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 flex items-center justify-between"
            >
                <span class="flex items-center gap-2">
                    <Show when={props.item.icon}>
                        <Icon
                            path={props.item.icon!}
                            class="size-4 shrink-0"
                        />
                    </Show>
                    {props.item.label}
                </span>
                <Icon path={chevronRight} class="size-3 text-gray-500" />
            </button>
            <Show when={isOpen()}>
                <div
                    ref={submenuRef}
                    class={`absolute top-0 min-w-[160px] bg-gray-800 border border-gray-700 rounded-md shadow-lg py-1 ${
                        submenuFlip()
                            ? 'right-full mr-1'
                            : 'left-full ml-1'
                    }`}
                >
                    <For each={props.item.children}>
                        {(child) => (
                            <>
                                <Show when={child.separator}>
                                    <div class="border-t border-gray-700 my-1" />
                                </Show>
                                <Show when={!child.separator || child.label}>
                                    <button
                                        type="button"
                                        class={`w-full text-left px-3 py-1.5 text-sm ${
                                            child.disabled
                                                ? 'text-gray-500 cursor-default'
                                                : 'text-gray-300 hover:bg-gray-700'
                                        }`}
                                        onClick={() => {
                                            if (!child.disabled)
                                                props.onSelect(child.id)
                                        }}
                                    >
                                        {child.label}
                                    </button>
                                </Show>
                            </>
                        )}
                    </For>
                </div>
            </Show>
        </div>
    )
}
