import { createSignal, createEffect, onMount, untrack } from 'solid-js'
import {
    Engine,
    Scene,
    MeshBuilder,
    Mesh,
    Node,
    Color3,
    StandardMaterial,
    GizmoManager,
    UtilityLayerRenderer,
    Vector3,
    HavokPlugin,
    PhysicsAggregate,
    PhysicsShapeType,
    UniversalCamera,
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
    const [selectedNode, setSelectedNode] = createSignal<Node>()
    const [engine, setEngine] = createSignal<Engine>()
    const [nodeTick, setNodeTick] = createSignal(0)

    const [gizmoManager, setGizmoManager] = createSignal<GizmoManager>()
    const [selectedGizmo, _setSelectedGizmo] = createSignal<
        'position' | 'rotation' | 'scale' | 'boundingBox'
    >('position')

    let _isDraggingGizmo = false
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
        const engine = new Engine(canvas, true)
        const scene = new Scene(engine)

        // Create UniversalCamera for WASD flying navigation
        const camera = new UniversalCamera(
            'camera',
            new Vector3(0, 5, -20),
            scene
        )
        camera.attachControl(canvas, true)

        // Set camera movement speed
        const normalSpeed = 0.5
        const fastSpeed = 1.5
        camera.speed = normalSpeed
        camera.angularSensibility = 2000

        // Enable WASD keys
        camera.keysUp.push(87) // W
        camera.keysDown.push(83) // S
        camera.keysLeft.push(65) // A
        camera.keysRight.push(68) // D

        // Enable flying mode (no gravity)
        camera.applyGravity = false

        // Set the camera as active
        scene.activeCamera = camera

        // Add shift key speed boost
        scene.onKeyboardObservable.add((kbInfo) => {
            if (kbInfo.type === 1) {
                // Key down
                if (kbInfo.event.key === 'Shift') {
                    camera.speed = fastSpeed
                }
                // If you press E make camera go up, Q go down
            } else if (kbInfo.type === 2) {
                // Key up
                if (kbInfo.event.key === 'Shift') {
                    camera.speed = normalSpeed
                }
            }
        })

        scene.createDefaultLight(true)

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

        const createRedMaterial = () => {
            const name = `red-material-${Math.random()
                .toString(36)
                .slice(2, 9)}`
            const redMaterial = new StandardMaterial(name, scene)
            redMaterial.diffuseColor = new Color3(1, 0, 0)
            redMaterial.specularColor = new Color3(1, 1, 1)
            redMaterial.specularPower = 100
            return redMaterial
        }

        const createGreenMaterial = () => {
            const name = `green-material-${Math.random()
                .toString(36)
                .slice(2, 9)}`
            const greenMaterial = new StandardMaterial(name, scene)
            greenMaterial.diffuseColor = new Color3(0, 1, 0)
            greenMaterial.specularColor = new Color3(1, 1, 1)
            greenMaterial.specularPower = 100
            return greenMaterial
        }

        const box = MeshBuilder.CreateBox('box', { size: 2 }, scene)
        box.position.y = 3
        const box2 = MeshBuilder.CreateBox('box2', { size: 2 }, scene)
        box2.position.y = 6
        box.material = createRedMaterial()
        box2.material = createRedMaterial()

        const childBox = MeshBuilder.CreateBox('child-box', { size: 1 }, scene)
        childBox.parent = box2
        childBox.position.y = 2
        childBox.material = createGreenMaterial()
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
            <div class="flex items-center mb-2 bg-gray-800 p-2 rounded-md gap-5">
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
                    initialSize={0.2 }
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
                            class="bg-gray-800 p-2 rounded-md size-full"
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
                            />
                        </Resizable.Panel>
                    </Resizable>
                </Resizable.Panel>
            </Resizable>
        </section>
    )
}
