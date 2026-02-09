import { Accessor, Setter, createSignal } from 'solid-js'
import { Scene, Node, Mesh, Light, Camera, TransformNode } from 'babylonjs'
import { cube, sun, videoCamera, cubeTransparent } from 'solid-heroicons/outline'
import { TreeView, TreeNode, TreeMoveEvent } from '../ui'

function getNodeIcon(node: Node) {
    if (node instanceof Mesh) return cube
    if (node instanceof Light) return sun
    if (node instanceof Camera) return videoCamera
    return cubeTransparent
}

function sortByOrder(nodes: Node[], order: Map<string, string[]>, parentKey: string): Node[] {
    const ids = order.get(parentKey)
    if (!ids) return nodes
    return [...nodes].sort((a, b) => {
        const idxA = ids.indexOf(a.uniqueId.toString())
        const idxB = ids.indexOf(b.uniqueId.toString())
        if (idxA === -1 && idxB === -1) return 0
        if (idxA === -1) return 1
        if (idxB === -1) return -1
        return idxA - idxB
    })
}

export default function ScenePanel(props: Readonly<{
    scene: Accessor<Scene | undefined>
    selectedNode: Accessor<Node | undefined>
    setSelectedNode: (node: Node | undefined) => void
    nodeTick: Accessor<number>
    setNodeTick: Setter<number>
}>) {
    // Track sibling order externally so we never touch Babylon internals
    const [siblingOrder, setSiblingOrder] = createSignal<Map<string, string[]>>(new Map())

    function buildSceneTree(scene: Scene): TreeNode<Node>[] {
        const order = siblingOrder()

        function nodeToTreeNode(node: Node): TreeNode<Node> {
            const parentKey = node.uniqueId.toString()
            const children = sortByOrder(node.getChildren(), order, parentKey)
            return {
                id: node.uniqueId.toString(),
                label: node.name || '(unnamed)',
                icon: getNodeIcon(node),
                children: children.length > 0
                    ? children.map(child => nodeToTreeNode(child))
                    : undefined,
                data: node,
            }
        }

        const roots = sortByOrder([...scene.rootNodes], order, 'root')
        return roots.map(node => nodeToTreeNode(node))
    }

    const treeItems = () => {
        props.nodeTick()
        const s = props.scene()
        return s ? buildSceneTree(s) : []
    }

    const selectedId = () => props.selectedNode()?.uniqueId?.toString()

    const handleMove = (event: TreeMoveEvent<Node>) => {
        const source = event.sourceData
        const target = event.targetData
        const scene = props.scene()
        if (!source || !target || !scene) return

        const newParent = event.position === 'inside' ? target : target.parent

        // Reparent via Babylon's public API only
        if (source instanceof TransformNode) {
            source.setParent(newParent)
        } else {
            source.parent = newParent
        }

        // For before/after, record the desired sibling order
        if (event.position !== 'inside') {
            const parentKey = newParent?.uniqueId?.toString() ?? 'root'
            const siblings = newParent ? newParent.getChildren() : [...scene.rootNodes]
            const ids = siblings.map(n => n.uniqueId.toString())

            const sourceId = source.uniqueId.toString()
            const srcIdx = ids.indexOf(sourceId)
            if (srcIdx !== -1) ids.splice(srcIdx, 1)

            const targetId = target.uniqueId.toString()
            const tgtIdx = ids.indexOf(targetId)
            if (tgtIdx !== -1) {
                const insertIdx = event.position === 'before' ? tgtIdx : tgtIdx + 1
                ids.splice(insertIdx, 0, sourceId)
            }

            setSiblingOrder(prev => {
                const next = new Map(prev)
                next.set(parentKey, ids)
                return next
            })
        }

        props.setNodeTick(t => t + 1)
    }

    return (
        <div class="flex flex-col h-full">
            <h2 class="text-sm font-semibold text-gray-200 mb-2">Scene</h2>
            <div class="flex-1 overflow-y-auto">
                <TreeView
                    items={treeItems()}
                    selectedId={selectedId}
                    onSelect={(_id, data) => {
                        props.setSelectedNode(data ?? undefined)
                    }}
                    onMove={handleMove}
                />
            </div>
        </div>
    )
}
