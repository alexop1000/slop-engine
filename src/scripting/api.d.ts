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

    /** The active runtime camera. */
    readonly camera: UniversalCamera

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
    /** Whether physics simulation is enabled for this mesh. */
    physicsEnabled: boolean
    /** The mass of this mesh for physics simulation (0 = static). */
    physicsMass: number
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
 *         // Mouse look
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
// Utility
// ---------------------------------------------------------------------------

/** Create a new 3-component vector. */
declare function vec3(x: number, y: number, z: number): Vector3

/** Create a new RGB colour. Each component is 0–1. */
declare function rgb(r: number, g: number, b: number): Color3
