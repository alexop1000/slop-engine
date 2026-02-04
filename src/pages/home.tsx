import { createSignal, onMount } from 'solid-js'
import {
    Engine,
    Scene,
    MeshBuilder,
    Mesh,
    Color3,
    StandardMaterial,
} from 'babylonjs'
import Resizable from 'corvu/resizable'
import { makePersisted } from '@solid-primitives/storage'
import { minus, plus } from 'solid-heroicons/solid'
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
    onMount(() => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement
        const engine = new Engine(canvas, true)
        const scene = new Scene(engine)
        scene.createDefaultCamera(true, true, true)
        scene.createDefaultLight(true)
        const box = MeshBuilder.CreateBox('box', { size: 2 }, scene)
        box.position.y = 1
        const redMaterial = new StandardMaterial('box', scene)
        redMaterial.diffuseColor = new Color3(1, 0, 0)
        redMaterial.specularColor = new Color3(1, 1, 1)
        redMaterial.specularPower = 100
        box.material = redMaterial
        let lastResult: any = null
        canvas.addEventListener('click', (e) => {
            const result = scene.pick(
                e.offsetX,
                e.offsetY,
                (node) => node.name === 'box'
            )
            if (result.hit) {
                lastResult = result
                if (result.pickedMesh) {
                    setSelectedNode(result.pickedMesh as Mesh)
                    result.pickedMesh.material = new StandardMaterial(
                        'selected',
                        scene
                    )
                }
            } else {
                setSelectedNode(undefined)
                if (lastResult?.pickedMesh) {
                    lastResult.pickedMesh.material = redMaterial
                }
            }
        })
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
