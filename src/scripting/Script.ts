import { Scene, Node, Mesh, TransformNode, UniversalCamera } from 'babylonjs'
import { InputManager } from './InputManager'
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
}
