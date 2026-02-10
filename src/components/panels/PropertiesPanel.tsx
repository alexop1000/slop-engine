import {
    Camera,
    FreeCamera,
    Light,
    Mesh,
    Node,
    ShadowLight,
    StandardMaterial,
    TransformNode,
    Vector3,
} from 'babylonjs'
import { Accessor, Show, Switch, Match } from 'solid-js'
import { Checkbox, Collapsible, Color3Input, Input, Vector3Input } from '../ui'

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

export default function PropertiesPanel(
    props: Readonly<{ node: Accessor<Node | undefined> }>
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
                        }}
                    />
                </Show>
                <Show when={props.node() instanceof TransformNode}>
                    <TransformProperties node={transformNode} />
                </Show>
                <Show when={props.node() instanceof Mesh}>
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
            </div>
        </>
    )
}
