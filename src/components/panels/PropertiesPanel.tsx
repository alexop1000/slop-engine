import {
    Camera,
    FreeCamera,
    Light,
    Mesh,
    Node,
    ShadowLight,
    StandardMaterial,
    TransformNode,
} from 'babylonjs'
import {
    Accessor,
    Setter,
    Show,
    Switch,
    Match,
    For,
    createSignal,
    createEffect,
} from 'solid-js'
import {
    Checkbox,
    Collapsible,
    Color3Input,
    Input,
    Vector3Input,
    Button,
    Select,
} from '../ui'
import { openScriptFile } from '../../scriptEditorStore'

const fmt = (v: number | undefined) => v?.toFixed(3)

function TransformProperties(
    props: Readonly<{ node: () => TransformNode | undefined }>
) {
    return (
        <Collapsible title="Transform">
            <div class="flex flex-col gap-2">
                <div>
                    <div class="text-xs text-gray-400 mb-1">Position</div>
                    <Vector3Input
                        value={() => props.node()?.position}
                        onChange={(axis, value) => {
                            const n = props.node()
                            if (n) n.position[axis] = value
                        }}
                    />
                </div>
                <div>
                    <div class="text-xs text-gray-400 mb-1">Rotation</div>
                    <Vector3Input
                        value={() => props.node()?.rotation}
                        onChange={(axis, value) => {
                            const n = props.node()
                            if (n) n.rotation[axis] = value
                        }}
                    />
                </div>
                <div>
                    <div class="text-xs text-gray-400 mb-1">Scale</div>
                    <Vector3Input
                        value={() => props.node()?.scaling}
                        onChange={(axis, value) => {
                            const n = props.node()
                            if (n) n.scaling[axis] = value
                        }}
                    />
                </div>
            </div>
        </Collapsible>
    )
}

function MaterialProperties(props: Readonly<{ node: () => Mesh | undefined }>) {
    const material = () =>
        props.node()?.material as StandardMaterial | undefined

    return (
        <Show when={material()}>
            <Collapsible title="Material">
                <div class="flex flex-col gap-2 pb-2">
                    <Color3Input
                        label="Diffuse"
                        value={() => material()?.diffuseColor}
                        onChange={(c) => {
                            const m = material()
                            if (m) m.diffuseColor = c
                        }}
                    />
                    <Color3Input
                        label="Specular"
                        value={() => material()?.specularColor}
                        onChange={(c) => {
                            const m = material()
                            if (m) m.specularColor = c
                        }}
                    />
                    <Color3Input
                        label="Emissive"
                        value={() => material()?.emissiveColor}
                        onChange={(c) => {
                            const m = material()
                            if (m) m.emissiveColor = c
                        }}
                    />
                    <Color3Input
                        label="Ambient"
                        value={() => material()?.ambientColor}
                        onChange={(c) => {
                            const m = material()
                            if (m) m.ambientColor = c
                        }}
                    />
                    <Input
                        label="Alpha"
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={fmt(material()?.alpha)}
                        onChange={(e) => {
                            const m = material()
                            if (m)
                                m.alpha = Number.parseFloat(
                                    e.currentTarget.value
                                )
                        }}
                    />
                    <Input
                        label="Specular Power"
                        type="number"
                        min="0"
                        step="1"
                        value={fmt(material()?.specularPower)}
                        onChange={(e) => {
                            const m = material()
                            if (m)
                                m.specularPower = Number.parseFloat(
                                    e.currentTarget.value
                                )
                        }}
                    />
                    <Input
                        label="Roughness"
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={fmt(material()?.roughness)}
                        onChange={(e) => {
                            const m = material()
                            if (m)
                                m.roughness = Number.parseFloat(
                                    e.currentTarget.value
                                )
                        }}
                    />
                    <Checkbox
                        label="Wireframe"
                        checked={material()?.wireframe}
                        onChange={(e) => {
                            const m = material()
                            if (m) m.wireframe = e.currentTarget.checked
                        }}
                    />
                    <Checkbox
                        label="Backface Culling"
                        checked={material()?.backFaceCulling}
                        onChange={(e) => {
                            const m = material()
                            if (m) m.backFaceCulling = e.currentTarget.checked
                        }}
                    />
                </div>
            </Collapsible>
        </Show>
    )
}

/** Read the scripts array from node.metadata, or return []. */
function getNodeScripts(node: Node): string[] {
    const meta = node.metadata as { scripts?: string[] } | undefined
    return meta?.scripts ?? []
}

/** Set the scripts array on node.metadata (preserving other metadata). */
function setNodeScripts(node: Node, scripts: string[]): void {
    if (!node.metadata) node.metadata = {}
    const meta = node.metadata as Record<string, unknown>
    meta.scripts = scripts.length > 0 ? scripts : undefined
}

function ScriptProperties(
    props: Readonly<{
        node: () => Node | undefined
        scriptAssets: Accessor<string[]>
        setNodeTick: Setter<number>
    }>
) {
    const [addPath, setAddPath] = createSignal('')

    const attachedScripts = () => {
        const n = props.node()
        if (!n) return []
        // Force dependency on nodeTick for reactivity
        return getNodeScripts(n)
    }

    const availableScripts = () => {
        const attached = new Set(attachedScripts())
        return props.scriptAssets().filter((p) => !attached.has(p))
    }

    // Auto-select when there's only one available script
    createEffect(() => {
        const avail = availableScripts()
        if (avail.length === 1) {
            setAddPath(avail[0])
        } else if (!avail.includes(addPath())) {
            setAddPath('')
        }
    })

    const addScript = () => {
        const n = props.node()
        const path = addPath()
        if (!n || !path) return
        const current = getNodeScripts(n)
        if (!current.includes(path)) {
            setNodeScripts(n, [...current, path])
            props.setNodeTick((t) => t + 1)
        }
        setAddPath('')
    }

    const removeScript = (path: string) => {
        const n = props.node()
        if (!n) return
        setNodeScripts(
            n,
            getNodeScripts(n).filter((s) => s !== path)
        )
        props.setNodeTick((t) => t + 1)
    }

    return (
        <Collapsible title="Scripts">
            <div class="flex flex-col gap-2 pb-2">
                <For each={attachedScripts()}>
                    {(path) => (
                        <div class="flex items-center justify-between bg-gray-800 rounded px-2 py-1 text-xs">
                            <button
                                type="button"
                                class="text-blue-400 hover:text-blue-300 truncate text-left flex-1"
                                onClick={() => openScriptFile(path)}
                                title="Open in editor"
                            >
                                {path}
                            </button>
                            <button
                                type="button"
                                class="text-gray-500 hover:text-red-400 ml-2 shrink-0"
                                onClick={() => removeScript(path)}
                                title="Remove script"
                            >
                                ✕
                            </button>
                        </div>
                    )}
                </For>
                <Show when={availableScripts().length > 0}>
                    <div class="flex gap-1">
                        <Select
                            options={availableScripts().map((p) => ({
                                value: p,
                                label: p,
                            }))}
                            placeholder="Add script..."
                            value={addPath()}
                            onChange={(e) => setAddPath(e.currentTarget.value)}
                            class="py-1! text-xs!"
                        />
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={addScript}
                            disabled={!addPath()}
                        >
                            +
                        </Button>
                    </div>
                </Show>
                <Show
                    when={
                        attachedScripts().length === 0 &&
                        availableScripts().length === 0
                    }
                >
                    <p class="text-xs text-gray-500">
                        No script files in assets
                    </p>
                </Show>
            </div>
        </Collapsible>
    )
}

export default function PropertiesPanel(
    props: Readonly<{
        node: Accessor<Node | undefined>
        setNodeTick: Setter<number>
        scriptAssets: Accessor<string[]>
    }>
) {
    const meshNode = () => props.node() as Mesh | undefined
    const transformNode = () => props.node() as TransformNode | undefined
    const lightNode = () => props.node() as ShadowLight | undefined
    const cameraNode = () => props.node() as FreeCamera | undefined

    return (
        <>
            <h2 class="text-sm font-semibold text-gray-200 mb-2">Properties</h2>
            <div class="flex flex-col gap-1">
                <Show when={props.node()}>
                    <Input
                        label="Name"
                        value={props.node()?.name}
                        onChange={(e) => {
                            props.node()!.name = e.currentTarget.value
                            props.setNodeTick((t) => t + 1)
                        }}
                    />
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                        Class: {props.node()?.getClassName()}
                    </label>
                </Show>
                <Show when={props.node() instanceof TransformNode}>
                    <TransformProperties node={transformNode} />
                </Show>
                <Show when={props.node() instanceof Mesh}>
                    <Collapsible title="Physics">
                        <Checkbox
                            label="Enabled"
                            checked={meshNode()?.metadata?.physicsEnabled}
                            onChange={(e) => {
                                const m = meshNode()
                                if (m)
                                    m.metadata.physicsEnabled =
                                        e.currentTarget.checked
                            }}
                        />
                        <Input
                            label="Mass"
                            type="number"
                            min="0"
                            step="0.1"
                            value={fmt(meshNode()?.metadata?.physicsMass)}
                            onChange={(e) => {
                                const m = meshNode()
                                if (m)
                                    m.metadata.physicsMass = Number.parseFloat(
                                        e.currentTarget.value
                                    )
                            }}
                        />
                    </Collapsible>
                    <Collapsible title="Rendering">
                        <div class="flex flex-col gap-2">
                            <Input
                                label="Visibility"
                                type="number"
                                min="0"
                                max="1"
                                step="0.05"
                                value={fmt(meshNode()?.visibility)}
                                onChange={(e) => {
                                    const m = meshNode()
                                    if (m)
                                        m.visibility = Number.parseFloat(
                                            e.currentTarget.value
                                        )
                                }}
                            />
                            <Checkbox
                                label="Visible"
                                checked={meshNode()?.isVisible}
                                onChange={(e) => {
                                    const m = meshNode()
                                    if (m) m.isVisible = e.currentTarget.checked
                                }}
                            />
                            <Checkbox
                                label="Pickable"
                                checked={meshNode()?.isPickable}
                                onChange={(e) => {
                                    const m = meshNode()
                                    if (m)
                                        m.isPickable = e.currentTarget.checked
                                }}
                            />
                            <Checkbox
                                label="Receive Shadows"
                                checked={meshNode()?.receiveShadows}
                                onChange={(e) => {
                                    const m = meshNode()
                                    if (m)
                                        m.receiveShadows =
                                            e.currentTarget.checked
                                }}
                            />
                            <Checkbox
                                label="Check Collisions"
                                checked={meshNode()?.checkCollisions}
                                onChange={(e) => {
                                    const m = meshNode()
                                    if (m)
                                        m.checkCollisions =
                                            e.currentTarget.checked
                                }}
                            />
                        </div>
                    </Collapsible>
                    <MaterialProperties node={meshNode} />
                </Show>
                <Switch>
                    <Match when={props.node() instanceof Light}>
                        <>
                            <Collapsible title="Transform">
                                <Vector3Input
                                    value={() => lightNode()?.position}
                                    onChange={(axis, value) => {
                                        const l = lightNode()
                                        if (l) l.position[axis] = value
                                    }}
                                />
                            </Collapsible>

                            <Collapsible title="Light">
                                <div class="flex flex-col gap-2">
                                    <Input
                                        label="Intensity"
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={fmt(lightNode()?.intensity)}
                                        onChange={(e) => {
                                            const l = lightNode()
                                            if (l)
                                                l.intensity = Number.parseFloat(
                                                    e.currentTarget.value
                                                )
                                        }}
                                    />
                                    <Color3Input
                                        label="Diffuse"
                                        value={() => lightNode()?.diffuse}
                                        onChange={(c) => {
                                            const l = lightNode()
                                            if (l) l.diffuse = c
                                        }}
                                    />
                                    <Color3Input
                                        label="Specular"
                                        value={() => lightNode()?.specular}
                                        onChange={(c) => {
                                            const l = lightNode()
                                            if (l) l.specular = c
                                        }}
                                    />
                                    <Input
                                        label="Range"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={fmt(lightNode()?.range)}
                                        onChange={(e) => {
                                            const l = lightNode()
                                            if (l)
                                                l.range = Number.parseFloat(
                                                    e.currentTarget.value
                                                )
                                        }}
                                    />
                                    <Input
                                        label="Radius"
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={fmt(lightNode()?.radius)}
                                        onChange={(e) => {
                                            const l = lightNode()
                                            if (l)
                                                l.radius = Number.parseFloat(
                                                    e.currentTarget.value
                                                )
                                        }}
                                    />
                                    <Input
                                        label="Shadow Min Z"
                                        type="number"
                                        step="0.1"
                                        value={fmt(lightNode()?.shadowMinZ)}
                                        onChange={(e) => {
                                            const l = lightNode()
                                            if (l)
                                                l.shadowMinZ =
                                                    Number.parseFloat(
                                                        e.currentTarget.value
                                                    )
                                        }}
                                    />
                                    <Input
                                        label="Shadow Max Z"
                                        type="number"
                                        step="0.1"
                                        value={fmt(lightNode()?.shadowMaxZ)}
                                        onChange={(e) => {
                                            const l = lightNode()
                                            if (l)
                                                l.shadowMaxZ =
                                                    Number.parseFloat(
                                                        e.currentTarget.value
                                                    )
                                        }}
                                    />
                                    <Checkbox
                                        label="Enabled"
                                        checked={lightNode()?.isEnabled()}
                                        onChange={(e) => {
                                            const l = lightNode()
                                            if (l)
                                                l.setEnabled(
                                                    e.currentTarget.checked
                                                )
                                        }}
                                    />
                                </div>
                            </Collapsible>
                        </>
                    </Match>
                    <Match when={props.node() instanceof Camera}>
                        <>
                            <Collapsible title="Transform">
                                <Vector3Input
                                    value={() => cameraNode()?.position}
                                    onChange={(axis, value) => {
                                        const c = cameraNode()
                                        if (c) c.position[axis] = value
                                    }}
                                />
                            </Collapsible>
                            <Collapsible title="Camera">
                                <div class="flex flex-col gap-2">
                                    <Input
                                        label="FOV"
                                        type="number"
                                        min="0.1"
                                        max="3.14"
                                        step="0.05"
                                        value={fmt(cameraNode()?.fov)}
                                        onChange={(e) => {
                                            const c = cameraNode()
                                            if (c)
                                                c.fov = Number.parseFloat(
                                                    e.currentTarget.value
                                                )
                                        }}
                                    />
                                    <Input
                                        label="Near Clip (minZ)"
                                        type="number"
                                        min="0.01"
                                        step="0.1"
                                        value={fmt(cameraNode()?.minZ)}
                                        onChange={(e) => {
                                            const c = cameraNode()
                                            if (c)
                                                c.minZ = Number.parseFloat(
                                                    e.currentTarget.value
                                                )
                                        }}
                                    />
                                    <Input
                                        label="Far Clip (maxZ)"
                                        type="number"
                                        min="1"
                                        step="10"
                                        value={fmt(cameraNode()?.maxZ)}
                                        onChange={(e) => {
                                            const c = cameraNode()
                                            if (c)
                                                c.maxZ = Number.parseFloat(
                                                    e.currentTarget.value
                                                )
                                        }}
                                    />
                                    <Input
                                        label="Speed"
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={fmt(cameraNode()?.speed)}
                                        onChange={(e) => {
                                            const c = cameraNode()
                                            if (c)
                                                c.speed = Number.parseFloat(
                                                    e.currentTarget.value
                                                )
                                        }}
                                    />
                                    <Input
                                        label="Inertia"
                                        type="number"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={fmt(cameraNode()?.inertia)}
                                        onChange={(e) => {
                                            const c = cameraNode()
                                            if (c)
                                                c.inertia = Number.parseFloat(
                                                    e.currentTarget.value
                                                )
                                        }}
                                    />
                                </div>
                            </Collapsible>
                        </>
                    </Match>
                </Switch>
                <Show when={props.node()}>
                    <ScriptProperties
                        node={() => props.node()}
                        scriptAssets={props.scriptAssets}
                        setNodeTick={props.setNodeTick}
                    />
                </Show>
            </div>
        </>
    )
}
