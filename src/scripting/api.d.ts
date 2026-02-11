/**
 * Slop Engine Scripting API
 *
 * Scripts extend the Script class and implement lifecycle methods.
 * All types below are available globally — no imports needed.
 *
 * @example
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
    /** The node this script is attached to. */
    readonly node: TransformNode

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

    // -- Helpers --------------------------------------------------------------

    /** Find a node in the scene by name. Returns null if not found. */
    findNode(name: string): SceneNode | null

    /** Find a mesh in the scene by name. Returns null if not found. */
    findMesh(name: string): Mesh | null

    /** Log a message to the console panel. */
    log(...args: any[]): void
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
    /** Return a normalised copy of this vector. */
    normalize(): Vector3
    /** Normalise this vector in place and return `this`. */
    normalizeInPlace(): Vector3
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
declare class Mesh extends AbstractMesh {}

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

/** A camera in the scene. */
declare class Camera extends SceneNode {
    /** World-space position. */
    position: Vector3
    /** Vertical field of view in radians. */
    fov: number
    /** Near clipping distance. */
    minZ: number
    /** Far clipping distance. */
    maxZ: number
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
// Utility
// ---------------------------------------------------------------------------

/** Create a new 3-component vector. */
declare function vec3(x: number, y: number, z: number): Vector3

/** Create a new RGB colour. Each component is 0–1. */
declare function rgb(r: number, g: number, b: number): Color3
