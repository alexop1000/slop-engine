/**
 * Slop Engine Scripting API
 *
 * Scripts extend the Script class and implement lifecycle methods.
 * All types below are available globally — no imports needed.
 *
 * For scripts that target a specific node type, extend the typed subclass:
 * - `MeshScript`   — `this.node` is a `Mesh`  (material, physicsBody, etc.)
 * - `LightScript`  — `this.node` is a `Light`  (intensity, diffuse, etc.)
 *
 * @example
 * // Generic script — works on any node
 * export default class extends Script {
 *     speed = 2
 *
 *     start() {
 *         this.log('Hello from', this.node.name)
 *     }
 *
 *     update() {
 *         this.node.rotation.y += this.speed * this.deltaTime
 *     }
 *
 *     destroy() {
 *         this.log('Goodbye')
 *     }
 * }
 *
 * @example
 * // Mesh-only script — this.node is a Mesh
 * export default class extends MeshScript {
 *     start() {
 *         this.log('Material:', this.node.material?.name)
 *     }
 * }
 */

// ---------------------------------------------------------------------------
// Script base class
// ---------------------------------------------------------------------------

/**
 * Base class for all scripts. Extend this and override lifecycle methods
 * to add behaviour to a scene node.
 *
 * Properties like `node`, `scene`, `deltaTime`, and `input` are set
 * automatically before `start()` is called — you can use them immediately.
 */
declare class Script {
    /** The node this script is attached to (TransformNode for generic scripts). */
    readonly node: TransformNode | SceneNode

    /** The scene containing this node. */
    readonly scene: Scene

    /** Seconds elapsed since the last frame. */
    readonly deltaTime: number

    /** Seconds elapsed since play mode started. */
    readonly time: number

    /** Keyboard and mouse input state. */
    readonly input: Input

    // -- Lifecycle ------------------------------------------------------------

    /** Called once when play mode starts (after all scripts are created). */
    start(): void

    /** Called every frame during play mode. */
    update(): void

    /** Called when play mode stops. Use this to clean up. */
    destroy(): void

    // -- Script references ----------------------------------------------------

    /**
     * Get another script attached to **this same node** by its file path.
     * Returns null if no script with that path is attached to this node.
     *
     * The return type is automatically inferred when the ScriptRegistry
     * knows about the target path (i.e. it exists in the project).
     *
     * @param path  The asset path of the script (e.g. `'scripts/Health.ts'`).
     *
     * @example
     * // Both scripts attached to the same node:
     * const health = this.getScript('scripts/Health.ts')
     * if (health) {
     *     this.log('HP:', health.hp)
     *     health.takeDamage(10)
     * }
     */
    getScript<T = Script>(path: string): T | null

    /**
     * Get a script attached to a **different node** by its file path.
     * Returns null if the node has no script with that path.
     *
     * @param node  The node to search on.
     * @param path  The asset path of the script (e.g. `'scripts/EnemyAI.ts'`).
     *
     * @example
     * const enemy = this.findNode('Enemy')!
     * const ai = this.getScriptOn(enemy, 'scripts/EnemyAI.ts')
     * ai?.alert()
     */
    getScriptOn<T = Script>(node: SceneNode, path: string): T | null

    // -- Helpers --------------------------------------------------------------

    /** Find a node in the scene by name. Returns null if not found. */
    findNode(name: string): SceneNode | null

    /** Find a mesh in the scene by name. Returns null if not found. */
    findMesh(name: string): Mesh | null

    /** The active runtime camera. */
    readonly camera: UniversalCamera

    /** Log a message to the console panel. */
    log(...args: any[]): void

    /**
     * Fullscreen GUI overlay.
     * Create buttons and labels that communicate back to this script.
     *
     * All controls are auto-removed when play mode stops.
     *
     * @example
     * start() {
     *     this._label = this.gui.createLabel('info', 'Hello!', {
     *         top: '20px', verticalAlignment: 'top',
     *     })
     *     this.gui.createButton('action', 'Do It', {
     *         top: '-20px', verticalAlignment: 'bottom',
     *     }).onClick(() => this.log('clicked!'))
     * }
     */
    readonly gui: GUI

    // -- Instance Creation ----------------------------------------------------

    /**
     * Create a primitive mesh at runtime.
     * Runtime objects are automatically destroyed when play stops.
     *
     * @param type  The primitive shape.
     * @param options  Optional position, color, physics, etc.
     * @returns The newly created Mesh.
     *
     * @example
     * // Spawn a red sphere with physics
     * const bullet = this.spawn('sphere', {
     *     position: this.node.position.clone(),
     *     color: rgb(1, 0, 0),
     *     size: { diameter: 0.2 },
     *     physics: { mass: 0.1 }
     * })
     * // Launch it forward
     * const forward = this.camera.getDirection(Vector3.Forward())
     * bullet.physicsBody!.setLinearVelocity(forward.scale(50))
     */
    spawn(
        type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane',
        options?: SpawnOptions
    ): Mesh

    /**
     * Clone an existing mesh. The clone gets its own material copy.
     * Runtime clones are automatically destroyed when play stops.
     *
     * @param source  The mesh to clone.
     * @param name    Optional name for the clone.
     * @returns The cloned Mesh.
     *
     * @example
     * const template = this.findMesh('BulletTemplate')!
     * const bullet = this.clone(template, 'bullet_1')
     * bullet.position = this.node.position.clone()
     */
    clone(source: Mesh, name?: string): Mesh

    /**
     * Spawn a prefab file from the asset store at runtime.
     * Prefab nodes are automatically destroyed when play stops.
     *
     * You can use either:
     * - Promise style: `await this.spawnPrefab(path, options)`
     * - Callback style: `this.spawnPrefab(path, options, (node) => { ... })`
     *
     * @param path     Asset path to a `.prefab.json` file (for example `prefabs/crate.prefab.json`).
     * @param options  Optional name and transform override for the prefab root.
     * @returns A Promise resolving to the prefab root node (Promise overload).
     *
     * @example
     * this.spawnPrefab(
     *     'prefabs/enemy.prefab.json',
     *     { position: this.node.position.clone() },
     *     (enemy) => {
     *         enemy.name = 'Enemy_' + Math.floor(this.time)
     *     }
     * )
     */
    spawnPrefab(
        path: string,
        options?: {
            name?: string
            position?: Vector3
            rotation?: Vector3
            scale?: Vector3
        }
    ): Promise<SceneNode>

    /** Callback overload for spawning a prefab without `await`. */
    spawnPrefab(path: string, onSpawn: (node: SceneNode) => void): void

    /** Callback overload for spawning a prefab without `await` with options. */
    spawnPrefab(
        path: string,
        options:
            | {
                  name?: string
                  position?: Vector3
                  rotation?: Vector3
                  scale?: Vector3
              }
            | undefined,
        onSpawn: (node: SceneNode) => void
    ): void

    /**
     * Add a physics body to a mesh at runtime.
     *
     * @param mesh         The mesh to add physics to.
     * @param mass         Mass in kg. Default: 1. Use 0 for static.
     * @param restitution  Bounciness. Default: 0.75.
     */
    addPhysics(mesh: Mesh, mass?: number, restitution?: number): void

    /**
     * Destroy a runtime-created node immediately.
     * Also disposes its physics body and material.
     *
     * @example
     * if (this.time > this.spawnTime + 3) {
     *     this.destroyNode(this.bullet)
     * }
     */
    destroyNode(node: SceneNode): void

    // -- Raycasting -----------------------------------------------------------

    /**
     * Cast a ray from `origin` in `direction` and return the first hit.
     * Returns null if nothing was hit. Only meshes with `isPickable = true`
     * (the default) are considered.
     *
     * @param origin       World-space starting point.
     * @param direction    Direction vector (does not need to be normalised).
     * @param maxDistance   Maximum distance to check. Default: 1000.
     *
     * @example
     * // Shoot a ray forward from this node
     * const hit = this.raycast(
     *     this.node.position,
     *     this.camera.getDirection(Vector3.Forward()),
     *     100
     * )
     * if (hit) {
     *     this.log('Hit', hit.mesh.name, 'at distance', hit.distance)
     * }
     */
    raycast(
        origin: Vector3,
        direction: Vector3,
        maxDistance?: number
    ): RaycastHit | null

    /**
     * Cast a ray and return **all** hits sorted by distance (nearest first).
     * Returns an empty array if nothing was hit.
     *
     * @example
     * const hits = this.raycastAll(this.node.position, Vector3.Down(), 50)
     * for (const hit of hits) {
     *     this.log(hit.mesh.name, hit.distance)
     * }
     */
    raycastAll(
        origin: Vector3,
        direction: Vector3,
        maxDistance?: number
    ): RaycastHit[]

    /**
     * Pick from a screen-space position (pixels). Useful for mouse picking.
     *
     * @param screenX  Horizontal pixel coordinate (e.g. `this.input.mouseX`).
     * @param screenY  Vertical pixel coordinate (e.g. `this.input.mouseY`).
     *
     * @example
     * if (this.input.isMouseButtonDown(0)) {
     *     const hit = this.screenRaycast(this.input.mouseX, this.input.mouseY)
     *     if (hit) this.log('Clicked on', hit.mesh.name)
     * }
     */
    screenRaycast(screenX: number, screenY: number): RaycastHit | null

    // -- Collision Events -----------------------------------------------------

    /**
     * Register a callback that fires when this node's physics body starts
     * colliding with another body. Call this in `start()`. Requires a
     * physics body on this node.
     *
     * @param callback  Receives a {@link CollisionEvent} each time a new
     *                  collision begins.
     *
     * @example
     * start() {
     *     this.onCollision((event) => {
     *         this.log('Hit', event.other.name, 'impulse:', event.impulse)
     *         if (event.impulse > 5) {
     *             this.log('Hard impact!')
     *         }
     *     })
     * }
     */
    onCollision(callback: (event: CollisionEvent) => void): void

    /**
     * Register a callback that fires when this node's physics body **stops**
     * colliding with another body. Call this in `start()`.
     *
     * @param callback  Receives a {@link CollisionEvent} when a collision ends.
     *
     * @example
     * start() {
     *     this.onCollisionEnd((event) => {
     *         this.log('No longer touching', event.other.name)
     *     })
     * }
     */
    onCollisionEnd(callback: (event: CollisionEvent) => void): void
}

// ---------------------------------------------------------------------------
// Typed script subclasses
// ---------------------------------------------------------------------------

/**
 * A script that can **only** be attached to a Mesh node.
 *
 * `this.node` is typed as `Mesh`, giving direct access to `.material`,
 * `.physicsBody`, `.visibility`, `.isPickable`, etc. The engine will refuse
 * to attach this script to non-mesh nodes and log an error.
 *
 * @example
 * export default class extends MeshScript {
 *     start() {
 *         this.log('My material:', this.node.material?.name)
 *         this.log('Bounding size:', this.node.getBoundingSize())
 *     }
 *
 *     update() {
 *         // Spin the mesh
 *         this.node.rotation.y += this.deltaTime
 *     }
 * }
 */
declare class MeshScript extends Script {
    /** The mesh this script is attached to. */
    readonly node: Mesh
}

/**
 * A script that can **only** be attached to a Light node.
 *
 * `this.node` is typed as `Light`, giving direct access to `.intensity`,
 * `.diffuse`, `.specular`, etc.
 *
 * @example
 * export default class extends LightScript {
 *     update() {
 *         // Pulsating light
 *         this.node.intensity = 1 + Math.sin(this.time * 2) * 0.5
 *     }
 * }
 */
declare class LightScript extends Script {
    /** The light this script is attached to. */
    readonly node: Light
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * Provides keyboard and mouse state. Key codes use `KeyboardEvent.code`
 * values, for example: `'KeyA'`, `'Space'`, `'ShiftLeft'`, `'ArrowUp'`.
 */
declare class Input {
    /** True while the key is held down. */
    isKeyDown(code: string): boolean

    /** True only on the frame the key was first pressed. */
    isKeyPressed(code: string): boolean

    /** True only on the frame the key was released. */
    isKeyReleased(code: string): boolean

    /** Horizontal mouse position in pixels, relative to the viewport. */
    readonly mouseX: number

    /** Vertical mouse position in pixels, relative to the viewport. */
    readonly mouseY: number

    /** Horizontal mouse movement since the last frame. */
    readonly mouseDeltaX: number

    /** Vertical mouse movement since the last frame. */
    readonly mouseDeltaY: number

    /** True while a mouse button is held. 0 = left, 1 = middle, 2 = right. */
    isMouseButtonDown(button: number): boolean

    /** Whether the pointer is currently locked to the viewport. */
    readonly isMouseLocked: boolean

    /**
     * Lock the mouse cursor to the viewport.
     * While locked, the cursor is hidden and `mouseDeltaX`/`mouseDeltaY`
     * report raw movement — ideal for first-person camera controls.
     */
    lockMouse(): void

    /**
     * Release the pointer lock, restoring normal cursor behaviour.
     * Also called automatically when play mode stops.
     */
    unlockMouse(): void
}

// ---------------------------------------------------------------------------
// Math types
// ---------------------------------------------------------------------------

declare class Vector3 {
    x: number
    y: number
    z: number
    constructor(x: number, y: number, z: number)

    /** Return a new vector that is the sum of this and `other`. */
    add(other: Vector3): Vector3
    /** Return a new vector: `this - other`. */
    subtract(other: Vector3): Vector3
    /** Return a new vector scaled by `factor`. */
    scale(factor: number): Vector3
    /** Add `other` to this vector in place and return `this`. */
    addInPlace(other: Vector3): Vector3
    /** Subtract `other` from this vector in place and return `this`. */
    subtractInPlace(other: Vector3): Vector3
    /** Scale this vector in place and return `this`. */
    scaleInPlace(factor: number): Vector3
    /** Normalise this vector in place and return `this`. */
    normalize(): Vector3
    /** Return a new normalised copy of this vector (original is unchanged). */
    normalizeToNew(): Vector3
    /** Return the length (magnitude) of this vector. */
    length(): number
    /** Return the squared length (avoids a sqrt — faster for comparisons). */
    lengthSquared(): number
    /** Return a deep copy. */
    clone(): Vector3
    /** Set x, y, z and return `this`. */
    set(x: number, y: number, z: number): Vector3
    /** Copy values from another vector and return `this`. */
    copyFrom(source: Vector3): Vector3
    /** Return the dot product with `other`. */
    static Dot(left: Vector3, right: Vector3): number
    /** Return the cross product of two vectors. */
    static Cross(left: Vector3, right: Vector3): Vector3
    /** Return the distance between two points. */
    static Distance(a: Vector3, b: Vector3): number
    /** Linearly interpolate between `a` and `b` by `t` (0–1). */
    static Lerp(a: Vector3, b: Vector3, t: number): Vector3
    /** (0, 0, 0) */
    static Zero(): Vector3
    /** (1, 1, 1) */
    static One(): Vector3
    /** (0, 1, 0) */
    static Up(): Vector3
    /** (0, -1, 0) */
    static Down(): Vector3
    /** (0, 0, 1) */
    static Forward(): Vector3
    /** (0, 0, -1) */
    static Backward(): Vector3
    /** (1, 0, 0) */
    static Right(): Vector3
    /** (-1, 0, 0) */
    static Left(): Vector3
}

declare class Color3 {
    r: number
    g: number
    b: number
    constructor(r: number, g: number, b: number)
    clone(): Color3
    copyFrom(source: Color3): Color3
    /** Linearly interpolate between two colours. */
    static Lerp(a: Color3, b: Color3, t: number): Color3
    static Red(): Color3
    static Green(): Color3
    static Blue(): Color3
    static White(): Color3
    static Black(): Color3
    static Yellow(): Color3
    static Purple(): Color3
    static Teal(): Color3
}

declare class Color4 {
    r: number
    g: number
    b: number
    a: number
    constructor(r: number, g: number, b: number, a: number)
    clone(): Color4
}

declare class Quaternion {
    x: number
    y: number
    z: number
    w: number
    constructor(x: number, y: number, z: number, w: number)
    /** Convert to Euler angles (radians) as a Vector3. */
    toEulerAngles(): Vector3
    clone(): Quaternion
    /** Create from Euler angles in radians. */
    static FromEulerAngles(x: number, y: number, z: number): Quaternion
    /** The identity quaternion (no rotation). */
    static Identity(): Quaternion
    /** Spherical linear interpolation. */
    static Slerp(a: Quaternion, b: Quaternion, t: number): Quaternion
}

// ---------------------------------------------------------------------------
// Scene graph
// ---------------------------------------------------------------------------

/** Base class for all scene objects. */
declare class SceneNode {
    /** Display name. */
    name: string
    /** Engine-assigned unique identifier (read-only). */
    readonly uniqueId: number
    /** Parent node, or null if this is a root node. */
    parent: SceneNode | null
    /** Whether this node is active. */
    isEnabled(): boolean
    /** Enable or disable this node. */
    setEnabled(value: boolean): void
    /** Return the immediate children. */
    getChildren(): SceneNode[]
    /** Arbitrary user data. */
    metadata: Record<string, any>
}

/** A node with a transform (position, rotation, scale). */
declare class TransformNode extends SceneNode {
    /** World-space position. */
    position: Vector3
    /** Euler rotation in radians. */
    rotation: Vector3
    /** Scale on each axis. */
    scaling: Vector3
    /** Quaternion rotation (overrides `rotation` when set). Set to null to use Euler. */
    rotationQuaternion: Quaternion | null
    /** The forward direction vector in world space. */
    readonly forward: Vector3
    /** The right direction vector in world space. */
    readonly right: Vector3
    /** The up direction vector in world space. */
    readonly up: Vector3
    /** Return the absolute (world) position. */
    getAbsolutePosition(): Vector3
    /** Rotate to face a target point. */
    lookAt(target: Vector3): TransformNode
    /** Move along an axis by a distance (local space). */
    translate(axis: Vector3, distance: number): TransformNode
    /** Rotate around an axis by an amount in radians (local space). */
    rotate(axis: Vector3, amount: number): TransformNode
}

/** Base class for renderable meshes. */
declare class AbstractMesh extends TransformNode {
    /** Whether this mesh is rendered. */
    isVisible: boolean
    /** Whether this mesh can be picked by raycasts. */
    isPickable: boolean
    /** Opacity: 0 = fully transparent, 1 = fully opaque. */
    visibility: number
    /** The material applied to this mesh, or null. */
    material: Material | null
    /** Enable collision detection for this mesh. */
    checkCollisions: boolean
    /** Whether this mesh receives shadows. */
    receiveShadows: boolean
}

/** A mesh in the scene (the most common renderable type). */
declare class Mesh extends AbstractMesh {
    /** The physics body attached to this mesh, or null if none. */
    physicsBody: PhysicsBody | null

    /**
     * Return the axis-aligned bounding box size of this mesh in local space.
     * This reflects the actual geometry dimensions (including baked `size`
     * parameters), multiplied by `scaling`.
     *
     * Use this instead of reading `scaling` directly — when a mesh is created
     * with a `size` parameter the dimensions are baked into the geometry and
     * `scaling` stays `[1,1,1]`.
     *
     * @example
     * const platform = this.findMesh('ground')!
     * const bounds = platform.getBoundingSize()
     * this.log(bounds.x, bounds.y, bounds.z) // e.g. 30, 1, 8
     */
    getBoundingSize(): Vector3
}

/** A physics body attached to a mesh. */
declare class PhysicsBody {
    /** Set the linear velocity of this body. */
    setLinearVelocity(velocity: Vector3): void
    /** Get the current linear velocity. */
    getLinearVelocity(): Vector3
    /** Set the angular velocity of this body. */
    setAngularVelocity(velocity: Vector3): void
    /** Get the current angular velocity. */
    getAngularVelocity(): Vector3
    /** Apply a force at the body's center of mass (continuous, call every frame). */
    applyForce(force: Vector3, location: Vector3): void
    /** Apply an instant impulse at a world-space point. */
    applyImpulse(impulse: Vector3, location: Vector3): void
}

// ---------------------------------------------------------------------------
// Lights & Cameras
// ---------------------------------------------------------------------------

/** A light source in the scene. */
declare class Light extends SceneNode {
    /** Brightness multiplier. */
    intensity: number
    /** Diffuse colour. */
    diffuse: Color3
    /** Specular colour. */
    specular: Color3
    /** Maximum range of the light (0 = infinite). */
    range: number
    /** Whether this light is active. */
    isEnabled(): boolean
    /** Enable or disable the light. */
    setEnabled(value: boolean): void
}

/** A camera in the scene. (NOTE: you cannot attach scripts to the camera node)*/
declare class Camera extends SceneNode {
    /** World-space position. */
    position: Vector3
    /** Euler rotation in radians. */
    rotation: Vector3
    /** Quaternion rotation (overrides `rotation` when set). Set to null to use Euler. */
    rotationQuaternion: Quaternion | null
    /** Vertical field of view in radians. */
    fov: number
    /** Near clipping distance. */
    minZ: number
    /** Far clipping distance. */
    maxZ: number
    /** The forward direction vector in world space. */
    getDirection(localAxis: Vector3): Vector3
    /** Return the absolute (world) position. */
    getAbsolutePosition(): Vector3
}

/**
 * A universal (first-person style) camera.
 *
 * During play mode the runtime creates a UniversalCamera with no built-in
 * input handlers — you control it entirely through scripting.
 *
 * @example
 * export default class extends Script {
 *     speed = 10
 *
 *     start() {
 *         // Lock the mouse for FPS-style controls
 *         this.input.lockMouse()
 *     }
 *
 *     update() {
 *         // Simple WASD + mouse-look camera
 *         const move = vec3(0, 0, 0)
 *         if (this.input.isKeyDown('KeyW')) move.z += 1
 *         if (this.input.isKeyDown('KeyS')) move.z -= 1
 *         if (this.input.isKeyDown('KeyA')) move.x -= 1
 *         if (this.input.isKeyDown('KeyD')) move.x += 1
 *
 *         // Move in camera-local space
 *         const forward = this.camera.getDirection(Vector3.Forward())
 *         const right = this.camera.getDirection(Vector3.Right())
 *         this.camera.position.addInPlace(
 *             forward.scale(move.z * this.speed * this.deltaTime)
 *         )
 *         this.camera.position.addInPlace(
 *             right.scale(move.x * this.speed * this.deltaTime)
 *         )
 *
 *         // Mouse look (works best with pointer lock)
 *         this.camera.rotation.y += this.input.mouseDeltaX * 0.002
 *         this.camera.rotation.x += this.input.mouseDeltaY * 0.002
 *     }
 * }
 */
declare class UniversalCamera extends Camera {
    /** Movement speed when using built-in keyboard controls. */
    speed: number
    /** Mouse rotation sensitivity. Higher values = less sensitive. Default: 2000. */
    angularSensibility: number
    /** Deceleration factor for movement (0 = instant stop, 0.9 = smooth glide). */
    inertia: number

    /** The target point the camera looks at. */
    target: Vector3
    /** Set the point the camera looks at. */
    setTarget(target: Vector3): void
    /** Get a position in front of the camera at the given distance. */
    getFrontPosition(distance: number): Vector3

    /** Whether gravity affects the camera. */
    applyGravity: boolean
    /** The camera's collision ellipsoid dimensions. Default: (0.5, 1, 0.5). */
    ellipsoid: Vector3
    /** Whether the camera checks for mesh collisions when moving. */
    checkCollisions: boolean

    /** Key codes for forward movement. Push codes to enable built-in keyboard input. */
    keysUp: number[]
    /** Key codes for backward movement. */
    keysDown: number[]
    /** Key codes for left movement. */
    keysLeft: number[]
    /** Key codes for right movement. */
    keysRight: number[]
    /** Key codes for upward movement. */
    keysUpward: number[]
    /** Key codes for downward movement. */
    keysDownward: number[]
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** Base material class. */
declare class Material {
    /** Material name. */
    name: string
    /** Overall opacity (0–1). */
    alpha: number
    /** Render as wireframe. */
    wireframe: boolean
    /** Cull back faces. */
    backFaceCulling: boolean
}

/** The standard PBR-like material with diffuse, specular, etc. */
declare class StandardMaterial extends Material {
    diffuseColor: Color3
    specularColor: Color3
    emissiveColor: Color3
    ambientColor: Color3
    /** Sharpness of specular highlights. */
    specularPower: number
    /** Micro-surface roughness (0–1). */
    roughness: number
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

/** The scene containing all nodes, lights, cameras, and materials. */
declare class Scene {
    /** Find a mesh by its name. Returns null if not found. */
    getMeshByName(name: string): Mesh | null
    /** Find any node by its name. Returns null if not found. */
    getNodeByName(name: string): SceneNode | null
    /** Find a light by its name. Returns null if not found. */
    getLightByName(name: string): Light | null
    /** Find a camera by its name. Returns null if not found. */
    getCameraByName(name: string): Camera | null
    /** All meshes in the scene (read-only array). */
    readonly meshes: readonly Mesh[]
    /** All lights in the scene (read-only array). */
    readonly lights: readonly Light[]
    /** All cameras in the scene (read-only array). */
    readonly cameras: readonly Camera[]
    /** The currently active camera, or null. */
    activeCamera: Camera | null
    /** The scene gravity vector. */
    gravity: Vector3
}

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

/**
 * The global `Math` object — all standard JavaScript math functions and
 * constants, plus extra game-development helpers.
 */
interface Math {
    // -- Constants ------------------------------------------------------------

    /** The ratio of a circle's circumference to its diameter (~3.14159). */
    readonly PI: number
    /** Euler's number (~2.71828). */
    readonly E: number
    readonly LN2: number
    readonly LN10: number
    readonly LOG2E: number
    readonly LOG10E: number
    /** Square root of 2 (~1.41421). */
    readonly SQRT2: number
    readonly SQRT1_2: number

    // -- Rounding -------------------------------------------------------------

    /** Return the absolute value of `x`. */
    abs(x: number): number
    /** Return −1, 0, or 1 indicating the sign of `x`. */
    sign(x: number): number
    /** Round down to the nearest integer. */
    floor(x: number): number
    /** Round up to the nearest integer. */
    ceil(x: number): number
    /** Round to the nearest integer. */
    round(x: number): number
    /** Truncate the decimal part (round toward zero). */
    trunc(x: number): number
    /** Return the 32-bit integer representation of `x`. */
    fround(x: number): number

    // -- Min / Max ------------------------------------------------------------

    /** Return the smallest of the given values. */
    min(...values: number[]): number
    /** Return the largest of the given values. */
    max(...values: number[]): number

    // -- Power & Roots --------------------------------------------------------

    /** Return the square root of `x`. */
    sqrt(x: number): number
    /** Return the cube root of `x`. */
    cbrt(x: number): number
    /** Return `base` raised to the power `exponent`. */
    pow(base: number, exponent: number): number
    /** Return the square root of the sum of squares of the arguments. */
    hypot(...values: number[]): number
    /** Return e^x. */
    exp(x: number): number
    /** Return e^x − 1. */
    expm1(x: number): number
    /** Return the natural logarithm of `x`. */
    log(x: number): number
    /** Return the base-2 logarithm of `x`. */
    log2(x: number): number
    /** Return the base-10 logarithm of `x`. */
    log10(x: number): number
    /** Return the natural logarithm of 1 + `x`. */
    log1p(x: number): number

    // -- Trigonometry ---------------------------------------------------------

    /** Return the sine of `x` (radians). */
    sin(x: number): number
    /** Return the cosine of `x` (radians). */
    cos(x: number): number
    /** Return the tangent of `x` (radians). */
    tan(x: number): number
    /** Return the arcsine (in radians) of `x`. */
    asin(x: number): number
    /** Return the arccosine (in radians) of `x`. */
    acos(x: number): number
    /** Return the arctangent (in radians) of `x`. */
    atan(x: number): number
    /** Return the angle (in radians) from the X axis to the point (x, y). */
    atan2(y: number, x: number): number
    /** Return the hyperbolic sine of `x`. */
    sinh(x: number): number
    /** Return the hyperbolic cosine of `x`. */
    cosh(x: number): number
    /** Return the hyperbolic tangent of `x`. */
    tanh(x: number): number
    /** Return the inverse hyperbolic sine of `x`. */
    asinh(x: number): number
    /** Return the inverse hyperbolic cosine of `x`. */
    acosh(x: number): number
    /** Return the inverse hyperbolic tangent of `x`. */
    atanh(x: number): number

    // -- Random ---------------------------------------------------------------

    /** Return a pseudo-random number in [0, 1). */
    random(): number

    // -- Game-dev helpers -----------------------------------------------------

    /** Clamp `value` so it is no smaller than `min` and no larger than `max`. */
    clamp(value: number, min: number, max: number): number
    /** Linearly interpolate between `a` and `b` by `t` (0–1). */
    lerp(a: number, b: number, t: number): number
    /** Return the interpolation factor (0–1) of `value` between `a` and `b`. */
    inverseLerp(a: number, b: number, value: number): number
    /** Smooth Hermite interpolation between 0 and 1 when `edge0 < x < edge1`. */
    smoothstep(edge0: number, edge1: number, x: number): number
    /** Convert degrees to radians. */
    degToRad(degrees: number): number
    /** Convert radians to degrees. */
    radToDeg(radians: number): number
    /** Remap `value` from range [inMin, inMax] to [outMin, outMax]. */
    remap(
        value: number,
        inMin: number,
        inMax: number,
        outMin: number,
        outMax: number
    ): number
    /** Return a random number in [min, max). */
    randomRange(min: number, max: number): number
    /** Move `current` towards `target` by at most `maxDelta`. */
    moveTowards(current: number, target: number, maxDelta: number): number
    /** Ping-pong `t` between 0 and `length`. */
    pingPong(t: number, length: number): number
}

declare const Math: Math

// ---------------------------------------------------------------------------
// Raycasting
// ---------------------------------------------------------------------------

/** Result of a successful raycast. */
declare interface RaycastHit {
    /** The mesh that was hit. */
    readonly mesh: Mesh
    /** World-space hit point. */
    readonly point: Vector3
    /** World-space surface normal at the hit point. */
    readonly normal: Vector3
    /** Distance from the ray origin to the hit point. */
    readonly distance: number
}

// ---------------------------------------------------------------------------
// Collision Events
// ---------------------------------------------------------------------------

/** Information about a collision between two physics bodies. */
declare interface CollisionEvent {
    /** The other mesh involved in the collision. */
    readonly other: Mesh
    /** World-space contact point (approximate). */
    readonly point: Vector3
    /** World-space contact normal pointing away from the other body. */
    readonly normal: Vector3
    /** The impulse magnitude of the collision. */
    readonly impulse: number
}

// ---------------------------------------------------------------------------
// Runtime Instance Creation
// ---------------------------------------------------------------------------

/** Options for spawning a primitive mesh at runtime. */
interface SpawnOptions {
    /** Custom name for the mesh. Auto-generated if omitted. */
    name?: string
    /** Initial position. */
    position?: Vector3
    /** Initial rotation in radians. */
    rotation?: Vector3
    /** Initial scale. */
    scale?: Vector3
    /** Diffuse color of the material. */
    color?: Color3
    /** Dimensions of the primitive. */
    size?: {
        width?: number
        height?: number
        depth?: number
        diameter?: number
        thickness?: number
    }
    /** If provided, a physics body is created immediately. */
    physics?: {
        /** Mass in kg. Default: 1. Use 0 for static bodies. */
        mass?: number
        /** Bounciness. Default: 0.75. */
        restitution?: number
    }
}

// ---------------------------------------------------------------------------
// GUI
// ---------------------------------------------------------------------------

/** Options shared by all GUI controls. */
interface GuiControlOptions {
    /**
     * Horizontal position. Use a CSS-style string (`"20px"`, `"50%"`) or a
     * pixel number. Default: `"0px"`.
     */
    left?: string | number
    /**
     * Vertical position. Use a CSS-style string (`"20px"`, `"50%"`) or a
     * pixel number. Default: `"0px"`.
     */
    top?: string | number
    /** Width. Default: `"200px"`. */
    width?: string | number
    /** Height. Default: `"40px"`. */
    height?: string | number
    /**
     * Horizontal anchor of the control itself on the screen.
     * - `"left"` — origin is the left edge of the screen.
     * - `"center"` — origin is the horizontal centre (default).
     * - `"right"` — origin is the right edge of the screen.
     */
    horizontalAlignment?: 'left' | 'center' | 'right'
    /**
     * Vertical anchor of the control itself on the screen.
     * - `"top"` — origin is the top edge of the screen.
     * - `"center"` — origin is the vertical centre (default).
     * - `"bottom"` — origin is the bottom edge of the screen.
     */
    verticalAlignment?: 'top' | 'center' | 'bottom'
}

/** Options for {@link GUI.createButton}. */
interface GuiButtonOptions extends GuiControlOptions {
    /** Button background color (CSS string). Default: `"#2a6496"`. */
    color?: string
    /** Label text color. Default: `"white"`. */
    textColor?: string
    /** Font size in pixels. Default: `16`. */
    fontSize?: number
    /** Corner radius in pixels. Default: `4`. */
    cornerRadius?: number
}

/** Options for {@link GUI.createLabel}. */
interface GuiLabelOptions extends GuiControlOptions {
    /** Text color (CSS string). Default: `"white"`. */
    color?: string
    /** Font size in pixels. Default: `16`. */
    fontSize?: number
    /** Alignment of text within the label box. Default: `"center"`. */
    textAlignment?: 'left' | 'center' | 'right'
    /** Wrap long text to multiple lines. Default: `true`. */
    wordWrap?: boolean
}

/** Options for {@link GUI.createPanel}. */
interface GuiPanelOptions extends GuiControlOptions {
    /** Fill color (CSS string). Default: `"rgba(0,0,0,0.5)"`. */
    color?: string
    /** Border color (CSS string). Default: `"transparent"`. */
    borderColor?: string
    /** Border thickness in pixels. Default: `0`. */
    borderThickness?: number
    /** Corner radius in pixels. Default: `0`. */
    cornerRadius?: number
    /** Overall opacity from 0 to 1. Default: `1`. */
    alpha?: number
}

/**
 * Handle for a GUI button returned by {@link GUI.createButton}.
 * Use it to respond to clicks and update the button at runtime.
 */
declare class GuiButtonHandle {
    /** Register a callback fired when the button is clicked. Returns `this`. */
    onClick(callback: () => void): this
    /** Change the button's label text. Returns `this`. */
    setText(text: string): this
    /** Show or hide the button. Returns `this`. */
    setVisible(visible: boolean): this
    /** Change the background color (CSS string). Returns `this`. */
    setColor(color: string): this
    /** Remove this button from the screen. */
    remove(): void
}

/**
 * Handle for a text label returned by {@link GUI.createLabel}.
 * Update the display text each frame or in response to game events.
 */
declare class GuiLabelHandle {
    /** Change the displayed text. Returns `this`. */
    setText(text: string): this
    /** Show or hide the label. Returns `this`. */
    setVisible(visible: boolean): this
    /** Change the text color (CSS string). Returns `this`. */
    setColor(color: string): this
    /** Remove this label from the screen. */
    remove(): void
}

/** Handle for a panel returned by {@link GUI.createPanel}. */
declare class GuiPanelHandle {
    /** Show or hide the panel. Returns `this`. */
    setVisible(visible: boolean): this
    /** Change the panel background color. Returns `this`. */
    setColor(color: string): this
    /** Change the panel border color. Returns `this`. */
    setBorderColor(color: string): this
    /** Change panel opacity (0 to 1). Returns `this`. */
    setAlpha(alpha: number): this
    /** Remove this panel from the screen. */
    remove(): void
}

/**
 * Fullscreen GUI overlay. Accessed via `this.gui` inside any script.
 *
 * All controls are automatically removed when play mode stops — you don't
 * need to clean them up manually (though you can call `.remove()` at any time).
 *
 * @example
 * // Heads-up score display
 * export default class extends Script {
 *     private _score = 0
 *     private _label!: GuiLabelHandle
 *
 *     start() {
 *         this._label = this.gui.createLabel('score', 'Score: 0', {
 *             top: '20px',
 *             verticalAlignment: 'top',
 *             color: 'yellow',
 *             fontSize: 24,
 *         })
 *
 *         this.gui.createButton('reset', 'Reset', {
 *             top: '-20px',
 *             verticalAlignment: 'bottom',
 *         }).onClick(() => {
 *             this._score = 0
 *             this._label.setText('Score: 0')
 *         })
 *     }
 *
 *     update() {
 *         this._score += this.deltaTime
 *         this._label.setText('Score: ' + Math.floor(this._score))
 *     }
 * }
 */
declare class GUI {
    /**
     * Create a clickable button.
     *
     * @param name     Internal name for the control (must be unique).
     * @param text     Text displayed on the button.
     * @param options  Position, size, colors, etc.
     * @returns A {@link GuiButtonHandle} for handling clicks and updates.
     *
     * @example
     * const btn = this.gui.createButton('fire', 'Fire!', {
     *     left: '20px',
     *     top: '-20px',
     *     horizontalAlignment: 'left',
     *     verticalAlignment: 'bottom',
     *     color: '#c0392b',
     * })
     * btn.onClick(() => this.log('Fired!'))
     */
    createButton(
        name: string,
        text: string,
        options?: GuiButtonOptions
    ): GuiButtonHandle

    /**
     * Create a text label.
     *
     * @param name     Internal name for the control (must be unique).
     * @param text     Initial text to display.
     * @param options  Position, size, color, font size, etc.
     * @returns A {@link GuiLabelHandle} for updating the text.
     *
     * @example
     * const hp = this.gui.createLabel('hp', 'HP: 100', {
     *     left: '20px',
     *     top: '20px',
     *     horizontalAlignment: 'left',
     *     verticalAlignment: 'top',
     *     fontSize: 20,
     *     color: '#2ecc71',
     * })
     * // Later:
     * hp.setText('HP: ' + this._health)
     */
    createLabel(
        name: string,
        text: string,
        options?: GuiLabelOptions
    ): GuiLabelHandle

    /**
     * Create a panel (background rectangle).
     * Useful for HUD or menu backgrounds.
     */
    createPanel(name: string, options?: GuiPanelOptions): GuiPanelHandle
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Create a new 3-component vector. */
declare function vec3(x: number, y: number, z: number): Vector3

/** Create a new RGB colour. Each component is 0–1. */
declare function rgb(r: number, g: number, b: number): Color3
