import {
    Scene,
    Node,
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

/**
 * Runtime base class for user scripts.
 *
 * Properties (`node`, `scene`, `input`, etc.) are assigned by the
 * ScriptRuntime after construction but before `start()` is called.
 */
export class Script {
    /** The node this script is attached to. */
    node!: TransformNode

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

    /** Add a physics body to a mesh at runtime. */
    addPhysics(mesh: Mesh, mass?: number, restitution?: number): void {
        this._world.addPhysics(mesh, mass, restitution)
    }

    /** Destroy a runtime-created node immediately. */
    destroyNode(node: Node): void {
        this._world.destroyNode(node)
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
