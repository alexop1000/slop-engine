import {
    Scene,
    Mesh,
    Node,
    TransformNode,
    MeshBuilder,
    StandardMaterial,
    Color3,
    Vector3,
    PhysicsAggregate,
    PhysicsShapeType,
    Observer,
    HavokPlugin,
} from 'babylonjs'
import { pushLog } from './consoleStore'
import type { CollisionCallback, CollisionEvent } from './Script'
import { getBlob } from '../assetStore'
import { instantiatePrefabInScene } from '../scene/SceneOperations'

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

/** Options for spawning a prefab asset at runtime. */
export interface SpawnPrefabOptions {
    name?: string
    position?: { x: number; y: number; z: number }
    rotation?: { x: number; y: number; z: number }
    scale?: { x: number; y: number; z: number }
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

    /**
     * Maps a mesh uniqueId to the collision callbacks registered for that mesh.
     * Populated by ScriptRuntime when scripts call `onCollision` / `onCollisionEnd`.
     */
    private _collisionStartMap: Map<number, CollisionCallback[]> = new Map()
    private _collisionEndMap: Map<number, CollisionCallback[]> = new Map()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _collisionObserver: Observer<any> | null = null

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

        // Store size in metadata so scripts can query actual dimensions
        mesh.metadata = { size: sz ?? {} }

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
            // Allow direct position/rotation changes to move the body
            agg.body.disablePreStep = false
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

    /** Spawn a prefab asset from the asset store. Returns the root node. */
    async spawnPrefab(path: string, options?: SpawnPrefabOptions): Promise<Node> {
        const blob = await getBlob(path)
        if (!blob) {
            throw new Error(`Prefab not found: "${path}"`)
        }

        const json = await blob.text()
        const root = instantiatePrefabInScene(this._scene, json)

        if (options?.name) {
            root.name = options.name
        }

        if (root instanceof TransformNode) {
            if (options?.position) {
                root.position = new Vector3(
                    options.position.x,
                    options.position.y,
                    options.position.z
                )
            }
            if (options?.rotation) {
                root.rotation = new Vector3(
                    options.rotation.x,
                    options.rotation.y,
                    options.rotation.z
                )
            }
            if (options?.scale) {
                root.scaling = new Vector3(
                    options.scale.x,
                    options.scale.y,
                    options.scale.z
                )
            }
        }

        this._runtimeNodes.add(root)
        this._enablePrefabPhysics(root)

        return root
    }

    private _enablePrefabPhysics(root: Node): void {
        const stack: Node[] = [root]
        while (stack.length > 0) {
            const node = stack.pop()!

            if (node instanceof Mesh) {
                const meta = node.metadata as
                    | { physicsEnabled?: boolean; physicsMass?: number }
                    | undefined
                if (meta?.physicsEnabled) {
                    this.addPhysics(node, meta.physicsMass ?? 1, 0.75)
                }
            }

            for (const child of node.getChildren()) {
                stack.push(child)
            }
        }
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
        // Allow direct position/rotation changes to move the body
        agg.body.disablePreStep = false
        this._physicsAggregates.set(mesh, agg)
    }

    /** Destroy a runtime-created node immediately. */
    destroyNode(node: Node): void {
        if (!this._isManagedNode(node)) {
            pushLog('warn', `Node "${node.name}" was not created at runtime`)
            return
        }

        this._disposeNodeResources(node)
        node.dispose()
        this._runtimeNodes.delete(node)
    }

    private _isManagedNode(node: Node): boolean {
        let current: Node | null = node
        while (current) {
            if (this._runtimeNodes.has(current)) return true
            current = current.parent ?? null
        }
        return false
    }

    private _disposeNodeResources(root: Node): void {
        const stack: Node[] = [root]
        while (stack.length > 0) {
            const node = stack.pop()!

            if (node instanceof Mesh) {
                const agg = this._physicsAggregates.get(node)
                if (agg) {
                    agg.dispose()
                    this._physicsAggregates.delete(node)
                }
                if (node.material) {
                    node.material.dispose()
                }
                this._collisionStartMap.delete(node.uniqueId)
                this._collisionEndMap.delete(node.uniqueId)
            }

            this._runtimeNodes.delete(node)
            for (const child of node.getChildren()) {
                stack.push(child)
            }
        }
    }

    // -- Collision Observables ------------------------------------------------

    /**
     * Register collision-start callbacks for a mesh (by uniqueId).
     * Called by ScriptRuntime when it encounters scripts with registered callbacks.
     */
    registerCollisionStart(
        meshId: number,
        callbacks: CollisionCallback[]
    ): void {
        const existing = this._collisionStartMap.get(meshId)
        if (existing) {
            existing.push(...callbacks)
        } else {
            this._collisionStartMap.set(meshId, [...callbacks])
        }
    }

    /**
     * Register collision-end callbacks for a mesh (by uniqueId).
     */
    registerCollisionEnd(meshId: number, callbacks: CollisionCallback[]): void {
        const existing = this._collisionEndMap.get(meshId)
        if (existing) {
            existing.push(...callbacks)
        } else {
            this._collisionEndMap.set(meshId, [...callbacks])
        }
    }

    /**
     * Start listening for physics collision events from the Havok plugin.
     * Must be called after all scripts have registered their callbacks.
     */
    startCollisionObserver(): void {
        const engine = this._scene.getPhysicsEngine()
        if (!engine) return

        const plugin = engine.getPhysicsPlugin() as HavokPlugin | null
        if (!plugin || !plugin.onCollisionObservable) return

        this._collisionObserver = plugin.onCollisionObservable.add(
            (event: any) => {
                try {
                    const collider = event.collider?.transformNode as
                        | Mesh
                        | undefined
                    const collidedAgainst = event.collidedAgainst
                        ?.transformNode as Mesh | undefined

                    if (!collider || !collidedAgainst) return

                    const type = event.type
                    // BabylonJS collision types:
                    // 'COLLISION_STARTED' | 'COLLISION_CONTINUED' | 'COLLISION_FINISHED'
                    const isStart = type === 'COLLISION_STARTED'
                    const isEnd = type === 'COLLISION_FINISHED'

                    if (!isStart && !isEnd) return

                    // Extract contact point and normal from the event
                    const point = event.point ?? Vector3.Zero()
                    const normal = event.normal ?? Vector3.Up()
                    const impulse = event.impulse ?? 0

                    if (isStart) {
                        this._dispatchCollision(
                            this._collisionStartMap,
                            collider,
                            collidedAgainst,
                            point,
                            normal,
                            impulse
                        )
                    } else {
                        this._dispatchCollision(
                            this._collisionEndMap,
                            collider,
                            collidedAgainst,
                            point,
                            normal,
                            impulse
                        )
                    }
                } catch (err) {
                    pushLog('error', 'Error in collision handler:', String(err))
                }
            }
        )
    }

    /** Dispatch collision callbacks for both sides of a collision pair. */
    private _dispatchCollision(
        map: Map<number, CollisionCallback[]>,
        meshA: Mesh,
        meshB: Mesh,
        point: Vector3,
        normal: Vector3,
        impulse: number
    ): void {
        // Notify meshA about meshB
        const callbacksA = map.get(meshA.uniqueId)
        if (callbacksA) {
            const eventA: CollisionEvent = {
                other: meshB,
                point: point.clone(),
                normal: normal.clone(),
                impulse,
            }
            for (const cb of callbacksA) {
                try {
                    cb(eventA)
                } catch (err) {
                    pushLog(
                        'error',
                        'Error in onCollision callback:',
                        String(err)
                    )
                }
            }
        }

        // Notify meshB about meshA
        const callbacksB = map.get(meshB.uniqueId)
        if (callbacksB) {
            const eventB: CollisionEvent = {
                other: meshA,
                point: point.clone(),
                normal: normal.scale(-1), // Flip normal for the other perspective
                impulse,
            }
            for (const cb of callbacksB) {
                try {
                    cb(eventB)
                } catch (err) {
                    pushLog(
                        'error',
                        'Error in onCollision callback:',
                        String(err)
                    )
                }
            }
        }
    }

    /** Dispose ALL runtime-created objects. Called by ScriptRuntime.stop(). */
    disposeAll(): void {
        // Remove collision observer
        if (this._collisionObserver) {
            this._collisionObserver.remove()
            this._collisionObserver = null
        }
        this._collisionStartMap.clear()
        this._collisionEndMap.clear()

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
