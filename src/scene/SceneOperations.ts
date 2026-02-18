import {
    Scene,
    Node,
    Mesh,
    Light,
    Camera,
    TransformNode,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Vector3,
    PointLight,
    DirectionalLight,
    SpotLight,
    HemisphericLight,
    SceneLoader,
    registerSceneLoaderPlugin,
} from 'babylonjs'
import { GLTFFileLoader, OBJFileLoader } from 'babylonjs-loaders'

// Register file loaders (BabylonJS 8 requires explicit registration)
registerSceneLoaderPlugin({
    name: 'gltf',
    extensions: {
        '.gltf': { isBinary: false, mimeType: 'model/gltf+json' },
        '.glb': { isBinary: true, mimeType: 'model/gltf-binary' },
    },
    createPlugin: () => new GLTFFileLoader(),
})
registerSceneLoaderPlugin({
    name: 'obj',
    extensions: { '.obj': { isBinary: false } },
    createPlugin: () => new OBJFileLoader(),
})

// ── Extension map for SceneLoader ───────────────────────────────────

const LOADER_EXT: Record<string, string> = {
    '.glb': '.glb',
    '.gltf': '.gltf',
    '.obj': '.obj',
    '.babylon': '.babylon',
}

function getLoaderExtension(filename: string): string | null {
    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    return LOADER_EXT[ext] ?? null
}

// ── Types ────────────────────────────────────────────────────────────

export interface MeshSize {
    width?: number
    height?: number
    depth?: number
    diameter?: number
    thickness?: number
}

export interface AddMeshOptions {
    type: string
    name?: string
    position?: [number, number, number]
    rotation?: [number, number, number]
    rotationDegrees?: [number, number, number]
    scale?: [number, number, number]
    color?: [number, number, number]
    size?: MeshSize
}

export interface AddLightOptions {
    type: string
    name?: string
    position?: [number, number, number]
    direction?: [number, number, number]
    intensity?: number
    color?: [number, number, number]
}

export interface UpdateNodeOptions {
    name: string
    position?: [number, number, number]
    rotation?: [number, number, number]
    rotationDegrees?: [number, number, number]
    scale?: [number, number, number]
    color?: [number, number, number]
    intensity?: number
    rename?: string
}

// ── Counter ──────────────────────────────────────────────────────────

let _counter = 0

export function nextName(prefix: string): string {
    _counter++
    return `${prefix}_${_counter}`
}

// ── Scene snapshot ───────────────────────────────────────────────────

interface NodeSnapshot {
    name: string
    type: string
    position?: [number, number, number]
    rotation?: [number, number, number]
    scale?: [number, number, number]
    color?: [number, number, number]
    intensity?: number
    direction?: [number, number, number]
    scripts?: string[]
    children?: NodeSnapshot[]
}

function vec3ToArray(v: {
    x: number
    y: number
    z: number
}): [number, number, number] {
    return [
        Math.round(v.x * 1000) / 1000,
        Math.round(v.y * 1000) / 1000,
        Math.round(v.z * 1000) / 1000,
    ]
}

function color3ToArray(c: {
    r: number
    g: number
    b: number
}): [number, number, number] {
    return [
        Math.round(c.r * 1000) / 1000,
        Math.round(c.g * 1000) / 1000,
        Math.round(c.b * 1000) / 1000,
    ]
}

function getNodeType(node: Node): string {
    if (node instanceof Mesh) return 'Mesh'
    if (node instanceof PointLight) return 'PointLight'
    if (node instanceof DirectionalLight) return 'DirectionalLight'
    if (node instanceof SpotLight) return 'SpotLight'
    if (node instanceof HemisphericLight) return 'HemisphericLight'
    if (node instanceof Camera) return 'Camera'
    if (node instanceof TransformNode) return 'TransformNode'
    return 'Node'
}

function snapshotNode(node: Node): NodeSnapshot {
    const snap: NodeSnapshot = {
        name: node.name,
        type: getNodeType(node),
    }

    if (node instanceof TransformNode) {
        snap.position = vec3ToArray(node.position)
        snap.rotation = vec3ToArray(node.rotation)
        snap.scale = vec3ToArray(node.scaling)
    } else if ('position' in node && node.position instanceof Vector3) {
        snap.position = vec3ToArray(node.position)
    }

    if (node instanceof Mesh) {
        const mat = node.material
        if (mat instanceof StandardMaterial) {
            snap.color = color3ToArray(mat.diffuseColor)
        }
    }

    if (node instanceof Light) {
        snap.intensity = Math.round(node.intensity * 1000) / 1000
        if ('diffuse' in node) {
            snap.color = color3ToArray(
                (node as Light & { diffuse: Color3 }).diffuse
            )
        }
        if ('direction' in node) {
            snap.direction = vec3ToArray(
                (node as Light & { direction: Vector3 }).direction
            )
        }
    }

    const meta = node.metadata as { scripts?: string[] } | undefined
    if (meta?.scripts?.length) {
        snap.scripts = meta.scripts
    }

    const children = node.getChildren()
    if (children.length > 0) {
        snap.children = children.map(snapshotNode)
    }

    return snap
}

export function getSceneSnapshot(scene: Scene): NodeSnapshot[] {
    return scene.rootNodes.map(snapshotNode)
}

// ── Add mesh ─────────────────────────────────────────────────────────

export function addMeshToScene(scene: Scene, options: AddMeshOptions): Mesh {
    const label = options.type[0].toUpperCase() + options.type.slice(1)
    const name = options.name ?? nextName(label)
    let mesh: Mesh

    const sz = options.size

    switch (options.type) {
        case 'box':
            mesh = MeshBuilder.CreateBox(
                name,
                {
                    width: sz?.width ?? 1,
                    height: sz?.height ?? 1,
                    depth: sz?.depth ?? 1,
                },
                scene
            )
            break
        case 'sphere':
            mesh = MeshBuilder.CreateSphere(
                name,
                { diameter: sz?.diameter ?? 1, segments: 16 },
                scene
            )
            break
        case 'cylinder':
            mesh = MeshBuilder.CreateCylinder(
                name,
                { height: sz?.height ?? 1, diameter: sz?.diameter ?? 1 },
                scene
            )
            break
        case 'cone':
            mesh = MeshBuilder.CreateCylinder(
                name,
                {
                    height: sz?.height ?? 1,
                    diameterTop: 0,
                    diameterBottom: sz?.diameter ?? 1,
                },
                scene
            )
            break
        case 'torus':
            mesh = MeshBuilder.CreateTorus(
                name,
                {
                    diameter: sz?.diameter ?? 1,
                    thickness: sz?.thickness ?? 0.3,
                    tessellation: 24,
                },
                scene
            )
            break
        case 'plane':
            mesh = MeshBuilder.CreatePlane(
                name,
                { width: sz?.width ?? 1, height: sz?.height ?? 1 },
                scene
            )
            break
        case 'pyramid':
            mesh = MeshBuilder.CreateCylinder(
                name,
                {
                    height: sz?.height ?? 1,
                    diameterTop: 0,
                    diameterBottom: sz?.diameter ?? 1,
                    tessellation: 4,
                },
                scene
            )
            break
        case 'ground':
            mesh = MeshBuilder.CreateGround(
                name,
                { width: sz?.width ?? 10, height: sz?.height ?? 10 },
                scene
            )
            break
        default:
            throw new Error(`Unknown mesh type: "${options.type}"`)
    }

    const mat = new StandardMaterial(`${name}_mat`, scene)
    if (options.color) {
        mat.diffuseColor = new Color3(
            options.color[0],
            options.color[1],
            options.color[2]
        )
    } else {
        mat.diffuseColor = new Color3(0.6, 0.6, 0.6)
    }
    mesh.material = mat
    mesh.metadata = { physicsMass: 1, physicsEnabled: false }

    if (options.position) {
        mesh.position = new Vector3(
            options.position[0],
            options.position[1],
            options.position[2]
        )
    } else if (options.type !== 'ground' && options.type !== 'plane') {
        mesh.position.y = 1
    }

    if (options.rotationDegrees) {
        const d = options.rotationDegrees
        mesh.rotation = new Vector3(
            (d[0] * Math.PI) / 180,
            (d[1] * Math.PI) / 180,
            (d[2] * Math.PI) / 180
        )
    } else if (options.rotation) {
        mesh.rotation = new Vector3(
            options.rotation[0],
            options.rotation[1],
            options.rotation[2]
        )
    }

    if (options.scale) {
        mesh.scaling = new Vector3(
            options.scale[0],
            options.scale[1],
            options.scale[2]
        )
    }

    return mesh
}

// ── Add light ────────────────────────────────────────────────────────

export function addLightToScene(scene: Scene, options: AddLightOptions): Light {
    const label = options.type[0].toUpperCase() + options.type.slice(1)
    const name = options.name ?? nextName(`${label}Light`)
    const pos = options.position
        ? new Vector3(
              options.position[0],
              options.position[1],
              options.position[2]
          )
        : new Vector3(0, 5, 0)
    const dir = options.direction
        ? new Vector3(
              options.direction[0],
              options.direction[1],
              options.direction[2]
          )
        : new Vector3(0, -1, 0)

    let light: Light

    switch (options.type) {
        case 'point':
            light = new PointLight(name, pos, scene)
            break
        case 'directional':
            light = new DirectionalLight(name, dir, scene)
            break
        case 'spot':
            light = new SpotLight(name, pos, dir, Math.PI / 3, 2, scene)
            break
        case 'hemispheric':
            light = new HemisphericLight(name, dir, scene)
            break
        default:
            throw new Error(`Unknown light type: "${options.type}"`)
    }

    if (options.intensity !== undefined) {
        light.intensity = options.intensity
    }

    if (options.color) {
        light.diffuse = new Color3(
            options.color[0],
            options.color[1],
            options.color[2]
        )
    }

    return light
}

// ── Update node ──────────────────────────────────────────────────────

export function updateNodeInScene(
    scene: Scene,
    options: UpdateNodeOptions
): Node {
    const node = scene.getNodeByName(options.name)
    if (!node) throw new Error(`Node "${options.name}" not found`)

    if (options.position && node instanceof TransformNode) {
        node.position = new Vector3(
            options.position[0],
            options.position[1],
            options.position[2]
        )
    }

    if (options.rotationDegrees && node instanceof TransformNode) {
        const d = options.rotationDegrees
        node.rotation = new Vector3(
            (d[0] * Math.PI) / 180,
            (d[1] * Math.PI) / 180,
            (d[2] * Math.PI) / 180
        )
    } else if (options.rotation && node instanceof TransformNode) {
        node.rotation = new Vector3(
            options.rotation[0],
            options.rotation[1],
            options.rotation[2]
        )
    }

    if (options.scale && node instanceof TransformNode) {
        node.scaling = new Vector3(
            options.scale[0],
            options.scale[1],
            options.scale[2]
        )
    }

    if (options.color) {
        const c = new Color3(
            options.color[0],
            options.color[1],
            options.color[2]
        )
        if (node instanceof Mesh && node.material instanceof StandardMaterial) {
            node.material.diffuseColor = c
        } else if (node instanceof Light) {
            node.diffuse = c
        }
    }

    if (options.intensity !== undefined && node instanceof Light) {
        node.intensity = options.intensity
    }

    if (options.rename) {
        node.name = options.rename
    }

    return node
}

// ── Delete node ──────────────────────────────────────────────────────

export function deleteNodeFromScene(scene: Scene, name: string): void {
    const node = scene.getNodeByName(name)
    if (!node) throw new Error(`Node "${name}" not found`)
    if (node === scene.activeCamera)
        throw new Error('Cannot delete the active camera')
    node.dispose()
}

// ── Create group ─────────────────────────────────────────────────────

export interface CreateGroupOptions {
    name: string
    position?: [number, number, number]
}

export function createGroupInScene(
    scene: Scene,
    options: CreateGroupOptions
): TransformNode {
    const name = options.name ?? nextName('Group')
    const group = new TransformNode(name, scene)
    if (options.position) {
        group.position = new Vector3(
            options.position[0],
            options.position[1],
            options.position[2]
        )
    }
    return group
}

// ── Set parent ───────────────────────────────────────────────────────

export function setParentInScene(
    scene: Scene,
    nodeName: string,
    parentName: string | null
): void {
    const node = scene.getNodeByName(nodeName)
    if (!node) throw new Error(`Node "${nodeName}" not found`)

    if (parentName === null) {
        if (node instanceof TransformNode) {
            node.setParent(null)
        }
        return
    }

    const parent = scene.getNodeByName(parentName)
    if (!parent) throw new Error(`Parent node "${parentName}" not found`)

    if (node instanceof TransformNode && parent instanceof TransformNode) {
        node.setParent(parent)
    } else {
        throw new Error(
            'Both node and parent must be TransformNodes for parenting'
        )
    }
}

// ── Bulk operations ──────────────────────────────────────────────────

export type BulkOperation =
    | ({ action: 'add_mesh' } & AddMeshOptions)
    | ({ action: 'add_light' } & AddLightOptions)
    | ({ action: 'update_node' } & UpdateNodeOptions)
    | ({ action: 'delete_node' } & { name: string })
    | ({ action: 'create_group' } & CreateGroupOptions)
    | ({ action: 'set_parent' } & { node: string; parent: string | null })

export interface BulkResult {
    index: number
    action: string
    success: boolean
    message: string
}

export function executeBulkOperations(
    scene: Scene,
    operations: BulkOperation[]
): BulkResult[] {
    const results: BulkResult[] = []

    for (let i = 0; i < operations.length; i++) {
        const op = operations[i]
        try {
            let message: string
            switch (op.action) {
                case 'add_mesh': {
                    const mesh = addMeshToScene(scene, op)
                    message = `Created ${op.type} "${mesh.name}"`
                    break
                }
                case 'add_light': {
                    const light = addLightToScene(scene, op)
                    message = `Created ${op.type} light "${light.name}"`
                    break
                }
                case 'update_node': {
                    updateNodeInScene(scene, op)
                    message = `Updated "${op.name}"`
                    break
                }
                case 'delete_node': {
                    deleteNodeFromScene(scene, op.name)
                    message = `Deleted "${op.name}"`
                    break
                }
                case 'create_group': {
                    const group = createGroupInScene(scene, op)
                    message = `Created group "${group.name}"`
                    break
                }
                case 'set_parent': {
                    setParentInScene(scene, op.node, op.parent)
                    message = op.parent
                        ? `Parented "${op.node}" under "${op.parent}"`
                        : `Unparented "${op.node}"`
                    break
                }
                default:
                    message = `Unknown action: "${
                        (op as { action: string }).action
                    }"`
            }
            results.push({
                index: i,
                action: op.action,
                success: true,
                message,
            })
        } catch (err) {
            results.push({
                index: i,
                action: op.action,
                success: false,
                message: err instanceof Error ? err.message : 'Unknown error',
            })
        }
    }

    return results
}

// ── Import model from blob ──────────────────────────────────────────

/**
 * Resolves sibling asset blobs by path.
 * Provided by the caller so SceneOperations stays decoupled from assetStore.
 */
export type AssetResolver = (path: string) => Promise<Blob | null>

/** MTL texture map directives we care about. */
const MTL_MAP_DIRECTIVES = [
    'map_Ka',
    'map_Kd',
    'map_Ks',
    'map_Ns',
    'map_d',
    'map_bump',
    'bump',
    'disp',
    'decal',
    'refl',
]

/**
 * For an OBJ file: inline the MTL as a base64 data URL and replace texture
 * references with blob URLs so the BabylonJS OBJ loader can resolve
 * everything without HTTP requests.
 */
async function prepareObjDataUrl(
    objBlob: Blob,
    assetDir: string,
    resolveAsset: AssetResolver
): Promise<{ url: string; textureBlobUrls: string[] }> {
    const textureBlobUrls: string[] = []
    let objText = await objBlob.text()

    const mtlMatch = objText.match(/^mtllib\s+(.+)$/m)
    if (!mtlMatch) {
        return { url: 'data:;base64,' + btoa(objText), textureBlobUrls }
    }

    const mtlFilename = mtlMatch[1].trim()
    const mtlPath = assetDir ? `${assetDir}/${mtlFilename}` : mtlFilename
    const mtlBlob = await resolveAsset(mtlPath)

    if (!mtlBlob) {
        return { url: 'data:;base64,' + btoa(objText), textureBlobUrls }
    }

    let mtlText = await mtlBlob.text()

    // Replace texture filenames in the MTL with blob URLs
    const resolved = new Map<string, string>()
    for (const directive of MTL_MAP_DIRECTIVES) {
        const regex = new RegExp(
            `^(${directive}\\s+(?:-[^\\s]+\\s+)*)(.+)$`,
            'gm'
        )
        let match
        while ((match = regex.exec(mtlText)) !== null) {
            const texFilename = match[2].trim()
            if (resolved.has(texFilename)) continue
            const texPath = assetDir
                ? `${assetDir}/${texFilename}`
                : texFilename
            const texBlob = await resolveAsset(texPath)
            if (texBlob) {
                const texUrl = URL.createObjectURL(texBlob)
                textureBlobUrls.push(texUrl)
                resolved.set(texFilename, texUrl)
            }
        }
    }
    for (const [texFilename, texUrl] of resolved) {
        const escaped = texFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        mtlText = mtlText.replace(new RegExp(escaped, 'g'), texUrl)
    }

    // Inline the modified MTL as a base64 data URL in the OBJ
    const mtlDataUrl = 'data:;base64,' + btoa(mtlText)
    objText = objText.replace(mtlMatch[0], 'mtllib ' + mtlDataUrl)

    return {
        url: 'data:;base64,' + btoa(objText),
        textureBlobUrls,
    }
}

export async function importModelToScene(
    scene: Scene,
    blob: Blob,
    filename: string,
    assetDir?: string,
    resolveAsset?: AssetResolver
): Promise<TransformNode> {
    const ext = getLoaderExtension(filename)
    if (!ext) {
        throw new Error(`Unsupported model format: "${filename}"`)
    }

    let url: string
    let blobUrlsToRevoke: string[] = []

    if (ext === '.obj' && resolveAsset) {
        // Inline MTL + texture blob URLs so the loader resolves everything
        const prepared = await prepareObjDataUrl(
            blob,
            assetDir ?? '',
            resolveAsset
        )
        url = prepared.url
        // Don't revoke texture blob URLs immediately – textures load async
    } else {
        url = URL.createObjectURL(blob)
        blobUrlsToRevoke = [url]
    }

    try {
        const result = await SceneLoader.ImportMeshAsync(
            '',
            '',
            url,
            scene,
            undefined,
            ext
        )

        // Create a root TransformNode to group all imported meshes
        const baseName = filename.slice(0, filename.lastIndexOf('.'))
        const root = new TransformNode(nextName(baseName), scene)

        for (const mesh of result.meshes) {
            if (!mesh.parent) {
                mesh.setParent(root)
            }
            if (mesh instanceof Mesh) {
                mesh.metadata = {
                    ...mesh.metadata,
                    physicsMass: 1,
                    physicsEnabled: false,
                }
            }
        }

        return root
    } finally {
        blobUrlsToRevoke.forEach(URL.revokeObjectURL)
    }
}
