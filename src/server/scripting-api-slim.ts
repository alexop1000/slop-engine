/**
 * Slim scripting API reference for the AI. Full api.d.ts is ~830 lines;
 * this keeps only what the model needs to write correct scripts.
 */

export const SCRIPTING_API_SLIM = `// Script base
declare class Script {
    readonly node: TransformNode | SceneNode
    readonly scene: Scene
    readonly deltaTime: number
    readonly time: number
    readonly input: Input
    readonly camera: UniversalCamera
    readonly gui: GUI
    start(): void
    update(): void
    destroy(): void
    getScript<T = Script>(path: string): T | null
    getScriptOn<T = Script>(node: SceneNode, path: string): T | null
    findNode(name: string): SceneNode | null
    findMesh(name: string): Mesh | null
    log(...args: any[]): void
    spawn(type: 'box'|'sphere'|'cylinder'|'cone'|'torus'|'plane', options?: SpawnOptions): Mesh
    clone(source: Mesh, name?: string): Mesh
    spawnPrefab(path: string, options?: { name?: string; position?: Vector3; rotation?: Vector3; scale?: Vector3 }): Promise<SceneNode>
    addPhysics(mesh: Mesh, mass?: number, restitution?: number): void
    destroyNode(node: SceneNode): void
    raycast(origin: Vector3, direction: Vector3, maxDistance?: number): RaycastHit | null
    raycastAll(origin: Vector3, direction: Vector3, maxDistance?: number): RaycastHit[]
    screenRaycast(screenX: number, screenY: number): RaycastHit | null
    onCollision(callback: (e: CollisionEvent) => void): void
    onCollisionEnd(callback: (e: CollisionEvent) => void): void
}
declare class MeshScript extends Script { readonly node: Mesh }
declare class LightScript extends Script { readonly node: Light }

// Input
declare class Input {
    isKeyDown(code: string): boolean
    isKeyPressed(code: string): boolean
    isKeyReleased(code: string): boolean
    readonly mouseX: number
    readonly mouseY: number
    readonly mouseDeltaX: number
    readonly mouseDeltaY: number
    isMouseButtonDown(button: number): boolean
    lockMouse(): void
    unlockMouse(): void
}

// Core types
declare class Vector3 { x: number; y: number; z: number
    add(o: Vector3): Vector3; subtract(o: Vector3): Vector3; scale(f: number): Vector3
    clone(): Vector3; normalize(): Vector3; length(): number
    static Up(): Vector3; static Down(): Vector3; static Forward(): Vector3; static Backward(): Vector3; static Left(): Vector3; static Right(): Vector3
    static Distance(a: Vector3, b: Vector3): number
}
declare class Color3 { r: number; g: number; b: number; clone(): Color3 }
declare function vec3(x: number, y: number, z: number): Vector3
declare function rgb(r: number, g: number, b: number): Color3

// Scene graph
declare class SceneNode { name: string; parent: SceneNode | null }
declare class TransformNode extends SceneNode { position: Vector3; rotation: Vector3; scaling: Vector3; getAbsolutePosition(): Vector3 }
declare class Mesh extends TransformNode { material: Material | null; physicsBody: PhysicsBody | null; getBoundingSize(): Vector3 }
declare class PhysicsBody { setLinearVelocity(v: Vector3): void; getLinearVelocity(): Vector3; applyImpulse(i: Vector3, loc: Vector3): void }
declare class Light extends SceneNode { intensity: number; diffuse: Color3 }
declare class Camera extends SceneNode { position: Vector3; rotation: Vector3; getDirection(localAxis: Vector3): Vector3 }
declare class UniversalCamera extends Camera { target: Vector3; setTarget(t: Vector3): void; getFrontPosition(d: number): Vector3 }
declare class Scene { getMeshByName(n: string): Mesh | null; getNodeByName(n: string): SceneNode | null }

// Raycast & collision
declare interface RaycastHit { readonly mesh: Mesh; readonly point: Vector3; readonly normal: Vector3; readonly distance: number }
declare interface CollisionEvent { readonly other: Mesh; readonly point: Vector3; readonly normal: Vector3; readonly impulse: number }

// GUI
declare class GUI {
    createButton(name: string, text: string, options?: object): GuiButtonHandle
    createLabel(name: string, text: string, options?: object): GuiLabelHandle
    createPanel(name: string, options?: object): GuiPanelHandle
}
declare class GuiButtonHandle { onClick(cb: () => void): this; setText(t: string): this; setVisible(v: boolean): this; setColor(c: string): this; remove(): void }
declare class GuiLabelHandle { setText(t: string): this; setVisible(v: boolean): this; setColor(c: string): this; remove(): void }
declare class GuiPanelHandle { setVisible(v: boolean): this; setColor(c: string): this; setBorderColor(c: string): this; setAlpha(a: number): this; remove(): void }

// Spawn options
interface SpawnOptions {
    name?: string; position?: Vector3; rotation?: Vector3; scale?: Vector3; color?: Color3
    size?: { width?: number; height?: number; depth?: number; diameter?: number; thickness?: number }
    physics?: { mass?: number; restitution?: number }
}

// Material
declare class Material { name: string; diffuseColor?: Color3 }
declare class StandardMaterial extends Material { diffuseColor: Color3; emissiveColor: Color3 }
`
