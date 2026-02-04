import { createSignal, onMount } from 'solid-js'
import {
    Engine,
    Scene,
    MeshBuilder,
    Mesh,
    Color3,
    StandardMaterial,
    GizmoManager,
    Vector3,
    HavokPlugin,
    PhysicsAggregate,
    PhysicsShapeType,
} from 'babylonjs'
import HavokPhysics, { HavokPhysicsWithBindings } from '@babylonjs/havok'

import Resizable from 'corvu/resizable'
import { makePersisted } from '@solid-primitives/storage'
import { minus, pause, play, plus, stop } from 'solid-heroicons/solid'
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
import { Button, IconButton, Tooltip } from '../components/ui'

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

    const [isPlaying, setIsPlaying] = createSignal(false)
    const [box, setBox] = createSignal<Mesh>()
    const [box2, setBox2] = createSignal<Mesh>()
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

    onMount(async () => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement
        const engine = new Engine(canvas, true)
        const scene = new Scene(engine)
        scene.createDefaultCamera(true, true, true)
        scene.createDefaultLight(true)

        scene.activeCamera!.position = new Vector3(0, 5, -20)

        const initializedHavok = await getInitializedHavok()
        console.log(initializedHavok)
        const physicsPlugin = new HavokPlugin(true, initializedHavok)
        scene.enablePhysics(new Vector3(0, -9.81, 0), physicsPlugin)

        const ground = MeshBuilder.CreateGround(
            'ground1',
            { width: 100, height: 100, subdivisions: 2 },
            scene
        )
        ground.position.y = -1
        const groundMaterial = new StandardMaterial('ground', scene)
        groundMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5)
        groundMaterial.specularColor = new Color3(1, 1, 1)
        groundMaterial.specularPower = 1111
        groundMaterial.roughness = 0.1
        ground.material = groundMaterial

        const groundAggregate = new PhysicsAggregate(
            ground,
            PhysicsShapeType.BOX,
            { mass: 0 },
            scene
        )

        const box = MeshBuilder.CreateBox('box', { size: 2 }, scene)
        box.position.y = 3
        const box2 = MeshBuilder.CreateBox('box', { size: 2 }, scene)
        box2.position.y = 6
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
        setBox2(box2)
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
                <div class="flex items-center space-x-1">
                    <Button
                        variant={isPlaying() ? 'primary' : 'secondary'}
                        size="md"
                        onClick={() => {
                            if (!isPlaying()) {
                                const boxAggregate = new PhysicsAggregate(
                                    box()!,
                                    PhysicsShapeType.BOX,
                                    { mass: 1, restitution: 0.75 },
                                    scene()
                                )
                                const boxAggregate2 = new PhysicsAggregate(
                                    box2()!,
                                    PhysicsShapeType.BOX,
                                    { mass: 1, restitution: 0.75 },
                                    scene()
                                )
                            }
                            setIsPlaying(!isPlaying())
                        }}
                    >
                        <Icon path={isPlaying() ? stop : play} class="size-5" />
                        <span class="ml-2">
                            {isPlaying() ? 'Stop' : 'Play'}
                        </span>
                    </Button>
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

                <div class="flex items-center space-x-1">
                    <Tooltip content="Add Object" position="bottom">
                        <IconButton
                            label="Add Object"
                            variant="ghost"
                            size="sm"
                        >
                            <Icon path={plus} class="size-4" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip content="Remove Object" position="bottom">
                        <IconButton
                            label="Remove Object"
                            variant="ghost"
                            size="sm"
                        >
                            <Icon path={minus} class="size-4" />
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
