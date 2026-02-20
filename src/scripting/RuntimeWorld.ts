import {
    Scene,
    Mesh,
    Node,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Vector3,
    PhysicsAggregate,
    PhysicsShapeType,
} from 'babylonjs'
import { pushLog } from './consoleStore'

/** Options for creating a primitive mesh at runtime. */
export interface SpawnPrimitiveOptions {
    type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane'
    name?: string
    position?: { x: number; y: number; z: number }
    rotation?: { x: number; y: number; z: number }
    scale?: { x: number; y: number; z: number }
    color?: { r: number; g: number; b: number }
    size?: {
        width?: number
        height?: number
        depth?: number
        diameter?: number
        thickness?: number
    }
    physics?: {
        mass?: number
        restitution?: number
    }
}

/**
 * Tracks and manages all objects created by scripts at runtime.
 *
 * When play mode stops, `disposeAll()` cleans up every runtime-created
 * node so the editor scene is left exactly as it was before play.
 */
export class RuntimeWorld {
    private _scene: Scene
    private _runtimeNodes: Set<Node> = new Set()
    private _physicsAggregates: Map<Mesh, PhysicsAggregate> = new Map()
    private _counter = 0

    constructor(scene: Scene) {
        this._scene = scene
    }

    private _nextName(prefix: string): string {
        this._counter++
        return `${prefix}_rt_${this._counter}`
    }

    /** Create a primitive mesh at runtime. */
    spawnPrimitive(options: SpawnPrimitiveOptions): Mesh {
        const name = options.name ?? this._nextName(options.type)
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
                    this._scene
                )
                break
            case 'sphere':
                mesh = MeshBuilder.CreateSphere(
                    name,
                    { diameter: sz?.diameter ?? 1, segments: 16 },
                    this._scene
                )
                break
            case 'cylinder':
                mesh = MeshBuilder.CreateCylinder(
                    name,
                    {
                        height: sz?.height ?? 1,
                        diameter: sz?.diameter ?? 1,
                    },
                    this._scene
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
                    this._scene
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
                    this._scene
                )
                break
            case 'plane':
                mesh = MeshBuilder.CreatePlane(
                    name,
                    {
                        width: sz?.width ?? 1,
                        height: sz?.height ?? 1,
                    },
                    this._scene
                )
                break
            default:
                throw new Error(`Unknown primitive type: "${options.type}"`)
        }

        // Default material
        const mat = new StandardMaterial(`${name}_mat`, this._scene)
        if (options.color) {
            mat.diffuseColor = new Color3(
                options.color.r,
                options.color.g,
                options.color.b
            )
        } else {
            mat.diffuseColor = new Color3(0.6, 0.6, 0.6)
        }
        mesh.material = mat

        // Transform
        if (options.position) {
            mesh.position = new Vector3(
                options.position.x,
                options.position.y,
                options.position.z
            )
        }
        if (options.rotation) {
            mesh.rotation = new Vector3(
                options.rotation.x,
                options.rotation.y,
                options.rotation.z
            )
        }
        if (options.scale) {
            mesh.scaling = new Vector3(
                options.scale.x,
                options.scale.y,
                options.scale.z
            )
        }

        // Track for cleanup
        this._runtimeNodes.add(mesh)

        // Physics (if requested)
        if (options.physics) {
            const agg = new PhysicsAggregate(
                mesh,
                PhysicsShapeType.CONVEX_HULL,
                {
                    mass: options.physics.mass ?? 1,
                    restitution: options.physics.restitution ?? 0.75,
                },
                this._scene
            )
            this._physicsAggregates.set(mesh, agg)
        }

        return mesh
    }

    /** Clone an existing mesh. Returns the new clone. */
    clone(source: Mesh, name?: string): Mesh {
        const cloneName = name ?? this._nextName(source.name + '_clone')
        const cloned = source.clone(cloneName, null)
        if (!cloned) {
            throw new Error(`Failed to clone mesh "${source.name}"`)
        }
        // Clone material so color changes don't affect the original
        if (source.material) {
            cloned.material = source.material.clone(cloneName + '_mat')
        }
        this._runtimeNodes.add(cloned)
        return cloned
    }

    /** Add physics to a mesh at runtime. */
    addPhysics(mesh: Mesh, mass = 1, restitution = 0.75): void {
        if (this._physicsAggregates.has(mesh)) {
            pushLog('warn', `Mesh "${mesh.name}" already has a physics body`)
            return
        }
        const agg = new PhysicsAggregate(
            mesh,
            PhysicsShapeType.CONVEX_HULL,
            { mass, restitution },
            this._scene
        )
        this._physicsAggregates.set(mesh, agg)
    }

    /** Destroy a runtime-created node immediately. */
    destroyNode(node: Node): void {
        if (!this._runtimeNodes.has(node)) {
            pushLog('warn', `Node "${node.name}" was not created at runtime`)
            return
        }
        // Dispose physics first if present
        if (node instanceof Mesh) {
            const agg = this._physicsAggregates.get(node)
            if (agg) {
                agg.dispose()
                this._physicsAggregates.delete(node)
            }
            if (node.material) {
                node.material.dispose()
            }
        }
        node.dispose()
        this._runtimeNodes.delete(node)
    }

    /** Dispose ALL runtime-created objects. Called by ScriptRuntime.stop(). */
    disposeAll(): void {
        for (const [, agg] of this._physicsAggregates) {
            agg.dispose()
        }
        this._physicsAggregates.clear()

        for (const node of this._runtimeNodes) {
            if (node instanceof Mesh && node.material) {
                node.material.dispose()
            }
            node.dispose()
        }
        this._runtimeNodes.clear()
    }
}
