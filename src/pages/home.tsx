import { createSignal, onMount } from 'solid-js'
import {
    Engine,
    Scene,
    MeshBuilder,
    Mesh,
    Color3,
    StandardMaterial,
    GizmoManager,
} from 'babylonjs'
import Resizable from 'corvu/resizable'
import { makePersisted } from '@solid-primitives/storage'
import { minus, plus } from 'solid-heroicons/solid'
import {
    arrowPath,
    arrowsPointingOut,
    arrowsRightLeft,
    cubeTransparent,
} from 'solid-heroicons/outline'
import { Icon } from 'solid-heroicons'
import Handle from '../components/Handle'
import {
    AIPanel,
    ViewportPanel,
    ConsolePanel,
    ScenePanel,
    PropertiesPanel,
} from '../components/panels'

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

    const [box, setBox] = createSignal<Mesh>()
    const [scale, setScale] = createSignal(1)
    const [scene, setScene] = createSignal<Scene>()
    const [selectedNode, setSelectedNode] = createSignal<Mesh>()
    const [engine, setEngine] = createSignal<Engine>()

    const [gizmoManager, setGizmoManager] = createSignal<GizmoManager>()
    const [selectedGizmo, _setSelectedGizmo] = createSignal<
        'position' | 'rotation' | 'scale' | 'boundingBox'
    >('position')

    const setSelectedGizmo = (
        gizmo: 'position' | 'rotation' | 'scale' | 'boundingBox'
    ) => {
        _setSelectedGizmo(gizmo)
        gizmoManager()!.positionGizmoEnabled = gizmo === 'position'
        gizmoManager()!.rotationGizmoEnabled = gizmo === 'rotation'
        gizmoManager()!.scaleGizmoEnabled = gizmo === 'scale'
        gizmoManager()!.boundingBoxGizmoEnabled = gizmo === 'boundingBox'
        gizmoManager()?.attachToMesh(selectedNode() as Mesh)
    }

    onMount(() => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement
        const engine = new Engine(canvas, true)
        const scene = new Scene(engine)
        scene.createDefaultCamera(true, true, true)
        scene.createDefaultLight(true)
        const box = MeshBuilder.CreateBox('box', { size: 2 }, scene)
        const box2 = MeshBuilder.CreateBox('box', { size: 2 }, scene)
        box.position.y = 1
        box2.position.y = 4
        const redMaterial = new StandardMaterial('box', scene)
        redMaterial.diffuseColor = new Color3(1, 0, 0)
        redMaterial.specularColor = new Color3(1, 1, 1)
        redMaterial.specularPower = 100
        box.material = redMaterial
        box2.material = redMaterial
        const gizmoManager = new GizmoManager(scene)
        gizmoManager.positionGizmoEnabled = false
        gizmoManager.rotationGizmoEnabled = false
        gizmoManager.scaleGizmoEnabled = false
        gizmoManager.enableAutoPicking = false
        let lastResult: any = null
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
                    (node) => node.name === 'box'
                )
                if (result.hit) {
                    if (lastResult?.pickedMesh) {
                        lastResult.pickedMesh.material = redMaterial
                    }
                    lastResult = result
                    if (result.pickedMesh) {
                        setSelectedNode(result.pickedMesh as Mesh)
                        result.pickedMesh.material = new StandardMaterial(
                            'selected',
                            scene
                        )
                        if (selectedGizmo() === 'position') {
                            gizmoManager.positionGizmoEnabled = true
                        } else if (selectedGizmo() === 'rotation') {
                            gizmoManager.rotationGizmoEnabled = true
                        } else if (selectedGizmo() === 'scale') {
                            gizmoManager.scaleGizmoEnabled = true
                        } else if (selectedGizmo() === 'boundingBox') {
                            gizmoManager.boundingBoxGizmoEnabled = true
                        }
                        gizmoManager.attachToMesh(result.pickedMesh as Mesh)
                    }
                } else {
                    setSelectedNode(undefined)
                    if (lastResult?.pickedMesh) {
                        lastResult.pickedMesh.material = redMaterial
                    }
                    gizmoManager.positionGizmoEnabled = false
                    gizmoManager.rotationGizmoEnabled = false
                    gizmoManager.scaleGizmoEnabled = false
                    gizmoManager.boundingBoxGizmoEnabled = false
                }
            }
            pointerDownPos = null
            hasDragged = false
        })
        setGizmoManager(gizmoManager)
        setBox(box)
        setScene(scene)
        setEngine(engine)
        engine.runRenderLoop(() => scene.render())

        // Watch for canvas container resize
        const resizeObserver = new ResizeObserver(() => {
            engine.resize()
        })
        resizeObserver.observe(canvas.parentElement!)

        // On window resize
        window.addEventListener('resize', () => {
            engine.resize()
        })
    })

    return (
        <section class="bg-gray-900 text-gray-100 size-full p-2 flex flex-col">
            {/* Topbar */}
            <div class="flex items-center justify-between mb-2 bg-gray-800 p-2 rounded-md">
                <h1 class="text-lg font-bold">Scene Editor</h1>
                <div class="flex items-center space-x-2">
                    <button
                        onClick={() => setSelectedGizmo('rotation')}
                        class={
                            selectedGizmo() === 'rotation'
                                ? 'bg-gray-700 rounded-md p-1'
                                : 'p-1'
                        }
                    >
                        <Icon path={arrowPath} class="size-5" />
                    </button>
                    <button
                        onClick={() => setSelectedGizmo('scale')}
                        class={
                            selectedGizmo() === 'scale'
                                ? 'bg-gray-700 rounded-md p-1'
                                : 'p-1'
                        }
                    >
                        <Icon path={arrowsPointingOut} class="size-5" />
                    </button>
                    <button
                        onClick={() => setSelectedGizmo('position')}
                        class={
                            selectedGizmo() === 'position'
                                ? 'bg-gray-700 rounded-md p-1'
                                : 'p-1'
                        }
                    >
                        <Icon path={arrowsRightLeft} class="size-5" />
                    </button>
                    <button
                        onClick={() => setSelectedGizmo('boundingBox')}
                        class={
                            selectedGizmo() === 'boundingBox'
                                ? 'bg-gray-700 rounded-md p-1'
                                : 'p-1'
                        }
                    >
                        <Icon path={cubeTransparent} class="size-5" />
                    </button>
                </div>

                <div class="flex items-center space-x-2">
                    <button>
                        <Icon path={plus} class="size-4" />
                    </button>
                    <button>
                        <Icon path={minus} class="size-4" />
                    </button>
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
                            class="bg-gray-800 p-2 rounded-md h-full overflow-hidden"
                        >
                            <ViewportPanel />
                        </Resizable.Panel>
                        <Resizable.Handle class="group basis-3 py-1">
                            <Handle />
                        </Resizable.Handle>
                        <Resizable.Panel
                            initialSize={0.1}
                            minSize={0.05}
                            class="bg-gray-800 p-2 rounded-md h-full overflow-hidden"
                        >
                            <ConsolePanel />
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
                    initialSize={0.15}
                    minSize={0.05}
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
                            class="bg-gray-800 p-2 rounded-md size-full"
                        >
                            <ScenePanel />
                        </Resizable.Panel>
                        <Resizable.Handle class="group basis-3 py-1">
                            <Handle />
                        </Resizable.Handle>
                        <Resizable.Panel
                            initialSize={0.5}
                            minSize={0.05}
                            class="bg-gray-800 p-2 rounded-md"
                        >
                            <PropertiesPanel />
                        </Resizable.Panel>
                    </Resizable>
                </Resizable.Panel>
            </Resizable>
        </section>
    )
}
