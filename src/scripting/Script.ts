import {
    Scene,
    Node,
    Light,
    Mesh,
    TransformNode,
    UniversalCamera,
    Ray,
    Vector3,
    PickingInfo,
} from 'babylonjs'
import { InputManager } from './InputManager'
import type { RuntimeWorld } from './RuntimeWorld'
import { pushLog } from './consoleStore'

/** Information about a collision between two physics bodies. */
export interface CollisionEvent {
    /** The other mesh involved in the collision. */
    other: Mesh
    /** World-space contact point (approximate). */
    point: Vector3
    /** World-space contact normal pointing away from `other`. */
    normal: Vector3
    /** The impulse magnitude of the collision. */
    impulse: number
}

/** @internal */
export type CollisionCallback = (event: CollisionEvent) => void

/** Valid node type names for the static `nodeType` filter. */
export type ScriptNodeType = 'Node' | 'TransformNode' | 'Mesh' | 'Light'

/**
 * Runtime base class for user scripts.
 *
 * Properties (`node`, `scene`, `input`, etc.) are assigned by the
 * ScriptRuntime after construction but before `start()` is called.
 *
 * Use the generic parameter to declare what kind of node this script
 * attaches to. This gives you a correctly-typed `this.node` and
 * prevents the script from being attached to incompatible nodes.
 *
 * For convenience, use the pre-typed subclasses instead of the generic:
 * - `MeshScript`   — `this.node` is a `Mesh`
 * - `LightScript`  — `this.node` is a `Light`
 */
export class Script<N extends Node = TransformNode> {
    /**
     * Restrict which node types this script can be attached to.
     * Override in subclasses or set as a static property.
     * Valid values: `'Node'`, `'TransformNode'`, `'Mesh'`, `'Camera'`, `'Light'`.
     * When unset the script can attach to any node.
     */
    static nodeType?: ScriptNodeType

    /** The node this script is attached to. */
    node!: N

    /** The scene containing this node. */
    scene!: Scene

    /** Seconds elapsed since the last frame. */
    deltaTime = 0

    /** Seconds elapsed since play mode started. */
    time = 0

    /** Keyboard and mouse input state. */
    input!: InputManager

    /** The active runtime camera. */
    camera!: UniversalCamera

    // -- Lifecycle (overridden by user scripts) -------------------------------

    /** Called once when play mode starts. */
    start(): void {}

    /** Called every frame during play mode. */
    update(): void {}

    /** Called when play mode stops. */
    destroy(): void {}

    /** @internal Set by ScriptRuntime before start(). */
    _world!: RuntimeWorld

    /** @internal Lookup function set by ScriptRuntime before start(). */
    _lookup!: (nodeId: number, path: string) => Script | null

    /** GUI overlay — create buttons and labels that communicate with your script. */
    get gui(): RuntimeWorld['gui'] {
        return this._world.gui
    }

    /** @internal Collision callbacks registered by this script. */
    _collisionStartCallbacks: CollisionCallback[] = []
    _collisionEndCallbacks: CollisionCallback[] = []

    // -- Script references ----------------------------------------------------

    /** Get another script attached to this same node by its file path. */
    getScript<T = Script>(path: string): T | null {
        return this._lookup((this.node as any).uniqueId, path) as T | null
    }

    /** Get a script attached to a different node by its file path. */
    getScriptOn<T = Script>(node: Node, path: string): T | null {
        return this._lookup((node as any).uniqueId, path) as T | null
    }

    // -- Helpers --------------------------------------------------------------

    /** Find a node in the scene by name. */
    findNode(name: string): Node | null {
        return this.scene.getNodeByName(name)
    }

    /** Find a mesh in the scene by name. */
    findMesh(name: string): Mesh | null {
        return this.scene.getMeshByName(name) as Mesh | null
    }

    /** Log to the editor console panel. */
    log(...args: unknown[]): void {
        pushLog('log', ...args)
    }

    // -- Instance creation ----------------------------------------------------

    /** Create a primitive mesh at runtime. Cleaned up automatically on stop. */
    spawn(
        type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane',
        options?: {
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
            physics?: { mass?: number; restitution?: number }
        }
    ): Mesh {
        return this._world.spawnPrimitive({
            type,
            name: options?.name,
            position: options?.position,
            rotation: options?.rotation,
            scale: options?.scale,
            color: options?.color,
            size: options?.size,
            physics: options?.physics,
        })
    }

    /** Clone an existing mesh. The clone gets its own material. Cleaned up on stop. */
    clone(source: Mesh, name?: string): Mesh {
        return this._world.clone(source, name)
    }

    /** Spawn a prefab asset from the asset store. Cleaned up automatically on stop. */
    spawnPrefab(
        path: string,
        options?: {
            name?: string
            position?: { x: number; y: number; z: number }
            rotation?: { x: number; y: number; z: number }
            scale?: { x: number; y: number; z: number }
        }
    ): Promise<Node>
    spawnPrefab(path: string, onSpawn: (node: Node) => void): void
    spawnPrefab(
        path: string,
        options:
            | {
                  name?: string
                  position?: { x: number; y: number; z: number }
                  rotation?: { x: number; y: number; z: number }
                  scale?: { x: number; y: number; z: number }
              }
            | undefined,
        onSpawn: (node: Node) => void
    ): void
    spawnPrefab(
        path: string,
        options?:
            | {
                  name?: string
                  position?: { x: number; y: number; z: number }
                  rotation?: { x: number; y: number; z: number }
                  scale?: { x: number; y: number; z: number }
              }
            | ((node: Node) => void),
        onSpawn?: (node: Node) => void
    ): Promise<Node> | void {
        const resolvedOnSpawn =
            typeof options === 'function' ? options : onSpawn
        const resolvedOptions =
            typeof options === 'function' ? undefined : options

        const promise = this._world.spawnPrefab(path, resolvedOptions)
        if (!resolvedOnSpawn) return promise
        void promise
            .then((node) => resolvedOnSpawn(node))
            .catch((err) =>
                pushLog('error', `Failed to spawn prefab "${path}":`, err)
            )
    }

    /** Add a physics body to a mesh at runtime. */
    addPhysics(mesh: Mesh, mass?: number, restitution?: number): void {
        this._world.addPhysics(mesh, mass, restitution)
    }

    /** Destroy a runtime-created node immediately. */
    destroyNode(node: Node): void {
        this._world.destroyNode(node)
    }

    // -- Collision Events ------------------------------------------------------

    /**
     * Register a callback that fires when this node's physics body starts
     * colliding with another body. Requires a physics body on this node.
     *
     * @param callback  Called with a CollisionEvent each time a new collision begins.
     *
     * @example
     * start() {
     *     this.onCollision((event) => {
     *         this.log('Hit', event.other.name, 'impulse:', event.impulse)
     *     })
     * }
     */
    onCollision(callback: (event: CollisionEvent) => void): void {
        this._collisionStartCallbacks.push(callback as CollisionCallback)
    }

    /**
     * Register a callback that fires when this node's physics body stops
     * colliding with another body.
     *
     * @param callback  Called with a CollisionEvent when a collision ends.
     *
     * @example
     * start() {
     *     this.onCollisionEnd((event) => {
     *         this.log('Stopped touching', event.other.name)
     *     })
     * }
     */
    onCollisionEnd(callback: (event: CollisionEvent) => void): void {
        this._collisionEndCallbacks.push(callback as CollisionCallback)
    }

    // -- Raycasting ------------------------------------------------------------

    /**
     * Cast a ray from `origin` in `direction` and return the first hit, or null.
     * Only meshes with `isPickable = true` (the default) are considered.
     */
    raycast(
        origin: { x: number; y: number; z: number },
        direction: { x: number; y: number; z: number },
        maxDistance = 1000
    ): RaycastHit | null {
        const ray = new Ray(
            new Vector3(origin.x, origin.y, origin.z),
            new Vector3(direction.x, direction.y, direction.z).normalize(),
            maxDistance
        )
        const pick = this.scene.pickWithRay(ray, (m) => m.isPickable)
        return pick?.hit ? pickToHit(pick) : null
    }

    /**
     * Cast a ray and return ALL hits (sorted nearest-first), or an empty array.
     */
    raycastAll(
        origin: { x: number; y: number; z: number },
        direction: { x: number; y: number; z: number },
        maxDistance = 1000
    ): RaycastHit[] {
        const ray = new Ray(
            new Vector3(origin.x, origin.y, origin.z),
            new Vector3(direction.x, direction.y, direction.z).normalize(),
            maxDistance
        )
        const picks = this.scene.multiPickWithRay(ray, (m) => m.isPickable)
        if (!picks) return []
        return picks
            .filter((p) => p.hit)
            .sort((a, b) => a.distance - b.distance)
            .map(pickToHit)
    }

    /**
     * Pick from a screen-space position (pixels).
     * Useful with `this.input.mouseX` / `this.input.mouseY`.
     */
    screenRaycast(screenX: number, screenY: number): RaycastHit | null {
        const pick = this.scene.pick(screenX, screenY, (m) => m.isPickable)
        return pick?.hit ? pickToHit(pick) : null
    }
}

/** Result of a successful raycast. */
export interface RaycastHit {
    /** The mesh that was hit. */
    mesh: Mesh
    /** World-space hit point. */
    point: Vector3
    /** World-space surface normal at the hit point. */
    normal: Vector3
    /** Distance from the ray origin to the hit point. */
    distance: number
}

function pickToHit(pick: PickingInfo): RaycastHit {
    return {
        mesh: pick.pickedMesh as Mesh,
        point: pick.pickedPoint!,
        normal: pick.getNormal(true, true) ?? new Vector3(0, 1, 0),
        distance: pick.distance,
    }
}

// ---------------------------------------------------------------------------
// Convenience subclasses — strongly-typed `node` + runtime nodeType guard
// ---------------------------------------------------------------------------

/**
 * A script that attaches to a **Mesh** node.
 *
 * `this.node` is typed as `Mesh`, giving direct access to `.material`,
 * `.physicsBody`, `.visibility`, etc. The engine will refuse to attach this
 * script to non-mesh nodes.
 *
 * @example
 * export default class extends MeshScript {
 *     start() {
 *         this.log('Material:', this.node.material?.name)
 *     }
 * }
 */
export class MeshScript extends Script<Mesh> {
    static override nodeType: ScriptNodeType = 'Mesh'
}

/**
 * A script that attaches to a **Light** node.
 *
 * `this.node` is typed as `Light`, giving direct access to `.intensity`,
 * `.diffuse`, etc.
 *
 * @example
 * export default class extends LightScript {
 *     update() {
 *         this.node.intensity = 1 + Math.sin(this.time) * 0.5
 *     }
 * }
 */
export class LightScript extends Script<Light> {
    static override nodeType: ScriptNodeType = 'Light'
}
