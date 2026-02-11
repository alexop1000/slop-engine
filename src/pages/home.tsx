import { createSignal, createEffect, createMemo, onMount, untrack } from 'solid-js'
import {
    Engine,
    Scene,
    Mesh,
    Node,
    Color3,
    GizmoManager,
    UtilityLayerRenderer,
    PhysicsAggregate,
    PhysicsShapeType,
    HavokPlugin,
} from 'babylonjs'
import HavokPhysics from '@babylonjs/havok'

import Resizable from 'corvu/resizable'
import { makePersisted } from '@solid-primitives/storage'
import { play, stop } from 'solid-heroicons/solid'
import {
    arrowPath,
    arrowsPointingOut,
    arrowsRightLeft,
    cubeTransparent,
    arrowDownTray,
    arrowUpTray,
} from 'solid-heroicons/outline'
import { Icon } from 'solid-heroicons'
import Handle from '../components/Handle'
import {
    AIPanel,
    AssetPanel,
    ViewportPanel,
    ConsolePanel,
    ScenePanel,
    ScriptPanel,
    PropertiesPanel,
} from '../components/panels'
import { Button, IconButton, Tooltip, Tabs, TabPanel } from '../components/ui'
import {
    createDefaultScene,
    loadSceneFromJson,
    serializeScene,
    setupEditorCamera,
    captureTransformSnapshot,
    restoreTransform,
} from '../scene/EditorScene'
import { onScriptOpen } from '../scriptEditorStore'
import { ScriptRuntime } from '../scripting/ScriptRuntime'
import { getAssetStore, type AssetNode } from '../assetStore'
import { clearLogs } from '../scripting/consoleStore'

const SCRIPT_EXT = ['.ts', '.tsx', '.js', '.jsx']

function collectScriptPaths(node: AssetNode): string[] {
    if (node.type === 'file') {
        const lower = node.path.toLowerCase()
        return SCRIPT_EXT.some((ext) => lower.endsWith(ext))
            ? [node.path]
            : []
    }
    const paths: string[] = []
    for (const child of node.children ?? []) {
        paths.push(...collectScriptPaths(child))
    }
    return paths
}

async function getInitializedHavok() {
    return await HavokPhysics()
}

export default function Home() {
    const [sizes, setSizes] = makePersisted(createSignal<number[]>([]), {
        name: 'resizable-sizes-v1',
    })
    const [sceneSizes, setSceneSizes] = makePersisted(
        createSignal<number[]>([]),
        {
            name: 'scene-resizable-sizes-v1',
        }
    )
    const [propertiesSizes, setPropertiesSizes] = makePersisted(
        createSignal<number[]>([]),
        {
            name: 'properties-resizable-sizes-v1',
        }
    )
    const [sceneJson, setSceneJson] = makePersisted(
        createSignal<string | null>(null),
        { name: 'slop-engine-scene-v1' }
    )

    const [isPlaying, setIsPlaying] = createSignal(false)
    const [scene, setScene] = createSignal<Scene>()
    const [dynamicPhysicsMeshNames, setDynamicPhysicsMeshNames] = createSignal<
        string[]
    >([])
    const [selectedNode, setSelectedNode] = createSignal<Node>()
    const [engine, setEngine] = createSignal<Engine>()
    const [nodeTick, setNodeTick] = createSignal(0)

    const [gizmoManager, setGizmoManager] = createSignal<GizmoManager>()
    const [selectedGizmo, _setSelectedGizmo] = createSignal<
        'position' | 'rotation' | 'scale' | 'boundingBox'
    >('position')

    // Script tab switching
    const [viewportTab, setViewportTab] = createSignal<string | undefined>(
        undefined
    )
    onScriptOpen(() => setViewportTab('script'))

    let _isDraggingGizmo = false
    const _physicsAggregates = new Map<Mesh, PhysicsAggregate>()
    const _transformSnapshots = new Map<
        Mesh,
        ReturnType<typeof captureTransformSnapshot>
    >()
    let _scriptRuntime: ScriptRuntime | null = null

    // Derive available script file paths from the shared asset store
    const assetStore = getAssetStore()
    const scriptAssets = createMemo(() => collectScriptPaths(assetStore.tree()))
    function hookGizmoDrag() {
        const gm = gizmoManager()
        if (!gm) return
        for (const g of [
            gm.gizmos.positionGizmo,
            gm.gizmos.rotationGizmo,
            gm.gizmos.scaleGizmo,
            gm.gizmos.boundingBoxGizmo,
        ]) {
            if (g && !(g as any).__dragHooked) {
                ;(g as any).__dragHooked = true
                const gizmo = g as any
                gizmo.onDragStartObservable?.add(() => {
                    _isDraggingGizmo = true
                })
                gizmo.onDragEndObservable?.add(() => {
                    _isDraggingGizmo = false
                    setNodeTick((t) => t + 1)
                })
            }
        }
    }

    const setSelectedGizmo = (
        gizmo: 'position' | 'rotation' | 'scale' | 'boundingBox'
    ) => {
        _setSelectedGizmo(gizmo)
        gizmoManager()!.positionGizmoEnabled = gizmo === 'position'
        gizmoManager()!.rotationGizmoEnabled = gizmo === 'rotation'
        gizmoManager()!.scaleGizmoEnabled = gizmo === 'scale'
        gizmoManager()!.boundingBoxGizmoEnabled = gizmo === 'boundingBox'
        gizmoManager()?.attachToMesh(
            selectedNode() instanceof Mesh ? (selectedNode() as Mesh) : null
        )
        hookGizmoDrag()
    }

    // Reactively sync gizmo + outline whenever selectedNode changes
    let _lastOutlinedMesh: Mesh | null = null
    createEffect(() => {
        const node = selectedNode()
        const gm = gizmoManager()

        // Remove previous outline
        if (_lastOutlinedMesh && _lastOutlinedMesh !== node) {
            _lastOutlinedMesh.renderOutline = false
        }
        _lastOutlinedMesh = null

        if (node instanceof Mesh) {
            node.renderOutline = true
            node.outlineColor = new Color3(0, 0, 0)
            node.outlineWidth = 0.05
            _lastOutlinedMesh = node

            if (gm) {
                const gizmo = untrack(selectedGizmo)
                gm.positionGizmoEnabled = gizmo === 'position'
                gm.rotationGizmoEnabled = gizmo === 'rotation'
                gm.scaleGizmoEnabled = gizmo === 'scale'
                gm.boundingBoxGizmoEnabled = gizmo === 'boundingBox'
                gm.attachToMesh(node)
                hookGizmoDrag()
            }
        } else if (gm) {
            gm.positionGizmoEnabled = false
            gm.rotationGizmoEnabled = false
            gm.scaleGizmoEnabled = false
            gm.boundingBoxGizmoEnabled = false
        }
    })

    onMount(async () => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement
        const eng = new Engine(canvas, true)
        const initializedHavok = await getInitializedHavok()
        const physicsPlugin = new HavokPlugin(true, initializedHavok)

        let scene: Scene
        let dynamicNames: string[]
        const savedJson = sceneJson()
        if (savedJson) {
            try {
                const result = await loadSceneFromJson(
                    eng,
                    savedJson,
                    physicsPlugin
                )
                scene = result.scene
                dynamicNames = result.dynamicPhysicsMeshNames
            } catch {
                const result = createDefaultScene(eng, physicsPlugin)
                scene = result.scene
                dynamicNames = result.dynamicPhysicsMeshNames
            }
        } else {
            const result = createDefaultScene(eng, physicsPlugin)
            scene = result.scene
            dynamicNames = result.dynamicPhysicsMeshNames
        }

        setupEditorCamera(scene, canvas)
        setDynamicPhysicsMeshNames(dynamicNames)

        const utilityLayer = new UtilityLayerRenderer(scene)
        const gizmoManager = new GizmoManager(scene, undefined, utilityLayer)
        gizmoManager.positionGizmoEnabled = false
        gizmoManager.rotationGizmoEnabled = false
        gizmoManager.scaleGizmoEnabled = false
        gizmoManager.enableAutoPicking = false
        gizmoManager.boundingBoxGizmoEnabled = false
        let pointerDownPos: { x: number; y: number } | null = null
        let hasDragged = false
        const DRAG_THRESHOLD = 5
        canvas.addEventListener('pointerdown', (e) => {
            pointerDownPos = { x: e.clientX, y: e.clientY }
            hasDragged = false
        })
        canvas.addEventListener('pointermove', (e) => {
            if (pointerDownPos && !hasDragged) {
                const dx = e.clientX - pointerDownPos.x
                const dy = e.clientY - pointerDownPos.y
                if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
                    hasDragged = true
                }
            }
        })
        canvas.addEventListener('pointerup', (e) => {
            // Only handle selection if this was a click (no drag)
            if (!hasDragged && pointerDownPos) {
                const result = scene.pick(
                    e.offsetX,
                    e.offsetY,
                    (node) => node instanceof Mesh
                )
                if (result.hit && result.pickedMesh) {
                    setSelectedNode(result.pickedMesh as Mesh)
                } else {
                    setSelectedNode(undefined)
                }
            }
            pointerDownPos = null
            hasDragged = false
        })
        setGizmoManager(gizmoManager)
        scene.onBeforeRenderObservable.add(() => {
            if (_isDraggingGizmo) setNodeTick((t) => t + 1)
        })
        setScene(scene)
        setEngine(eng)
        eng.runRenderLoop(() => scene.render())

        // Watch for canvas container resize
        const resizeObserver = new ResizeObserver(() => {
            eng.resize()
        })
        resizeObserver.observe(canvas.parentElement!)

        // On window resize
        window.addEventListener('resize', () => {
            eng.resize()
        })
    })

    return (
        <section class="bg-gray-900 text-gray-100 size-full p-2 flex flex-col">
            {/* Topbar */}
            <div class="flex items-center mb-2 bg-gray-800 p-2 rounded-md gap-5">
                <div class="flex items-center space-x-1">
                    <Button
                        variant={isPlaying() ? 'primary' : 'secondary'}
                        size="md"
                        onClick={async () => {
                            const s = scene()
                            if (!s) return
                            if (isPlaying()) {
                                // Stop scripts first
                                if (_scriptRuntime) {
                                    _scriptRuntime.stop()
                                    _scriptRuntime = null
                                }

                                for (const [mesh, agg] of _physicsAggregates) {
                                    agg.dispose()
                                    const snap = _transformSnapshots.get(mesh)
                                    if (snap) restoreTransform(mesh, snap)
                                }
                                _physicsAggregates.clear()
                                _transformSnapshots.clear()
                                setIsPlaying(false)
                            } else {
                                clearLogs()

                                for (const name of dynamicPhysicsMeshNames()) {
                                    const mesh = s.getMeshByName(
                                        name
                                    ) as Mesh | null
                                    if (!mesh) continue
                                    _transformSnapshots.set(
                                        mesh,
                                        captureTransformSnapshot(mesh)
                                    )
                                    const agg = new PhysicsAggregate(
                                        mesh,
                                        PhysicsShapeType.BOX,
                                        { mass: 1, restitution: 0.75 },
                                        s
                                    )
                                    _physicsAggregates.set(mesh, agg)
                                }

                                // Start scripts after physics
                                const canvas = document.getElementById(
                                    'canvas'
                                ) as HTMLCanvasElement
                                _scriptRuntime = new ScriptRuntime()
                                await _scriptRuntime.start(s, canvas)

                                setIsPlaying(true)
                            }
                        }}
                    >
                        <Icon path={isPlaying() ? stop : play} class="size-5" />
                        <span class="ml-2">
                            {isPlaying() ? 'Stop' : 'Play'}
                        </span>
                    </Button>
                    <Tooltip content="Save scene" position="bottom">
                        <IconButton
                            label="Save"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                const s = scene()
                                if (s && !isPlaying())
                                    setSceneJson(serializeScene(s))
                            }}
                        >
                            <Icon path={arrowDownTray} class="size-5" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip content="Load default scene" position="bottom">
                        <IconButton
                            label="Load default"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                if (isPlaying()) return
                                setSceneJson(null)
                                window.location.reload()
                            }}
                        >
                            <Icon path={arrowUpTray} class="size-5" />
                        </IconButton>
                    </Tooltip>
                </div>

                <div class="flex items-center space-x-1">
                    <Tooltip content="Rotate" position="bottom">
                        <IconButton
                            label="Rotate"
                            variant={
                                selectedGizmo() === 'rotation'
                                    ? 'primary'
                                    : 'ghost'
                            }
                            size="sm"
                            onClick={() => setSelectedGizmo('rotation')}
                        >
                            <Icon path={arrowPath} class="size-5" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip content="Scale" position="bottom">
                        <IconButton
                            label="Scale"
                            variant={
                                selectedGizmo() === 'scale'
                                    ? 'primary'
                                    : 'ghost'
                            }
                            size="sm"
                            onClick={() => setSelectedGizmo('scale')}
                        >
                            <Icon path={arrowsPointingOut} class="size-5" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip content="Move" position="bottom">
                        <IconButton
                            label="Move"
                            variant={
                                selectedGizmo() === 'position'
                                    ? 'primary'
                                    : 'ghost'
                            }
                            size="sm"
                            onClick={() => setSelectedGizmo('position')}
                        >
                            <Icon path={arrowsRightLeft} class="size-5" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip content="Bounding Box" position="bottom">
                        <IconButton
                            label="Bounding Box"
                            variant={
                                selectedGizmo() === 'boundingBox'
                                    ? 'primary'
                                    : 'ghost'
                            }
                            size="sm"
                            onClick={() => setSelectedGizmo('boundingBox')}
                        >
                            <Icon path={cubeTransparent} class="size-5" />
                        </IconButton>
                    </Tooltip>
                </div>
            </div>
            <Resizable
                sizes={sizes()}
                onSizesChange={(sizes) => {
                    setSizes(sizes)
                    engine()?.resize()
                }}
                class="size-full overflow-hidden"
            >
                <Resizable.Panel
                    initialSize={0.2}
                    minSize={0.05}
                    class="bg-gray-800 p-2 rounded-md"
                >
                    <AIPanel />
                </Resizable.Panel>
                <Resizable.Handle
                    class="group basis-3 px-1"
                    startIntersection={false}
                    endIntersection={false}
                >
                    <Handle />
                </Resizable.Handle>

                <Resizable.Panel
                    initialSize={0.75}
                    minSize={0.1}
                    class="h-full"
                >
                    <Resizable
                        orientation="vertical"
                        class="size-full"
                        sizes={sceneSizes()}
                        onSizesChange={(sizes) => {
                            setSceneSizes(sizes)
                            engine()?.resize()
                        }}
                    >
                        <Resizable.Panel
                            initialSize={0.9}
                            minSize={0.1}
                            class="bg-gray-800 p-2 rounded-md h-full overflow-hidden flex flex-col"
                        >
                            <Tabs
                                tabs={[
                                    { id: 'viewport', label: 'Viewport' },
                                    { id: 'script', label: 'Script' },
                                ]}
                                defaultTab="viewport"
                                activeTab={viewportTab}
                                onChange={(id) => setViewportTab(id)}
                                class="flex flex-col flex-1 min-h-0"
                                contentClass="flex-1 min-h-0 flex flex-col"
                            >
                                <TabPanel
                                    tabId="viewport"
                                    class="flex-1 min-h-0"
                                >
                                    <ViewportPanel />
                                </TabPanel>
                                <TabPanel tabId="script" class="flex-1 min-h-0">
                                    <ScriptPanel />
                                </TabPanel>
                            </Tabs>
                        </Resizable.Panel>
                        <Resizable.Handle class="group basis-3 py-1">
                            <Handle />
                        </Resizable.Handle>
                        <Resizable.Panel
                            initialSize={0.1}
                            minSize={0.05}
                            class="bg-gray-800 p-2 rounded-md h-full overflow-hidden"
                        >
                            <Tabs
                                tabs={[
                                    { id: 'console', label: 'Console' },
                                    { id: 'assets', label: 'Assets' },
                                ]}
                                defaultTab="console"
                                class="flex flex-col flex-1 min-h-0"
                                contentClass="flex-1 min-h-0 flex flex-col"
                            >
                                <TabPanel
                                    tabId="console"
                                    class="flex-1 min-h-0"
                                >
                                    <ConsolePanel />
                                </TabPanel>
                                <TabPanel tabId="assets" class="flex-1 min-h-0">
                                    <AssetPanel />
                                </TabPanel>
                            </Tabs>
                        </Resizable.Panel>
                    </Resizable>
                </Resizable.Panel>
                <Resizable.Handle
                    class="group basis-3 px-1"
                    startIntersection={false}
                    endIntersection={false}
                >
                    <Handle />
                </Resizable.Handle>
                <Resizable.Panel
                    initialSize={0.2}
                    minSize={0.15}
                    class="size-full"
                >
                    <Resizable
                        orientation="vertical"
                        class="size-full"
                        sizes={propertiesSizes()}
                        onSizesChange={(sizes) => {
                            setPropertiesSizes(sizes)
                            engine()?.resize()
                        }}
                    >
                        <Resizable.Panel
                            initialSize={0.5}
                            minSize={0.05}
                            class="bg-gray-800 p-2 rounded-md size-full overflow-y-auto"
                        >
                            <ScenePanel
                                scene={scene}
                                selectedNode={selectedNode}
                                setSelectedNode={setSelectedNode}
                                nodeTick={nodeTick}
                                setNodeTick={setNodeTick}
                            />
                        </Resizable.Panel>
                        <Resizable.Handle class="group basis-3 py-1">
                            <Handle />
                        </Resizable.Handle>
                        <Resizable.Panel
                            initialSize={0.5}
                            minSize={0.05}
                            class="bg-gray-800 p-2 rounded-md overflow-y-auto"
                        >
                            <PropertiesPanel
                                node={() => {
                                    nodeTick()
                                    return selectedNode()
                                }}
                                setNodeTick={setNodeTick}
                                scriptAssets={scriptAssets}
                            />
                        </Resizable.Panel>
                    </Resizable>
                </Resizable.Panel>
            </Resizable>
        </section>
    )
}
