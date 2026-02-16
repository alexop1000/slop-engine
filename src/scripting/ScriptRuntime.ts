import {
    Scene,
    Node,
    TransformNode,
    UniversalCamera,
    Vector3,
    Color3,
    Color4,
    Quaternion,
    Observer,
} from 'babylonjs'
import { transform } from 'sucrase'
import { Script } from './Script'
import { InputManager } from './InputManager'
import { getBlob } from '../assetStore'
import { pushLog } from './consoleStore'

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
    inverseLerp: (a: number, b: number, value: number) =>
        (value - a) / (b - a),
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

/**
 * Compiles user TypeScript source to a Script subclass constructor.
 *
 * The compiled code runs inside a `new Function()` with a controlled
 * set of globals — only the symbols we explicitly pass in are available.
 */
function compileScript(tsSource: string): new () => Script {
    // Transpile TS → JS (CJS so we can extract exports.default)
    const { code: jsCode } = transform(tsSource, {
        transforms: ['typescript', 'imports'],
        filePath: 'script.ts',
    })

    // Wrap in a function that provides a controlled scope.
    // The compiled CJS code writes to `exports.default`.
    const wrapper = new Function(
        'Script',
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
        `
    )

    const ScriptClass = wrapper(
        Script,
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

    return ScriptClass as new () => Script
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

    /**
     * Collect all nodes with `metadata.scripts`, compile each script,
     * instantiate, wire up properties, and call `start()`.
     */
    async start(scene: Scene, canvas: HTMLCanvasElement): Promise<void> {
        this._startTime = performance.now() / 1000
        this._input.attach(canvas)

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
                    const ScriptClass = compileScript(source)
                    const instance = new ScriptClass()

                    // Wire up runtime properties
                    instance.node = node as TransformNode
                    instance.scene = scene
                    instance.input = this._input
                    instance.camera = scene.activeCamera as UniversalCamera
                    instance.deltaTime = 0
                    instance.time = 0

                    this._scripts.push({ instance, node, path })
                } catch (err) {
                    pushLog(
                        'error',
                        `Failed to compile script "${path}":`,
                        String(err)
                    )
                }
            }
        }

        // Call start() on all instances (after all are created)
        for (const { instance, path } of this._scripts) {
            try {
                instance.start()
            } catch (err) {
                pushLog('error', `Error in start() of "${path}":`, String(err))
            }
        }

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
                pushLog('error', `Error in update() of "${path}":`, String(err))
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
                    String(err)
                )
            }
        }

        this._scripts = []

        if (this._observer) {
            this._observer.remove()
            this._observer = null
        }

        this._input.detach()
    }
}
