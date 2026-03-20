import {
    Scene,
    Node,
    TransformNode,
    AbstractMesh,
    UniversalCamera,
    Vector3,
    Color3,
    Color4,
    Quaternion,
    Observer,
} from 'babylonjs'
import { transform } from 'sucrase'
import { Script, MeshScript, LightScript } from './Script'
import type { ScriptNodeType } from './Script'
import { InputManager } from './InputManager'
import { RuntimeWorld } from './RuntimeWorld'
import { getBlob } from '../assetStore'
import { pushLog } from './consoleStore'

function formatError(err: unknown, scriptPath?: string): string {
    if (!(err instanceof Error) || !err.stack) return String(err)
    if (!scriptPath) return err.stack
    const lines = err.stack.split('\n')
    const header = lines[0]
    const frames = lines.slice(1).filter((line) => line.includes(scriptPath))
    if (frames.length === 0) return header
    return header + '\n' + frames.join('\n')
}

/** Metadata shape we expect on nodes that have scripts attached. */
interface ScriptMetadata {
    scripts?: string[]
    [key: string]: unknown
}

/** One live script instance bound to a node. */
interface ActiveScript {
    instance: Script
    node: Node
    path: string
}

/**
 * Extended Math object with extra game-dev helpers.
 * Passed into the script sandbox as `Math`.
 */
const SlopMath: Record<string, unknown> = {}
for (const key of Object.getOwnPropertyNames(Math)) {
    SlopMath[key] = (Math as any)[key]
}
Object.assign(SlopMath, {
    clamp: (value: number, min: number, max: number) =>
        Math.min(Math.max(value, min), max),
    lerp: (a: number, b: number, t: number) => a + (b - a) * t,
    inverseLerp: (a: number, b: number, value: number) => (value - a) / (b - a),
    smoothstep: (edge0: number, edge1: number, x: number) => {
        const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
        return t * t * (3 - 2 * t)
    },
    degToRad: (degrees: number) => degrees * (Math.PI / 180),
    radToDeg: (radians: number) => radians * (180 / Math.PI),
    remap: (
        value: number,
        inMin: number,
        inMax: number,
        outMin: number,
        outMax: number
    ) => outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin),
    randomRange: (min: number, max: number) =>
        min + Math.random() * (max - min),
    moveTowards: (current: number, target: number, maxDelta: number) => {
        if (Math.abs(target - current) <= maxDelta) return target
        return current + Math.sign(target - current) * maxDelta
    },
    pingPong: (t: number, length: number) => {
        const mod = t % (length * 2)
        return length - Math.abs(mod - length)
    },
})

// Patch getBoundingSize() onto AbstractMesh so scripts can query actual
// geometry dimensions (the `size` param bakes into vertices, leaving
// scaling at [1,1,1] — this returns the real extents).
if (!(AbstractMesh.prototype as any).getBoundingSize) {
    ;(AbstractMesh.prototype as any).getBoundingSize = function (
        this: AbstractMesh
    ): Vector3 {
        const bb = this.getBoundingInfo().boundingBox
        return bb.extendSize.scale(2)
    }
}

/**
 * Compiles user TypeScript source to a Script subclass constructor.
 *
 * The compiled code runs inside a `new Function()` with a controlled
 * set of globals — only the symbols we explicitly pass in are available.
 * @param tsSource - Raw TypeScript source
 * @param filePath - Path used for stack traces (e.g. "scripts/MyScript.ts")
 */
function compileScript(tsSource: string, filePath: string): new () => Script {
    // Transpile TS → JS (CJS so we can extract exports.default)
    const { code: jsCode } = transform(tsSource, {
        transforms: ['typescript', 'imports'],
        filePath,
    })

    // Wrap in a function that provides a controlled scope.
    // The compiled CJS code writes to `exports.default`.
    // sourceURL makes stack traces show the script path instead of <anonymous>.
    const wrapper = new Function(
        'Script',
        'MeshScript',
        'LightScript',
        'Vector3',
        'Color3',
        'Color4',
        'Quaternion',
        'Math',
        'vec3',
        'rgb',
        `
        "use strict";
        var module = { exports: {} };
        var exports = module.exports;
        ${jsCode}
        return module.exports.default || module.exports;
        //# sourceURL=${filePath}
        `
    )

    const ScriptClass = wrapper(
        Script,
        MeshScript,
        LightScript,
        Vector3,
        Color3,
        Color4,
        Quaternion,
        SlopMath,
        // Utility shortcuts
        (x: number, y: number, z: number) => new Vector3(x, y, z),
        (r: number, g: number, b: number) => new Color3(r, g, b)
    )

    if (typeof ScriptClass !== 'function') {
        throw new TypeError(
            'Script must export a default class extending Script. ' +
                'Example: export default class extends Script { ... }'
        )
    }

    return ScriptClass as (new () => Script) & { nodeType?: ScriptNodeType }
}

// ---------------------------------------------------------------------------
// Node type helpers (used for validation + UI filtering)
// ---------------------------------------------------------------------------

/** Return a human-readable type name for a BabylonJS node. */
export function getNodeTypeName(node: Node): ScriptNodeType {
    if (node instanceof AbstractMesh) return 'Mesh'
    if (node instanceof TransformNode) return 'TransformNode'
    // Lights extend Node, not TransformNode
    if ((node as any).diffuse !== undefined) return 'Light'
    return 'Node'
}

/** Check whether a node satisfies a script's `nodeType` constraint. */
function isNodeCompatible(node: Node, requiredType: ScriptNodeType): boolean {
    switch (requiredType) {
        case 'Node':
            return true
        case 'TransformNode':
            return node instanceof TransformNode
        case 'Mesh':
            return node instanceof AbstractMesh
        case 'Light':
            return (node as any).diffuse !== undefined
        default:
            return true
    }
}

/**
 * Parse the `nodeType` from a script source string without compiling it.
 * Used by the UI to filter which scripts can be attached to a given node.
 *
 * Detects patterns like:
 * - `extends MeshScript`
 * - `extends LightScript`
 * - `static nodeType = 'Mesh'` (or "Mesh")
 */
export function parseScriptNodeType(
    source: string
): ScriptNodeType | undefined {
    // Check for convenience subclass usage
    const extendsMatch = source.match(/extends\s+(MeshScript|LightScript)\b/)
    if (extendsMatch) {
        switch (extendsMatch[1]) {
            case 'MeshScript':
                return 'Mesh'
            case 'LightScript':
                return 'Light'
        }
    }

    // Check for static nodeType = '...'
    const staticMatch = source.match(/static\s+nodeType\s*=\s*['"](\w+)['"]/)
    if (staticMatch) {
        return staticMatch[1] as ScriptNodeType
    }

    return undefined
}

/**
 * Manages the full lifecycle of user scripts during play mode.
 *
 * Usage:
 * ```
 * const runtime = new ScriptRuntime()
 * await runtime.start(scene, canvas)   // compiles & starts all scripts
 * // ... engine runs, calling update each frame via observer ...
 * runtime.stop()                        // destroys everything
 * ```
 */
export class ScriptRuntime {
    private _scripts: ActiveScript[] = []
    private readonly _input = new InputManager()
    private _observer: Observer<Scene> | null = null
    private _startTime = 0
    private _world: RuntimeWorld | null = null
    /** Maps nodeUniqueId → scriptPath → Script instance for cross-script lookups. */
    private _byNodeAndPath = new Map<number, Map<string, Script>>()

    /** Look up a script instance by node ID and file path. */
    private _lookupScript = (nodeId: number, path: string): Script | null => {
        return this._byNodeAndPath.get(nodeId)?.get(path) ?? null
    }

    /**
     * Collect all nodes with `metadata.scripts`, compile each script,
     * instantiate, wire up properties, and call `start()`.
     */
    async start(scene: Scene, canvas: HTMLCanvasElement): Promise<void> {
        this._startTime = performance.now() / 1000
        this._input.attach(canvas)
        this._world = new RuntimeWorld(scene)

        // Gather every node that has scripts attached
        const allNodes: Node[] = [
            ...scene.meshes,
            ...scene.lights,
            ...scene.cameras,
            ...scene.transformNodes,
        ]

        for (const node of allNodes) {
            const meta = node.metadata as ScriptMetadata | undefined
            const scriptPaths = meta?.scripts
            if (!scriptPaths || scriptPaths.length === 0) continue

            for (const path of scriptPaths) {
                try {
                    const blob = await getBlob(path)
                    if (!blob) {
                        pushLog('error', `Script not found: ${path}`)
                        continue
                    }

                    const source = await blob.text()
                    const ScriptClass = compileScript(source, path)

                    // Validate node type constraint
                    const requiredType = ScriptClass.nodeType
                    if (requiredType && !isNodeCompatible(node, requiredType)) {
                        pushLog(
                            'error',
                            `Script "${path}" requires a ${requiredType} node, ` +
                                `but "${node.name}" is a ${getNodeTypeName(
                                    node
                                )}. Skipping.`
                        )
                        continue
                    }

                    const instance = new ScriptClass()

                    // Wire up runtime properties
                    instance.node = node as TransformNode
                    instance.scene = scene
                    instance.input = this._input
                    instance.camera = scene.activeCamera as UniversalCamera
                    instance.deltaTime = 0
                    instance.time = 0
                    instance._world = this._world!
                    instance._lookup = this._lookupScript

                    // Register in the lookup map
                    const nodeId = (node as any).uniqueId as number
                    let nodeMap = this._byNodeAndPath.get(nodeId)
                    if (!nodeMap) {
                        nodeMap = new Map()
                        this._byNodeAndPath.set(nodeId, nodeMap)
                    }
                    nodeMap.set(path, instance)

                    this._scripts.push({ instance, node, path })
                } catch (err) {
                    pushLog(
                        'error',
                        `Failed to compile script "${path}":`,
                        formatError(err, path)
                    )
                }
            }
        }

        // Call start() on all instances (after all are created)
        for (const { instance, path } of this._scripts) {
            try {
                instance.start()
            } catch (err) {
                pushLog(
                    'error',
                    `Error in start() of "${path}":`,
                    formatError(err, path)
                )
            }
        }

        // Register collision callbacks from scripts that called
        // onCollision() / onCollisionEnd() during start()
        for (const { instance } of this._scripts) {
            const meshNode = instance.node
            if (!meshNode || !('uniqueId' in meshNode)) continue
            const id = (meshNode as any).uniqueId as number

            if (instance._collisionStartCallbacks.length > 0) {
                this._world!.registerCollisionStart(
                    id,
                    instance._collisionStartCallbacks
                )
            }
            if (instance._collisionEndCallbacks.length > 0) {
                this._world!.registerCollisionEnd(
                    id,
                    instance._collisionEndCallbacks
                )
            }
        }

        // Start listening for Havok collision events
        this._world!.startCollisionObserver()

        // Register per-frame update
        this._observer = scene.onBeforeRenderObservable.add(() => {
            this._tick(scene)
        })
    }

    /** Per-frame tick: update timing, input, and call update() on each script. */
    private _tick(scene: Scene): void {
        this._input.tick()

        const now = performance.now() / 1000
        const deltaTime = scene.getEngine().getDeltaTime() / 1000
        const time = now - this._startTime

        for (const { instance, path } of this._scripts) {
            instance.deltaTime = deltaTime
            instance.time = time
            try {
                instance.update()
            } catch (err) {
                pushLog(
                    'error',
                    `Error in update() of "${path}":`,
                    formatError(err, path)
                )
            }
        }
    }

    /** Call destroy() on all scripts, remove observer, detach input. */
    stop(): void {
        for (const { instance, path } of this._scripts) {
            try {
                instance.destroy()
            } catch (err) {
                pushLog(
                    'error',
                    `Error in destroy() of "${path}":`,
                    formatError(err, path)
                )
            }
        }

        this._scripts = []
        this._byNodeAndPath.clear()

        // Dispose all runtime-created objects after user destroy() calls
        if (this._world) {
            this._world.disposeAll()
            this._world = null
        }

        if (this._observer) {
            this._observer.remove()
            this._observer = null
        }

        this._input.detach()
    }
}
