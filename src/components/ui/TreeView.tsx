import { For, Show, createSignal, Accessor, Setter, JSX } from 'solid-js'
import { Icon } from 'solid-heroicons'
import { chevronRight } from 'solid-heroicons/solid'

export interface TreeNode<T = unknown> {
    id: string
    label: string
    icon?: { path: JSX.Element; outline?: boolean; mini?: boolean }
    children?: TreeNode<T>[]
    data?: T
}

export type DropPosition = 'before' | 'inside' | 'after'

export interface TreeMoveEvent<T = unknown> {
    sourceId: string
    sourceData: T | undefined
    targetId: string
    targetData: T | undefined
    position: DropPosition
}

export interface TreeContextMenuEvent<T = unknown> {
    id: string
    data: T | undefined
    x: number
    y: number
}

export interface TreeViewProps<T = unknown> {
    items: TreeNode<T>[]
    selectedId?: Accessor<string | undefined>
    onSelect?: (id: string, data: T | undefined) => void
    onMove?: (event: TreeMoveEvent<T>) => void
    onContextMenu?: (event: TreeContextMenuEvent<T>) => void
    defaultExpanded?: string[]
    class?: string
}

/** Check if `ancestorId` is an ancestor of `nodeId` in the tree. */
function isAncestor<T>(nodes: TreeNode<T>[], ancestorId: string, nodeId: string): boolean {
    for (const node of nodes) {
        if (node.id === ancestorId) {
            return containsId(node.children ?? [], nodeId)
        }
        if (node.children && isAncestor(node.children, ancestorId, nodeId)) return true
    }
    return false
}

function containsId<T>(nodes: TreeNode<T>[], id: string): boolean {
    for (const node of nodes) {
        if (node.id === id) return true
        if (node.children && containsId(node.children, id)) return true
    }
    return false
}

function TreeItem<T>(props: Readonly<{
    node: TreeNode<T>
    depth: number
    selectedId: Accessor<string | undefined> | undefined
    onSelect: ((id: string, data: T | undefined) => void) | undefined
    onContextMenu: ((event: TreeContextMenuEvent<T>) => void) | undefined
    expanded: Accessor<Set<string>>
    setExpanded: Setter<Set<string>>
    dragState: Accessor<DragState<T> | null>
    setDragState: Setter<DragState<T> | null>
    dropTarget: Accessor<DropTarget | null>
    setDropTarget: Setter<DropTarget | null>
    items: TreeNode<T>[]
    onMove: ((event: TreeMoveEvent<T>) => void) | undefined
}>) {
    const hasChildren = () => (props.node.children?.length ?? 0) > 0
    const isExpanded = () => props.expanded().has(props.node.id)
    const isSelected = () => props.selectedId?.() === props.node.id
    const isDragging = () => props.dragState()?.id === props.node.id

    const toggleExpand = (e: MouseEvent) => {
        e.stopPropagation()
        props.setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(props.node.id)) next.delete(props.node.id)
            else next.add(props.node.id)
            return next
        })
    }

    const handleSelect = () => {
        props.onSelect?.(props.node.id, props.node.data)
    }

    const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        props.onContextMenu?.({
            id: props.node.id,
            data: props.node.data,
            x: e.clientX,
            y: e.clientY,
        })
    }

    const handleDragStart = (e: DragEvent) => {
        props.setDragState({ id: props.node.id, data: props.node.data })
        e.dataTransfer!.effectAllowed = 'move'
        e.dataTransfer!.setData('text/plain', props.node.id)
    }

    const handleDragEnd = () => {
        props.setDragState(null)
        props.setDropTarget(null)
    }

    const handleDragOver = (e: DragEvent) => {
        const drag = props.dragState()
        if (!drag || drag.id === props.node.id) return
        // Prevent dropping onto own descendant
        if (isAncestor(props.items, drag.id, props.node.id)) return

        e.preventDefault()
        e.dataTransfer!.dropEffect = 'move'

        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
        const y = e.clientY - rect.top
        const h = rect.height
        let position: DropPosition
        if (y < h * 0.25) {
            position = 'before'
        } else if (y > h * 0.75) {
            position = 'after'
        } else {
            position = 'inside'
        }
        props.setDropTarget({ id: props.node.id, position })
    }

    const handleDragLeave = (e: DragEvent) => {
        // Only clear if actually leaving this element (not entering a child)
        const related = e.relatedTarget as HTMLElement | null
        if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
            const dt = props.dropTarget()
            if (dt?.id === props.node.id) {
                props.setDropTarget(null)
            }
        }
    }

    const handleDrop = (e: DragEvent) => {
        e.preventDefault()
        const drag = props.dragState()
        const dt = props.dropTarget()
        if (!drag || dt?.id !== props.node.id) return
        if (drag.id === props.node.id) return
        if (isAncestor(props.items, drag.id, props.node.id)) return

        props.onMove?.({
            sourceId: drag.id,
            sourceData: drag.data,
            targetId: props.node.id,
            targetData: props.node.data,
            position: dt.position,
        })

        props.setDragState(null)
        props.setDropTarget(null)
    }

    const dropIndicator = () => {
        const dt = props.dropTarget()
        if (dt?.id !== props.node.id) return null
        return dt.position
    }

    return (
        <div role="treeitem" aria-expanded={hasChildren() ? isExpanded() : undefined}>
            <div
                class={`flex items-center gap-1 py-0.5 pr-2 cursor-pointer text-sm select-none transition-colors duration-150 rounded-sm ${
                    isDragging()
                        ? 'opacity-40'
                        : isSelected()
                            ? 'bg-blue-500/20 text-blue-100'
                            : 'text-gray-300 hover:bg-gray-700/50'
                } ${
                    dropIndicator() === 'inside' ? 'bg-blue-500/30 ring-1 ring-blue-500/50' : ''
                } ${
                    dropIndicator() === 'before' ? 'border-t border-blue-400' : ''
                } ${
                    dropIndicator() === 'after' ? 'border-b border-blue-400' : ''
                }`}
                style={{ "padding-left": `${props.depth * 1.25 + 0.25}rem` }}
                onClick={handleSelect}
                onContextMenu={handleContextMenu}
                draggable={true}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <Show
                    when={hasChildren()}
                    fallback={<span class="w-4 shrink-0" />}
                >
                    <button
                        type="button"
                        class={`w-4 h-4 shrink-0 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-transform duration-150 ${
                            isExpanded() ? 'rotate-90' : ''
                        }`}
                        onClick={toggleExpand}
                        aria-label={isExpanded() ? 'Collapse' : 'Expand'}
                    >
                        <Icon path={chevronRight} class="size-3.5" />
                    </button>
                </Show>

                <Show when={props.node.icon}>
                    <Icon path={props.node.icon!} class="size-4 shrink-0 text-gray-400" />
                </Show>

                <span class="truncate">{props.node.label}</span>
            </div>

            <Show when={hasChildren() && isExpanded()}>
                <div role="group">
                    <For each={props.node.children}>
                        {(child) => (
                            <TreeItem
                                node={child}
                                depth={props.depth + 1}
                                selectedId={props.selectedId}
                                onSelect={props.onSelect}
                                onContextMenu={props.onContextMenu}
                                expanded={props.expanded}
                                setExpanded={props.setExpanded}
                                dragState={props.dragState}
                                setDragState={props.setDragState}
                                dropTarget={props.dropTarget}
                                setDropTarget={props.setDropTarget}
                                items={props.items}
                                onMove={props.onMove}
                            />
                        )}
                    </For>
                </div>
            </Show>
        </div>
    )
}

interface DragState<T> {
    id: string
    data: T | undefined
}

interface DropTarget {
    id: string
    position: DropPosition
}

export function TreeView<T = unknown>(props: TreeViewProps<T>) {
    const [expanded, setExpanded] = createSignal<Set<string>>(
        new Set(props.defaultExpanded ?? [])
    )
    const [dragState, setDragState] = createSignal<DragState<T> | null>(null)
    const [dropTarget, setDropTarget] = createSignal<DropTarget | null>(null)

    return (
        <div
            role="tree"
            class={props.class ?? ''}
            onContextMenu={(e) => {
                e.preventDefault()
                props.onContextMenu?.({
                    id: '',
                    data: undefined,
                    x: e.clientX,
                    y: e.clientY,
                })
            }}
        >
            <For each={props.items}>
                {(item) => (
                    <TreeItem
                        node={item}
                        depth={0}
                        selectedId={props.selectedId}
                        onSelect={props.onSelect}
                        onContextMenu={props.onContextMenu}
                        expanded={expanded}
                        setExpanded={setExpanded}
                        dragState={dragState}
                        setDragState={setDragState}
                        dropTarget={dropTarget}
                        setDropTarget={setDropTarget}
                        items={props.items}
                        onMove={props.onMove}
                    />
                )}
            </For>
        </div>
    )
}
