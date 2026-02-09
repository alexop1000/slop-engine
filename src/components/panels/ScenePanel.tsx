import { Accessor, Setter, Show, createSignal } from 'solid-js'
import { Scene, Node, Mesh, Light, Camera, TransformNode, MeshBuilder, StandardMaterial, Color3, Vector3, PointLight, DirectionalLight, SpotLight, HemisphericLight } from 'babylonjs'
import { cube, sun, videoCamera, cubeTransparent, magnifyingGlass, xMark, plus } from 'solid-heroicons/outline'
import { Icon } from 'solid-heroicons'
import { TreeView, TreeNode, TreeMoveEvent, ContextMenu } from '../ui'
import type { TreeContextMenuEvent, ContextMenuItem } from '../ui'

function getNodeIcon(node: Node) {
    if (node instanceof Mesh) return cube
    if (node instanceof Light) return sun
    if (node instanceof Camera) return videoCamera
    return cubeTransparent
}

function filterTree<T>(nodes: TreeNode<T>[], query: string): TreeNode<T>[] {
    const q = query.toLowerCase()
    function walk(node: TreeNode<T>): TreeNode<T> | null {
        const childMatches = node.children?.map(walk).filter(Boolean) as TreeNode<T>[] | undefined
        const selfMatches = node.label.toLowerCase().includes(q)
        if (selfMatches || (childMatches && childMatches.length > 0)) {
            return { ...node, children: childMatches && childMatches.length > 0 ? childMatches : node.children }
        }
        return null
    }
    return nodes.map(walk).filter(Boolean) as TreeNode<T>[]
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
    const [search, setSearch] = createSignal('')
    // Track sibling order externally so we never touch Babylon internals
    const [siblingOrder, setSiblingOrder] = createSignal<Map<string, string[]>>(new Map())
    const [showAddMenu, setShowAddMenu] = createSignal(false)
    const [contextMenu, setContextMenu] = createSignal<{
        x: number
        y: number
        node: Node | undefined
    } | null>(null)

    let _addCounter = 0

    function addMesh(type: string) {
        const scene = props.scene()
        if (!scene) return
        _addCounter++
        const label = type[0].toUpperCase() + type.slice(1)
        const name = `${label}_${_addCounter}`
        let mesh: Mesh
        switch (type) {
            case 'box': mesh = MeshBuilder.CreateBox(name, { size: 1 }, scene); break
            case 'sphere': mesh = MeshBuilder.CreateSphere(name, { diameter: 1, segments: 16 }, scene); break
            case 'cylinder': mesh = MeshBuilder.CreateCylinder(name, { height: 1, diameter: 1 }, scene); break
            case 'cone': mesh = MeshBuilder.CreateCylinder(name, { height: 1, diameterTop: 0, diameterBottom: 1 }, scene); break
            case 'torus': mesh = MeshBuilder.CreateTorus(name, { diameter: 1, thickness: 0.3, tessellation: 24 }, scene); break
            case 'plane': mesh = MeshBuilder.CreatePlane(name, { size: 1 }, scene); break
            case 'ground': mesh = MeshBuilder.CreateGround(name, { width: 10, height: 10 }, scene); break
            default: return
        }
        const mat = new StandardMaterial(`${name}_mat`, scene)
        mat.diffuseColor = new Color3(0.6, 0.6, 0.6)
        mesh.material = mat
        if (type !== 'ground' && type !== 'plane') mesh.position.y = 1
        props.setSelectedNode(mesh)
        props.setNodeTick(t => t + 1)
        setShowAddMenu(false)
    }

    function addLight(type: string) {
        const scene = props.scene()
        if (!scene) return
        _addCounter++
        const label = type[0].toUpperCase() + type.slice(1)
        const name = `${label}Light_${_addCounter}`
        let light: Light
        switch (type) {
            case 'point': light = new PointLight(name, new Vector3(0, 5, 0), scene); break
            case 'directional': light = new DirectionalLight(name, new Vector3(0, -1, 0), scene); break
            case 'spot': light = new SpotLight(name, new Vector3(0, 5, 0), new Vector3(0, -1, 0), Math.PI / 3, 2, scene); break
            case 'hemispheric': light = new HemisphericLight(name, new Vector3(0, 1, 0), scene); break
            default: return
        }
        props.setSelectedNode(light)
        props.setNodeTick(t => t + 1)
        setShowAddMenu(false)
    }

    function deleteNode(node: Node) {
        const scene = props.scene()
        if (!scene || node === scene.activeCamera) return
        if (props.selectedNode() === node) {
            props.setSelectedNode(undefined)
        }
        node.dispose()
        props.setNodeTick((t) => t + 1)
    }

    function duplicateNode(node: Node) {
        const scene = props.scene()
        if (!scene) return
        _addCounter++

        if (node instanceof Mesh) {
            const clone = node.clone(`${node.name}_copy_${_addCounter}`, node.parent)
            if (clone) {
                clone.position.x += 1
                props.setSelectedNode(clone)
            }
        } else if (node instanceof SpotLight) {
            const light = new SpotLight(
                `${node.name}_copy_${_addCounter}`,
                node.position.clone(),
                node.direction.clone(),
                node.angle,
                node.exponent,
                scene
            )
            light.intensity = node.intensity
            light.diffuse = node.diffuse.clone()
            light.specular = node.specular.clone()
            light.parent = node.parent
            props.setSelectedNode(light)
        } else if (node instanceof PointLight) {
            const light = new PointLight(
                `${node.name}_copy_${_addCounter}`,
                node.position.clone(),
                scene
            )
            light.intensity = node.intensity
            light.diffuse = node.diffuse.clone()
            light.specular = node.specular.clone()
            light.parent = node.parent
            props.setSelectedNode(light)
        } else if (node instanceof DirectionalLight) {
            const light = new DirectionalLight(
                `${node.name}_copy_${_addCounter}`,
                node.direction.clone(),
                scene
            )
            light.intensity = node.intensity
            light.diffuse = node.diffuse.clone()
            light.specular = node.specular.clone()
            light.parent = node.parent
            props.setSelectedNode(light)
        } else if (node instanceof HemisphericLight) {
            const light = new HemisphericLight(
                `${node.name}_copy_${_addCounter}`,
                node.direction.clone(),
                scene
            )
            light.intensity = node.intensity
            light.diffuse = node.diffuse.clone()
            light.specular = node.specular.clone()
            light.parent = node.parent
            props.setSelectedNode(light)
        } else if (node instanceof TransformNode) {
            const clone = node.clone(
                `${node.name}_copy_${_addCounter}`,
                node.parent
            )
            if (clone) {
                props.setSelectedNode(clone)
            }
        }

        props.setNodeTick((t) => t + 1)
    }

    function getContextMenuItems(node: Node | undefined): ContextMenuItem[] {
        const addChildren: ContextMenuItem[] = [
            { id: 'add-header-meshes', label: 'Meshes', disabled: true },
            { id: 'add-box', label: 'Box' },
            { id: 'add-sphere', label: 'Sphere' },
            { id: 'add-cylinder', label: 'Cylinder' },
            { id: 'add-cone', label: 'Cone' },
            { id: 'add-torus', label: 'Torus' },
            { id: 'add-plane', label: 'Plane' },
            { id: 'add-ground', label: 'Ground' },
            { id: 'add-sep', label: '', separator: true },
            { id: 'add-header-lights', label: 'Lights', disabled: true },
            { id: 'add-point', label: 'Point Light' },
            { id: 'add-directional', label: 'Directional Light' },
            { id: 'add-spot', label: 'Spot Light' },
            { id: 'add-hemispheric', label: 'Hemispheric Light' },
        ]

        const items: ContextMenuItem[] = [
            { id: 'add', label: 'Add', children: addChildren },
        ]

        if (node) {
            items.push({ id: 'sep-1', label: '', separator: true })
            if (!(node instanceof Camera)) {
                items.push({ id: 'duplicate', label: 'Duplicate' })
            }
            items.push({ id: 'delete', label: 'Delete', danger: true })
        }

        return items
    }

    function handleContextMenuSelect(id: string) {
        const ctx = contextMenu()
        if (!ctx) return

        if (id.startsWith('add-')) {
            const type = id.replace('add-', '')
            const meshTypes = [
                'box',
                'sphere',
                'cylinder',
                'cone',
                'torus',
                'plane',
                'ground',
            ]
            const lightTypes = [
                'point',
                'directional',
                'spot',
                'hemispheric',
            ]
            if (meshTypes.includes(type)) addMesh(type)
            else if (lightTypes.includes(type)) addLight(type)
        } else if (id === 'delete' && ctx.node) {
            deleteNode(ctx.node)
        } else if (id === 'duplicate' && ctx.node) {
            duplicateNode(ctx.node)
        }

        setContextMenu(null)
    }

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
        if (!s) return []
        const tree = buildSceneTree(s)
        const q = search()
        return q ? filterTree(tree, q) : tree
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
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-sm font-semibold text-gray-200">Scene</h2>
                <div class="relative">
                    <button
                        type="button"
                        class="text-gray-400 hover:text-gray-200 p-0.5 rounded hover:bg-gray-700"
                        onClick={() => setShowAddMenu(v => !v)}
                    >
                        <Icon path={plus} class="size-4" />
                    </button>
                    <Show when={showAddMenu()}>
                        <div class="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                        <div class="absolute right-0 top-full mt-1 w-44 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50 py-1">
                            <div class="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Meshes</div>
                            <button type="button" class="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700" onClick={() => addMesh('box')}>Box</button>
                            <button type="button" class="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700" onClick={() => addMesh('sphere')}>Sphere</button>
                            <button type="button" class="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700" onClick={() => addMesh('cylinder')}>Cylinder</button>
                            <button type="button" class="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700" onClick={() => addMesh('cone')}>Cone</button>
                            <button type="button" class="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700" onClick={() => addMesh('torus')}>Torus</button>
                            <button type="button" class="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700" onClick={() => addMesh('plane')}>Plane</button>
                            <button type="button" class="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700" onClick={() => addMesh('ground')}>Ground</button>
                            <div class="border-t border-gray-700 my-1" />
                            <div class="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lights</div>
                            <button type="button" class="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700" onClick={() => addLight('point')}>Point Light</button>
                            <button type="button" class="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700" onClick={() => addLight('directional')}>Directional Light</button>
                            <button type="button" class="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700" onClick={() => addLight('spot')}>Spot Light</button>
                            <button type="button" class="w-full text-left px-3 py-1 text-sm text-gray-300 hover:bg-gray-700" onClick={() => addLight('hemispheric')}>Hemispheric Light</button>
                        </div>
                    </Show>
                </div>
            </div>
            <div class="relative mb-2">
                <Icon path={magnifyingGlass} class="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                    type="text"
                    placeholder="Search nodes..."
                    value={search()}
                    onInput={(e) => setSearch(e.currentTarget.value)}
                    class="w-full bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500 pl-7 pr-7 py-1 focus:outline-none focus:border-blue-500/50"
                />
                <Show when={search()}>
                    <button
                        type="button"
                        class="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                        onClick={() => setSearch('')}
                    >
                        <Icon path={xMark} class="size-3.5" />
                    </button>
                </Show>
            </div>
            <div class="flex-1 overflow-y-auto">
                <TreeView
                    items={treeItems()}
                    selectedId={selectedId}
                    onSelect={(_id, data) => {
                        props.setSelectedNode(data ?? undefined)
                    }}
                    onMove={handleMove}
                    onContextMenu={(event: TreeContextMenuEvent<Node>) => {
                        const node = event.id ? event.data : undefined
                        if (node) props.setSelectedNode(node)
                        setContextMenu({
                            x: event.x,
                            y: event.y,
                            node,
                        })
                    }}
                />
            </div>
            <ContextMenu
                open={contextMenu() !== null}
                x={contextMenu()?.x ?? 0}
                y={contextMenu()?.y ?? 0}
                items={getContextMenuItems(contextMenu()?.node)}
                onSelect={handleContextMenuSelect}
                onClose={() => setContextMenu(null)}
            />
        </div>
    )
}
