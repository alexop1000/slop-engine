import {
    Camera,
    FreeCamera,
    Light,
    Mesh,
    Node,
    ShadowLight,
    StandardMaterial,
    Texture,
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
    onCleanup,
    JSXElement,
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
import { getBlob } from '../../assetStore'
import {
    parseScriptNodeType,
    getNodeTypeName,
} from '../../scripting/ScriptRuntime'
import type { ScriptNodeType } from '../../scripting/Script'

const fmt = (v: number | undefined) => v?.toFixed(3)

const sectionHeaderClass = 'border-b border-gray-700/40 pb-1 -mx-1 px-1'
const sectionContentClass = 'pl-2 pt-0.5 pb-2 border-l border-gray-700/50 ml-1'
const propertyGroupClass =
    'rounded bg-gray-900/50 border border-gray-700/30 px-2 py-1.5'

interface PropertyGroupProps {
    title: string
    children: JSXElement
}

interface NumberFieldProps {
    label: string
    value: () => number | undefined
    onChange: (value: number) => void
    min?: string
    max?: string
    step?: string
}

interface BooleanFieldProps {
    label: string
    checked: () => boolean | undefined
    onChange: (checked: boolean) => void
}

function PropertyGroup(props: Readonly<PropertyGroupProps>) {
    return (
        <div class={propertyGroupClass}>
            <div class="text-xs font-medium text-gray-400 mb-1">
                {props.title}
            </div>
            {props.children}
        </div>
    )
}

function NumberField(props: Readonly<NumberFieldProps>) {
    return (
        <Input
            label={props.label}
            type="number"
            min={props.min}
            max={props.max}
            step={props.step}
            value={fmt(props.value())}
            onInput={(e) => {
                const value = Number.parseFloat(e.currentTarget.value)
                if (Number.isNaN(value)) return
                props.onChange(value)
            }}
        />
    )
}

function BooleanField(props: Readonly<BooleanFieldProps>) {
    return (
        <Checkbox
            label={props.label}
            checked={props.checked()}
            onChange={(e) => props.onChange(e.currentTarget.checked)}
        />
    )
}

function ensureNodeMetadata(node: Node): Record<string, unknown> {
    if (!node.metadata) node.metadata = {}
    return node.metadata as Record<string, unknown>
}

interface TextureTransformValues {
    textureTiling: [number, number]
    textureOffset: [number, number]
    textureRotation: number
}

function defaultTextureTransformValues(): TextureTransformValues {
    return {
        textureTiling: [1, 1],
        textureOffset: [0, 0],
        textureRotation: 0,
    }
}

function readTexturePair(
    value: unknown,
    fallback: [number, number]
): [number, number] {
    if (
        Array.isArray(value) &&
        value.length >= 2 &&
        typeof value[0] === 'number' &&
        !Number.isNaN(value[0]) &&
        typeof value[1] === 'number' &&
        !Number.isNaN(value[1])
    ) {
        return [value[0], value[1]]
    }

    return fallback
}

function readTextureRotation(value: unknown, fallback: number): number {
    return typeof value === 'number' && !Number.isNaN(value) ? value : fallback
}

function getTextureTransformValues(
    texture: Texture | null | undefined,
    metadata: Record<string, unknown> | undefined
): TextureTransformValues {
    const fallback = defaultTextureTransformValues()

    if (texture instanceof Texture) {
        return {
            textureTiling: [texture.uScale, texture.vScale],
            textureOffset: [texture.uOffset, texture.vOffset],
            textureRotation: (texture.wAng * 180) / Math.PI,
        }
    }

    return {
        textureTiling: readTexturePair(
            metadata?.textureTiling,
            fallback.textureTiling
        ),
        textureOffset: readTexturePair(
            metadata?.textureOffset,
            fallback.textureOffset
        ),
        textureRotation: readTextureRotation(
            metadata?.textureRotation,
            fallback.textureRotation
        ),
    }
}

function applyTextureTransform(
    texture: Texture,
    values: TextureTransformValues
): void {
    texture.uScale = values.textureTiling[0]
    texture.vScale = values.textureTiling[1]
    texture.uOffset = values.textureOffset[0]
    texture.vOffset = values.textureOffset[1]
    texture.wAng = (values.textureRotation * Math.PI) / 180
}

function writeTextureTransformMetadata(
    metadata: Record<string, unknown>,
    values: TextureTransformValues
): void {
    metadata.textureTiling = [...values.textureTiling]
    metadata.textureOffset = [...values.textureOffset]
    metadata.textureRotation = values.textureRotation
}

function TransformProperties(
    props: Readonly<{
        node: () => TransformNode | undefined
        scheduleAutoSave: () => void
        pushUndoState: () => void
    }>
) {
    const updateNode = (updater: (node: TransformNode) => void) => {
        const node = props.node()
        if (!node) return
        props.pushUndoState()
        updater(node)
        props.scheduleAutoSave()
    }

    return (
        <Collapsible
            title="Transform"
            headerClass={sectionHeaderClass}
            contentClass={sectionContentClass}
        >
            <div class="flex flex-col gap-2">
                <PropertyGroup title="Position">
                    <Vector3Input
                        value={() => props.node()?.position}
                        onChange={(axis, value) => {
                            updateNode((node) => {
                                node.position[axis] = value
                            })
                        }}
                    />
                </PropertyGroup>
                <PropertyGroup title="Rotation">
                    <Vector3Input
                        value={() => props.node()?.rotation}
                        onChange={(axis, value) => {
                            updateNode((node) => {
                                node.rotation[axis] = value
                            })
                        }}
                    />
                </PropertyGroup>
                <PropertyGroup title="Scale">
                    <Vector3Input
                        value={() => props.node()?.scaling}
                        onChange={(axis, value) => {
                            updateNode((node) => {
                                node.scaling[axis] = value
                            })
                        }}
                    />
                </PropertyGroup>
            </div>
        </Collapsible>
    )
}

function MaterialProperties(
    props: Readonly<{
        node: () => Mesh | undefined
        imageAssets: () => string[]
        scheduleAutoSave: () => void
        pushUndoState: () => void
    }>
) {
    const material = () =>
        props.node()?.material as StandardMaterial | undefined

    const updateMaterial = (updater: (material: StandardMaterial) => void) => {
        const current = material()
        if (!current) return
        props.pushUndoState()
        updater(current)
        props.scheduleAutoSave()
    }

    const textureMetadata = () =>
        props.node()?.metadata as Record<string, unknown> | undefined

    const currentTexturePath = () => {
        return (
            (textureMetadata()?.diffuseTexturePath as string | undefined) ?? ''
        )
    }

    const currentTextureTransform = () => {
        const texture = material()?.diffuseTexture
        return getTextureTransformValues(
            texture instanceof Texture ? texture : undefined,
            textureMetadata()
        )
    }

    let textureBlobUrl: string | null = null

    function updateTextureTransform(
        updater: (current: TextureTransformValues) => void
    ) {
        const mesh = props.node()
        if (!mesh) return
        props.pushUndoState()

        const metadata = ensureNodeMetadata(mesh)
        const next = currentTextureTransform()
        updater(next)

        const texture = material()?.diffuseTexture
        if (texture instanceof Texture) applyTextureTransform(texture, next)

        writeTextureTransformMetadata(metadata, next)
        props.scheduleAutoSave()
    }

    async function applyTexture(path: string) {
        const m = material()
        const mesh = props.node()
        if (!m || !mesh) return
        const nextTransform = currentTextureTransform()
        if (m.diffuseTexture) {
            m.diffuseTexture.dispose()
            m.diffuseTexture = null
        }
        if (textureBlobUrl) {
            URL.revokeObjectURL(textureBlobUrl)
            textureBlobUrl = null
        }
        if (!path) {
            if (mesh.metadata) {
                const metadata = mesh.metadata as Record<string, unknown>
                delete metadata.diffuseTexturePath
                delete metadata.textureTiling
                delete metadata.textureOffset
                delete metadata.textureRotation
            }
            props.scheduleAutoSave()
            return
        }
        const blob = await getBlob(path)
        if (!blob) return
        const scene = mesh.getScene()
        if (!scene) return
        const url = URL.createObjectURL(blob)
        textureBlobUrl = url
        m.diffuseTexture = new Texture(url, scene)
        const meta = ensureNodeMetadata(mesh)
        if (m.diffuseTexture instanceof Texture) {
            applyTextureTransform(m.diffuseTexture, nextTransform)
        }
        meta.diffuseTexturePath = path
        writeTextureTransformMetadata(meta, nextTransform)
        props.scheduleAutoSave()
    }

    const textureOptions = () => [
        { label: '— None —', value: '' },
        ...props.imageAssets().map((p) => ({
            label: p.split('/').pop() ?? p,
            value: p,
        })),
    ]

    return (
        <Show when={material()}>
            <Collapsible
                title="Material"
                headerClass={sectionHeaderClass}
                contentClass={sectionContentClass}
            >
                <div class="flex flex-col gap-2 pt-0.5">
                    <Select
                        label="Diffuse Texture"
                        options={textureOptions()}
                        value={currentTexturePath()}
                        onChange={(e) =>
                            void applyTexture(e.currentTarget.value)
                        }
                    />
                    <PropertyGroup title="Texture Tiling">
                        <div class="grid grid-cols-2 gap-2">
                            <Input
                                label="U"
                                type="number"
                                step="0.1"
                                value={fmt(
                                    currentTextureTransform().textureTiling[0]
                                )}
                                onInput={(e) => {
                                    const value = Number.parseFloat(
                                        e.currentTarget.value
                                    )
                                    if (Number.isNaN(value)) return
                                    updateTextureTransform((current) => {
                                        current.textureTiling = [
                                            value,
                                            current.textureTiling[1],
                                        ]
                                    })
                                }}
                            />
                            <Input
                                label="V"
                                type="number"
                                step="0.1"
                                value={fmt(
                                    currentTextureTransform().textureTiling[1]
                                )}
                                onInput={(e) => {
                                    const value = Number.parseFloat(
                                        e.currentTarget.value
                                    )
                                    if (Number.isNaN(value)) return
                                    updateTextureTransform((current) => {
                                        current.textureTiling = [
                                            current.textureTiling[0],
                                            value,
                                        ]
                                    })
                                }}
                            />
                        </div>
                    </PropertyGroup>
                    <PropertyGroup title="Texture Offset">
                        <div class="grid grid-cols-2 gap-2">
                            <Input
                                label="U"
                                type="number"
                                step="0.01"
                                value={fmt(
                                    currentTextureTransform().textureOffset[0]
                                )}
                                onInput={(e) => {
                                    const value = Number.parseFloat(
                                        e.currentTarget.value
                                    )
                                    if (Number.isNaN(value)) return
                                    updateTextureTransform((current) => {
                                        current.textureOffset = [
                                            value,
                                            current.textureOffset[1],
                                        ]
                                    })
                                }}
                            />
                            <Input
                                label="V"
                                type="number"
                                step="0.01"
                                value={fmt(
                                    currentTextureTransform().textureOffset[1]
                                )}
                                onInput={(e) => {
                                    const value = Number.parseFloat(
                                        e.currentTarget.value
                                    )
                                    if (Number.isNaN(value)) return
                                    updateTextureTransform((current) => {
                                        current.textureOffset = [
                                            current.textureOffset[0],
                                            value,
                                        ]
                                    })
                                }}
                            />
                        </div>
                    </PropertyGroup>
                    <NumberField
                        label="Texture Rotation"
                        step="1"
                        value={() => currentTextureTransform().textureRotation}
                        onChange={(value) => {
                            updateTextureTransform((current) => {
                                current.textureRotation = value
                            })
                        }}
                    />
                    <Color3Input
                        label="Diffuse"
                        value={() => material()?.diffuseColor}
                        onChange={(c) =>
                            updateMaterial((material) => {
                                material.diffuseColor = c
                            })
                        }
                    />
                    <Color3Input
                        label="Specular"
                        value={() => material()?.specularColor}
                        onChange={(c) =>
                            updateMaterial((material) => {
                                material.specularColor = c
                            })
                        }
                    />
                    <Color3Input
                        label="Emissive"
                        value={() => material()?.emissiveColor}
                        onChange={(c) =>
                            updateMaterial((material) => {
                                material.emissiveColor = c
                            })
                        }
                    />
                    <Color3Input
                        label="Ambient"
                        value={() => material()?.ambientColor}
                        onChange={(c) =>
                            updateMaterial((material) => {
                                material.ambientColor = c
                            })
                        }
                    />
                    <NumberField
                        label="Alpha"
                        min="0"
                        max="1"
                        step="0.05"
                        value={() => material()?.alpha}
                        onChange={(value) =>
                            updateMaterial((material) => {
                                material.alpha = value
                            })
                        }
                    />
                    <NumberField
                        label="Specular Power"
                        min="0"
                        step="1"
                        value={() => material()?.specularPower}
                        onChange={(value) =>
                            updateMaterial((material) => {
                                material.specularPower = value
                            })
                        }
                    />
                    <NumberField
                        label="Roughness"
                        min="0"
                        max="1"
                        step="0.05"
                        value={() => material()?.roughness}
                        onChange={(value) =>
                            updateMaterial((material) => {
                                material.roughness = value
                            })
                        }
                    />
                    <BooleanField
                        label="Wireframe"
                        checked={() => material()?.wireframe}
                        onChange={(checked) =>
                            updateMaterial((material) => {
                                material.wireframe = checked
                            })
                        }
                    />
                    <BooleanField
                        label="Backface Culling"
                        checked={() => material()?.backFaceCulling}
                        onChange={(checked) =>
                            updateMaterial((material) => {
                                material.backFaceCulling = checked
                            })
                        }
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
    const meta = ensureNodeMetadata(node)
    meta.scripts = scripts.length > 0 ? scripts : undefined
}

function ScriptProperties(
    props: Readonly<{
        node: () => Node | undefined
        scriptAssets: Accessor<string[]>
        setNodeTick: Setter<number>
        scheduleAutoSave: () => void
        pushUndoState: () => void
    }>
) {
    const [addPath, setAddPath] = createSignal('')
    // Map of script path → parsed nodeType (undefined = any node)
    const [scriptTypes, setScriptTypes] = createSignal<
        Record<string, ScriptNodeType | undefined>
    >({})

    // Load and parse nodeType from each script asset whenever the list changes
    createEffect(() => {
        const paths = props.scriptAssets()
        if (paths.length === 0) {
            setScriptTypes({})
            return
        }

        let disposed = false

        void Promise.all(
            paths.map(async (path) => {
                const blob = await getBlob(path)
                const source = blob ? await blob.text() : undefined
                return [
                    path,
                    source ? parseScriptNodeType(source) : undefined,
                ] as const
            })
        ).then((entries) => {
            if (disposed) return
            setScriptTypes(Object.fromEntries(entries))
        })

        onCleanup(() => {
            disposed = true
        })
    })

    /** Check if a script is compatible with the currently selected node. */
    const isCompatible = (path: string): boolean => {
        const n = props.node()
        if (!n) return false
        const required = scriptTypes()[path]
        if (!required) return true // no constraint
        const nodeType = getNodeTypeName(n)
        switch (required) {
            case 'Node':
                return true
            case 'TransformNode':
                return nodeType === 'TransformNode' || nodeType === 'Mesh'
            case 'Mesh':
                return nodeType === 'Mesh'
            case 'Light':
                return nodeType === 'Light'
            default:
                return true
        }
    }

    const attachedScripts = () => {
        const n = props.node()
        if (!n) return []
        // Force dependency on nodeTick for reactivity
        return getNodeScripts(n)
    }

    const availableScripts = () => {
        const attached = new Set(attachedScripts())
        // Only show scripts compatible with this node type
        return props
            .scriptAssets()
            .filter((p) => !attached.has(p) && isCompatible(p))
    }

    /** Format a display label with node type badge. */
    const scriptLabel = (path: string): string => {
        const t = scriptTypes()[path]
        return t ? `${path}  [${t}]` : path
    }

    // Default to first available script so Add works without manual selection
    createEffect(() => {
        const avail = availableScripts()
        if (avail.length === 0) {
            setAddPath('')
        } else if (!avail.includes(addPath())) {
            setAddPath(avail[0])
        }
    })

    const addScript = () => {
        const n = props.node()
        const path = addPath()
        if (!n || !path) return
        const current = getNodeScripts(n)
        if (!current.includes(path)) {
            props.pushUndoState()
            setNodeScripts(n, [...current, path])
            props.setNodeTick((t) => t + 1)
            props.scheduleAutoSave()
        }
        setAddPath('')
    }

    const removeScript = (path: string) => {
        const n = props.node()
        if (!n) return
        props.pushUndoState()
        setNodeScripts(
            n,
            getNodeScripts(n).filter((s) => s !== path)
        )
        props.setNodeTick((t) => t + 1)
        props.scheduleAutoSave()
    }

    return (
        <Collapsible
            title="Scripts"
            headerClass={sectionHeaderClass}
            contentClass={sectionContentClass}
        >
            <div class="flex flex-col gap-2 pt-0.5">
                <Show when={availableScripts().length > 0}>
                    <div class={propertyGroupClass}>
                        <div class="text-xs font-medium text-gray-400 mb-1">
                            Add script
                        </div>
                        <div class="flex gap-2">
                            <Select
                                options={availableScripts().map((p) => ({
                                    value: p,
                                    label: scriptLabel(p),
                                }))}
                                placeholder="Choose script..."
                                value={addPath()}
                                onChange={(e) =>
                                    setAddPath(e.currentTarget.value)
                                }
                                class="flex-1 py-1.5! text-xs!"
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={addScript}
                                disabled={!addPath()}
                                class="shrink-0"
                            >
                                Add
                            </Button>
                        </div>
                    </div>
                </Show>
                <Show when={attachedScripts().length > 0}>
                    <div class={propertyGroupClass}>
                        <div class="text-xs font-medium text-gray-400 mb-1">
                            Attached
                        </div>
                        <div class="flex flex-col gap-1">
                            <For each={attachedScripts()}>
                                {(path) => (
                                    <div class="flex items-center justify-between gap-2 rounded bg-gray-800/50 px-2 py-1 text-xs">
                                        <button
                                            type="button"
                                            class="text-blue-400 hover:text-blue-300 truncate text-left flex-1 min-w-0"
                                            onClick={() =>
                                                void openScriptFile(path)
                                            }
                                            title="Load script; double-click it in Assets to open the editor"
                                        >
                                            {path}
                                        </button>
                                        <button
                                            type="button"
                                            class="text-gray-500 hover:text-red-400 shrink-0 p-0.5"
                                            onClick={() => removeScript(path)}
                                            title="Remove script"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                )}
                            </For>
                        </div>
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

function PhysicsProperties(
    props: Readonly<{
        node: () => Mesh | undefined
        scheduleAutoSave: () => void
        pushUndoState: () => void
    }>
) {
    const updateMesh = (updater: (mesh: Mesh) => void) => {
        const mesh = props.node()
        if (!mesh) return
        props.pushUndoState()
        updater(mesh)
        props.scheduleAutoSave()
    }

    const metadata = () =>
        props.node()?.metadata as Record<string, unknown> | undefined

    return (
        <Collapsible
            title="Physics"
            headerClass={sectionHeaderClass}
            contentClass={sectionContentClass}
        >
            <div class="flex flex-col gap-2 pt-0.5">
                <BooleanField
                    label="Enabled"
                    checked={() =>
                        metadata()?.physicsEnabled as boolean | undefined
                    }
                    onChange={(checked) => {
                        updateMesh((mesh) => {
                            ensureNodeMetadata(mesh).physicsEnabled = checked
                        })
                    }}
                />
                <NumberField
                    label="Mass"
                    min="0"
                    step="0.1"
                    value={() => metadata()?.physicsMass as number | undefined}
                    onChange={(value) => {
                        updateMesh((mesh) => {
                            ensureNodeMetadata(mesh).physicsMass = value
                        })
                    }}
                />
            </div>
        </Collapsible>
    )
}

function MeshRenderingProperties(
    props: Readonly<{
        node: () => Mesh | undefined
        scheduleAutoSave: () => void
        pushUndoState: () => void
    }>
) {
    const updateMesh = (updater: (mesh: Mesh) => void) => {
        const mesh = props.node()
        if (!mesh) return
        props.pushUndoState()
        updater(mesh)
        props.scheduleAutoSave()
    }

    return (
        <Collapsible
            title="Rendering"
            headerClass={sectionHeaderClass}
            contentClass={sectionContentClass}
        >
            <div class="flex flex-col gap-2 pt-0.5">
                <NumberField
                    label="Visibility"
                    min="0"
                    max="1"
                    step="0.05"
                    value={() => props.node()?.visibility}
                    onChange={(value) => {
                        updateMesh((mesh) => {
                            mesh.visibility = value
                        })
                    }}
                />
                <BooleanField
                    label="Visible"
                    checked={() => props.node()?.isVisible}
                    onChange={(checked) => {
                        updateMesh((mesh) => {
                            mesh.isVisible = checked
                        })
                    }}
                />
                <BooleanField
                    label="Pickable"
                    checked={() => props.node()?.isPickable}
                    onChange={(checked) => {
                        updateMesh((mesh) => {
                            mesh.isPickable = checked
                        })
                    }}
                />
                <BooleanField
                    label="Receive Shadows"
                    checked={() => props.node()?.receiveShadows}
                    onChange={(checked) => {
                        updateMesh((mesh) => {
                            mesh.receiveShadows = checked
                        })
                    }}
                />
                <BooleanField
                    label="Check Collisions"
                    checked={() => props.node()?.checkCollisions}
                    onChange={(checked) => {
                        updateMesh((mesh) => {
                            mesh.checkCollisions = checked
                        })
                    }}
                />
                <Select
                    label="Billboard Mode"
                    options={[
                        { label: 'None', value: '0' },
                        { label: 'All', value: '7' },
                        { label: 'X axis', value: '1' },
                        { label: 'Y axis', value: '2' },
                        { label: 'Z axis', value: '4' },
                    ]}
                    value={String(props.node()?.billboardMode ?? 0)}
                    onChange={(e) => {
                        updateMesh((mesh) => {
                            mesh.billboardMode = Number.parseInt(
                                e.currentTarget.value,
                                10
                            )
                        })
                    }}
                />
            </div>
        </Collapsible>
    )
}

function LightProperties(
    props: Readonly<{
        node: () => ShadowLight | undefined
        scheduleAutoSave: () => void
        pushUndoState: () => void
    }>
) {
    const updateLight = (updater: (light: ShadowLight) => void) => {
        const light = props.node()
        if (!light) return
        props.pushUndoState()
        updater(light)
        props.scheduleAutoSave()
    }

    return (
        <>
            <Collapsible title="Transform" contentClass={sectionContentClass}>
                <div class="pt-0.5">
                    <Vector3Input
                        value={() => props.node()?.position}
                        onChange={(axis, value) => {
                            updateLight((light) => {
                                light.position[axis] = value
                            })
                        }}
                    />
                </div>
            </Collapsible>

            <Collapsible
                title="Light"
                headerClass={sectionHeaderClass}
                contentClass={sectionContentClass}
            >
                <div class="flex flex-col gap-2 pt-0.5">
                    <NumberField
                        label="Intensity"
                        min="0"
                        step="0.1"
                        value={() => props.node()?.intensity}
                        onChange={(value) => {
                            updateLight((light) => {
                                light.intensity = value
                            })
                        }}
                    />
                    <Color3Input
                        label="Diffuse"
                        value={() => props.node()?.diffuse}
                        onChange={(color) => {
                            updateLight((light) => {
                                light.diffuse = color
                            })
                        }}
                    />
                    <Color3Input
                        label="Specular"
                        value={() => props.node()?.specular}
                        onChange={(color) => {
                            updateLight((light) => {
                                light.specular = color
                            })
                        }}
                    />
                    <NumberField
                        label="Range"
                        min="0"
                        step="1"
                        value={() => props.node()?.range}
                        onChange={(value) => {
                            updateLight((light) => {
                                light.range = value
                            })
                        }}
                    />
                    <NumberField
                        label="Radius"
                        min="0"
                        step="0.1"
                        value={() => props.node()?.radius}
                        onChange={(value) => {
                            updateLight((light) => {
                                light.radius = value
                            })
                        }}
                    />
                    <NumberField
                        label="Shadow Min Z"
                        step="0.1"
                        value={() => props.node()?.shadowMinZ}
                        onChange={(value) => {
                            updateLight((light) => {
                                light.shadowMinZ = value
                            })
                        }}
                    />
                    <NumberField
                        label="Shadow Max Z"
                        step="0.1"
                        value={() => props.node()?.shadowMaxZ}
                        onChange={(value) => {
                            updateLight((light) => {
                                light.shadowMaxZ = value
                            })
                        }}
                    />
                    <BooleanField
                        label="Enabled"
                        checked={() => props.node()?.isEnabled()}
                        onChange={(checked) => {
                            updateLight((light) => {
                                light.setEnabled(checked)
                            })
                        }}
                    />
                </div>
            </Collapsible>
        </>
    )
}

function CameraProperties(
    props: Readonly<{
        node: () => FreeCamera | undefined
        scheduleAutoSave: () => void
        pushUndoState: () => void
    }>
) {
    const updateCamera = (updater: (camera: FreeCamera) => void) => {
        const camera = props.node()
        if (!camera) return
        props.pushUndoState()
        updater(camera)
        props.scheduleAutoSave()
    }

    return (
        <>
            <Collapsible title="Transform" contentClass={sectionContentClass}>
                <div class="pt-0.5">
                    <Vector3Input
                        value={() => props.node()?.position}
                        onChange={(axis, value) => {
                            updateCamera((camera) => {
                                camera.position[axis] = value
                            })
                        }}
                    />
                </div>
            </Collapsible>
            <Collapsible
                title="Camera"
                headerClass={sectionHeaderClass}
                contentClass={sectionContentClass}
            >
                <div class="flex flex-col gap-2 pt-0.5">
                    <NumberField
                        label="FOV"
                        min="0.1"
                        max="3.14"
                        step="0.05"
                        value={() => props.node()?.fov}
                        onChange={(value) => {
                            updateCamera((camera) => {
                                camera.fov = value
                            })
                        }}
                    />
                    <NumberField
                        label="Near Clip (minZ)"
                        min="0.01"
                        step="0.1"
                        value={() => props.node()?.minZ}
                        onChange={(value) => {
                            updateCamera((camera) => {
                                camera.minZ = value
                            })
                        }}
                    />
                    <NumberField
                        label="Far Clip (maxZ)"
                        min="1"
                        step="10"
                        value={() => props.node()?.maxZ}
                        onChange={(value) => {
                            updateCamera((camera) => {
                                camera.maxZ = value
                            })
                        }}
                    />
                    <NumberField
                        label="Speed"
                        min="0"
                        step="0.1"
                        value={() => props.node()?.speed}
                        onChange={(value) => {
                            updateCamera((camera) => {
                                camera.speed = value
                            })
                        }}
                    />
                    <NumberField
                        label="Inertia"
                        min="0"
                        max="1"
                        step="0.05"
                        value={() => props.node()?.inertia}
                        onChange={(value) => {
                            updateCamera((camera) => {
                                camera.inertia = value
                            })
                        }}
                    />
                </div>
            </Collapsible>
        </>
    )
}

export default function PropertiesPanel(
    props: Readonly<{
        node: Accessor<Node | undefined>
        setNodeTick: Setter<number>
        scriptAssets: Accessor<string[]>
        imageAssets: Accessor<string[]>
        scheduleAutoSave: () => void
        pushUndoState: () => void
    }>
) {
    const meshNode = () => props.node() as Mesh | undefined
    const transformNode = () => props.node() as TransformNode | undefined
    const lightNode = () => {
        const node = props.node()
        return node instanceof ShadowLight ? node : undefined
    }
    const cameraNode = () => {
        const node = props.node()
        return node instanceof FreeCamera ? node : undefined
    }

    const updateNodeName = (name: string) => {
        const node = props.node()
        if (!node) return
        props.pushUndoState()
        node.name = name
        props.setNodeTick((tick) => tick + 1)
        props.scheduleAutoSave()
    }

    return (
        <>
            <h2 class="text-sm font-semibold text-gray-200 mb-2">Properties</h2>
            <div class="flex flex-col gap-2 pb-2">
                <Show when={props.node()}>
                    <div class={propertyGroupClass}>
                        <div class="flex flex-col gap-2">
                            <Input
                                label="Name"
                                value={props.node()?.name}
                                onInput={(e) =>
                                    updateNodeName(e.currentTarget.value)
                                }
                            />
                            <div>
                                <span class="text-xs font-medium text-gray-400">
                                    Class
                                </span>
                                <p class="text-sm text-gray-200 mt-0.5">
                                    {props.node()?.getClassName()}
                                </p>
                            </div>
                        </div>
                    </div>
                </Show>
                <Show when={props.node() instanceof TransformNode}>
                    <TransformProperties
                        node={transformNode}
                        scheduleAutoSave={props.scheduleAutoSave}
                        pushUndoState={props.pushUndoState}
                    />
                </Show>
                <Show when={props.node()}>
                    <ScriptProperties
                        node={() => props.node()}
                        scriptAssets={props.scriptAssets}
                        setNodeTick={props.setNodeTick}
                        scheduleAutoSave={props.scheduleAutoSave}
                        pushUndoState={props.pushUndoState}
                    />
                </Show>
                <Show when={props.node() instanceof Mesh}>
                    <PhysicsProperties
                        node={meshNode}
                        scheduleAutoSave={props.scheduleAutoSave}
                        pushUndoState={props.pushUndoState}
                    />
                    <MeshRenderingProperties
                        node={meshNode}
                        scheduleAutoSave={props.scheduleAutoSave}
                        pushUndoState={props.pushUndoState}
                    />
                    <MaterialProperties
                        node={meshNode}
                        imageAssets={props.imageAssets}
                        scheduleAutoSave={props.scheduleAutoSave}
                        pushUndoState={props.pushUndoState}
                    />
                </Show>
                <Switch>
                    <Match when={props.node() instanceof Light}>
                        <LightProperties
                            node={lightNode}
                            scheduleAutoSave={props.scheduleAutoSave}
                            pushUndoState={props.pushUndoState}
                        />
                    </Match>
                    <Match when={props.node() instanceof Camera}>
                        <CameraProperties
                            node={cameraNode}
                            scheduleAutoSave={props.scheduleAutoSave}
                            pushUndoState={props.pushUndoState}
                        />
                    </Match>
                </Switch>
            </div>
        </>
    )
}
