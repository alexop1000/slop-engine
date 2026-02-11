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

export interface TransformSnapshot {
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
    scaling: { x: number; y: number; z: number }
}

export interface EditorSceneResult {
    scene: Scene
    dynamicPhysicsMeshNames: string[]
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

    const createRedMaterial = () => {
        const name = `red-material-${Math.random().toString(36).slice(2, 9)}`
        const redMaterial = new StandardMaterial(name, scene)
        redMaterial.diffuseColor = new Color3(1, 0, 0)
        redMaterial.specularColor = new Color3(1, 1, 1)
        redMaterial.specularPower = 100
        return redMaterial
    }

    const createGreenMaterial = () => {
        const name = `green-material-${Math.random().toString(36).slice(2, 9)}`
        const greenMaterial = new StandardMaterial(name, scene)
        greenMaterial.diffuseColor = new Color3(0, 1, 0)
        greenMaterial.specularColor = new Color3(1, 1, 1)
        greenMaterial.specularPower = 100
        return greenMaterial
    }

    const box = MeshBuilder.CreateBox('box', { size: 2 }, scene)
    box.position.y = 3
    box.metadata = { physicsMass: 1 }
    const box2 = MeshBuilder.CreateBox('box2', { size: 2 }, scene)
    box2.position.y = 6
    box2.metadata = { physicsMass: 1 }
    box.material = createRedMaterial()
    box2.material = createRedMaterial()

    const childBox = MeshBuilder.CreateBox('child-box', { size: 1 }, scene)
    childBox.parent = box2
    childBox.position.y = 2
    childBox.material = createGreenMaterial()

    return {
        scene,
        dynamicPhysicsMeshNames: ['box', 'box2'],
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

        const dynamicPhysicsMeshNames: string[] = []
        for (const mesh of scene.meshes) {
            if (mesh === ground) continue
            const meta = mesh.metadata as { physicsMass?: number } | undefined
            if (meta?.physicsMass !== undefined && meta.physicsMass > 0) {
                dynamicPhysicsMeshNames.push(mesh.name)
            }
        }
        if (dynamicPhysicsMeshNames.length === 0) {
            dynamicPhysicsMeshNames.push('box', 'box2')
        }

        return { scene, dynamicPhysicsMeshNames }
    } finally {
        URL.revokeObjectURL(url)
    }
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

    const camera = new UniversalCamera(
        'camera',
        new Vector3(0, 5, -20),
        scene
    )
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
