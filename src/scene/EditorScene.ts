import {
    Engine,
    Scene,
    MeshBuilder,
    Mesh,
    Color3,
    StandardMaterial,
    Vector3,
    HavokPlugin,
    PhysicsAggregate,
    PhysicsShapeType,
    SceneSerializer,
    SceneLoader,
    UniversalCamera,
} from 'babylonjs'
import JSZip from 'jszip'
import { getAssetStore, getBlob, setBlob, type AssetNode } from '../assetStore'

export interface TransformSnapshot {
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
    scaling: { x: number; y: number; z: number }
}

export interface EditorSceneResult {
    scene: Scene
}

export function createDefaultScene(
    engine: Engine,
    physicsPlugin: HavokPlugin
): EditorSceneResult {
    const scene = new Scene(engine)
    scene.createDefaultLight(true)
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

    void new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene)

    return {
        scene,
    }
}

const PHYSICS_KEYS = [
    'physicsImpostor',
    'physicsBody',
    'physicsEngine',
    'impostor',
]

function stripPhysicsFromSerialized(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') return obj
    if (Array.isArray(obj)) return obj.map(stripPhysicsFromSerialized)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
        if (PHYSICS_KEYS.includes(k)) continue
        out[k] = stripPhysicsFromSerialized(v)
    }
    return out
}

export function serializeScene(scene: Scene): string {
    const serialized = SceneSerializer.Serialize(scene)
    const stripped = stripPhysicsFromSerialized(serialized)
    return JSON.stringify(stripped)
}

export function downloadScene(scene: Scene, filename = 'scene.babylon'): void {
    const json = serializeScene(scene)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}

export async function loadSceneFromJson(
    engine: Engine,
    json: string,
    physicsPlugin: HavokPlugin
): Promise<EditorSceneResult> {
    const parsed = JSON.parse(json) as unknown
    const stripped = stripPhysicsFromSerialized(parsed)
    const blob = new Blob([JSON.stringify(stripped)], {
        type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    try {
        const scene = await SceneLoader.LoadAsync(
            '',
            url,
            engine,
            undefined,
            '.babylon'
        )
        scene.enablePhysics(new Vector3(0, -9.81, 0), physicsPlugin)

        const ground = scene.getMeshByName('ground1')
        if (ground && !ground.physicsBody) {
            void new PhysicsAggregate(
                ground,
                PhysicsShapeType.BOX,
                { mass: 0 },
                scene
            )
        }

        return { scene }
    } finally {
        URL.revokeObjectURL(url)
    }
}

// ── Bundled export/import (scene + assets) ───────────────────────────

/**
 * Export the scene and all assets as a single `.slop` ZIP file.
 *
 * ZIP structure:
 *   scene.babylon       – serialised BabylonJS scene JSON
 *   asset-tree.json     – asset tree metadata
 *   assets/<path>       – each asset file blob
 */
export async function downloadSceneBundle(
    scene: Scene,
    filename = 'scene.slop'
): Promise<void> {
    const zip = new JSZip()

    // 1. Scene JSON
    const sceneJson = serializeScene(scene)
    zip.file('scene.babylon', sceneJson)

    // 2. Asset tree + blobs
    const store = getAssetStore()
    const tree = store.tree()
    zip.file('asset-tree.json', JSON.stringify(tree))

    const filePaths = store.collectFilePaths(tree)
    for (const path of filePaths) {
        const blob = await getBlob(path)
        if (blob) {
            zip.file(`assets/${path}`, blob)
        }
    }

    // 3. Generate & download
    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
}

/**
 * Import a `.slop` bundle – restores the asset tree and blobs into
 * IndexedDB and returns the scene JSON so the caller can reload.
 */
export async function importSceneBundle(
    file: File
): Promise<{ sceneJson: string; assetTree: AssetNode }> {
    const zip = await JSZip.loadAsync(file)

    // 1. Read scene JSON
    const sceneFile = zip.file('scene.babylon')
    if (!sceneFile) throw new Error('Bundle is missing scene.babylon')
    const sceneJson = await sceneFile.async('string')
    // Validate JSON
    JSON.parse(sceneJson)

    // 2. Read asset tree
    const treeFile = zip.file('asset-tree.json')
    let assetTree: AssetNode | null = null
    if (treeFile) {
        assetTree = JSON.parse(await treeFile.async('string')) as AssetNode
    }

    // 3. Restore asset blobs
    const assetPrefix = 'assets/'
    const assetEntries = Object.keys(zip.files).filter(
        (name) => name.startsWith(assetPrefix) && !zip.files[name].dir
    )
    for (const entry of assetEntries) {
        const assetPath = entry.slice(assetPrefix.length)
        const blob = await zip.files[entry].async('blob')
        await setBlob(assetPath, blob)
    }

    // 4. Provide a default empty tree if none was in the bundle
    assetTree ??= {
        id: '__root__',
        name: 'Assets',
        type: 'folder',
        path: '',
        children: [],
    }

    return { sceneJson, assetTree }
}

export function captureTransformSnapshot(mesh: Mesh): TransformSnapshot {
    const p = mesh.position
    const r = mesh.rotation
    const s = mesh.scaling
    return {
        position: { x: p.x, y: p.y, z: p.z },
        rotation: { x: r.x, y: r.y, z: r.z },
        scaling: { x: s.x, y: s.y, z: s.z },
    }
}

export function restoreTransform(mesh: Mesh, snap: TransformSnapshot): void {
    mesh.position.set(snap.position.x, snap.position.y, snap.position.z)
    mesh.rotationQuaternion = null
    mesh.rotation.set(snap.rotation.x, snap.rotation.y, snap.rotation.z)
    mesh.scaling.set(snap.scaling.x, snap.scaling.y, snap.scaling.z)
}

export function setupEditorCamera(
    scene: Scene,
    canvas: HTMLCanvasElement
): UniversalCamera {
    const existing = scene.cameras.find((c) => c.name === 'camera')
    if (existing) existing.dispose()

    const camera = new UniversalCamera('camera', new Vector3(0, 5, -20), scene)
    camera.attachControl(canvas, true)
    const normalSpeed = 0.5
    const fastSpeed = 1.5
    camera.speed = normalSpeed
    camera.angularSensibility = 2000
    camera.keysUp.push(87)
    camera.keysDown.push(83)
    camera.keysLeft.push(65)
    camera.keysRight.push(68)
    camera.applyGravity = false
    scene.activeCamera = camera

    scene.onKeyboardObservable.add((kbInfo) => {
        if (kbInfo.type === 1 && kbInfo.event.key === 'Shift') {
            camera.speed = fastSpeed
        } else if (kbInfo.type === 2 && kbInfo.event.key === 'Shift') {
            camera.speed = normalSpeed
        }
    })
    return camera
}

export function setupRuntimeCamera(
    scene: Scene,
    _canvas: HTMLCanvasElement
): UniversalCamera {
    const existing = scene.cameras.find((c) => c.name === 'camera')
    if (existing) existing.dispose()

    const camera = new UniversalCamera('camera', new Vector3(0, 5, -20), scene)
    camera.applyGravity = false
    camera.inertia = 0
    camera.inputs.clear()
    scene.activeCamera = camera
    return camera
}
