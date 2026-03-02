import {
    createEffect,
    onMount,
    onCleanup,
    untrack,
} from 'solid-js'
import {
    Engine,
    Scene,
    Mesh,
    Color3,
    GizmoManager,
    UtilityLayerRenderer,
    PhysicsAggregate,
    PhysicsShapeType,
    HavokPlugin,
} from 'babylonjs'

import {
    createDefaultScene,
    loadSceneFromJson,
    serializeScene,
    setupEditorCamera,
    captureSceneSnapshot,
    restoreSceneSnapshot,
    setupRuntimeCamera,
} from '../scene/EditorScene'
import type { SceneSnapshot } from '../scene/EditorScene'
import { ScriptRuntime } from '../scripting/ScriptRuntime'
import { clearLogs } from '../scripting/consoleStore'
import { getInitializedHavok } from '../utils/editorUtils'
import type { EditorState, GizmoType } from './useEditorState'

export function useEditorEngine(state: EditorState) {
    const {
        scene,
        setScene,
        setEngine,
        setGizmoManager,
        selectedNode,
        setSelectedNode,
        setNodeTick,
        sceneJson,
        setSceneJson,
        setLastSaved,
        setIsDirty,
        setIsPlaying,
        isPlaying,
        gizmoManager,
        selectedGizmo,
        isVibeMode,
        engine,
    } = state

    let _autoSaveTimer: ReturnType<typeof setTimeout> | null = null
    let _isDraggingGizmo = false
    const _physicsAggregates = new Map<Mesh, PhysicsAggregate>()
    let _sceneSnapshot: SceneSnapshot | null = null
    let _scriptRuntime: ScriptRuntime | null = null

    function performSave(s: Scene) {
        setSceneJson(serializeScene(s))
        setLastSaved(new Date())
        setIsDirty(false)
    }

    function scheduleAutoSave() {
        setIsDirty(true)
        if (_autoSaveTimer) clearTimeout(_autoSaveTimer)
        _autoSaveTimer = setTimeout(() => {
            const s = scene()
            if (!s || isPlaying()) return
            performSave(s)
        }, 2000)
    }

    function hookGizmoDrag() {
        const gm = gizmoManager()
        if (!gm) return
        for (const g of [
            gm.gizmos.positionGizmo,
            gm.gizmos.rotationGizmo,
            gm.gizmos.scaleGizmo,
            gm.gizmos.boundingBoxGizmo,
        ]) {
            if (g && !(g as any).__dragHooked) {
                ;(g as any).__dragHooked = true
                const gizmo = g as any
                gizmo.onDragStartObservable?.add(() => {
                    _isDraggingGizmo = true
                })
                gizmo.onDragEndObservable?.add(() => {
                    _isDraggingGizmo = false
                    setNodeTick((t) => t + 1)
                    scheduleAutoSave()
                })
            }
        }
    }

    const setSelectedGizmo = (gizmo: GizmoType) => {
        state.setSelectedGizmo(gizmo)
        const gm = gizmoManager()
        if (!gm) return
        gm.positionGizmoEnabled = gizmo === 'position'
        gm.rotationGizmoEnabled = gizmo === 'rotation'
        gm.scaleGizmoEnabled = gizmo === 'scale'
        gm.boundingBoxGizmoEnabled = gizmo === 'boundingBox'
        gm.attachToMesh(
            selectedNode() instanceof Mesh ? (selectedNode() as Mesh) : null
        )
        hookGizmoDrag()
    }

    createEffect(() => {
        isVibeMode()
        queueMicrotask(() => engine()?.resize())
    })

    let _lastOutlinedMesh: Mesh | null = null
    createEffect(() => {
        const node = selectedNode()
        const gm = gizmoManager()

        if (_lastOutlinedMesh && _lastOutlinedMesh !== node) {
            _lastOutlinedMesh.renderOutline = false
        }
        _lastOutlinedMesh = null

        if (node instanceof Mesh) {
            node.renderOutline = true
            node.outlineColor = new Color3(0, 0, 0)
            node.outlineWidth = 0.05
            _lastOutlinedMesh = node

            if (gm) {
                const gizmo = untrack(selectedGizmo)
                gm.positionGizmoEnabled = gizmo === 'position'
                gm.rotationGizmoEnabled = gizmo === 'rotation'
                gm.scaleGizmoEnabled = gizmo === 'scale'
                gm.boundingBoxGizmoEnabled = gizmo === 'boundingBox'
                gm.attachToMesh(node)
                hookGizmoDrag()
            }
        } else if (gm) {
            gm.positionGizmoEnabled = false
            gm.rotationGizmoEnabled = false
            gm.scaleGizmoEnabled = false
            gm.boundingBoxGizmoEnabled = false
        }
    })

    onMount(async () => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement
        const eng = new Engine(canvas, true)
        const initializedHavok = await getInitializedHavok()
        const physicsPlugin = new HavokPlugin(true, initializedHavok)

        let sceneInstance: Scene
        const savedJson = sceneJson()
        if (savedJson) {
            try {
                const result = await loadSceneFromJson(
                    eng,
                    savedJson,
                    physicsPlugin
                )
                sceneInstance = result.scene
            } catch {
                const result = createDefaultScene(eng, physicsPlugin)
                sceneInstance = result.scene
            }
        } else {
            const result = createDefaultScene(eng, physicsPlugin)
            sceneInstance = result.scene
        }

        setupEditorCamera(sceneInstance, canvas)

        const utilityLayer = new UtilityLayerRenderer(sceneInstance)
        const gm = new GizmoManager(sceneInstance, undefined, utilityLayer)
        gm.positionGizmoEnabled = false
        gm.rotationGizmoEnabled = false
        gm.scaleGizmoEnabled = false
        gm.enableAutoPicking = false
        gm.boundingBoxGizmoEnabled = false

        let pointerDownPos: { x: number; y: number } | null = null
        let hasDragged = false
        const DRAG_THRESHOLD = 5

        canvas.addEventListener('pointerdown', (e) => {
            if (isPlaying()) return
            pointerDownPos = { x: e.clientX, y: e.clientY }
            hasDragged = false
        })
        canvas.addEventListener('pointermove', (e) => {
            if (isPlaying()) return
            if (pointerDownPos && !hasDragged) {
                const dx = e.clientX - pointerDownPos.x
                const dy = e.clientY - pointerDownPos.y
                if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
                    hasDragged = true
                }
            }
        })
        canvas.addEventListener('pointerup', (e) => {
            if (isPlaying()) return
            if (!hasDragged && pointerDownPos) {
                const result = sceneInstance.pick(
                    e.offsetX,
                    e.offsetY,
                    (node) => node instanceof Mesh
                )
                if (result.hit && result.pickedMesh) {
                    setSelectedNode(result.pickedMesh as Mesh)
                } else {
                    setSelectedNode(undefined)
                }
            }
            pointerDownPos = null
            hasDragged = false
        })

        setGizmoManager(gm)
        sceneInstance.onBeforeRenderObservable.add(() => {
            if (_isDraggingGizmo) setNodeTick((t) => t + 1)
        })

        sceneInstance.onNewMeshAddedObservable.add(() => scheduleAutoSave())
        sceneInstance.onMeshRemovedObservable.add(() => scheduleAutoSave())
        sceneInstance.onNewLightAddedObservable.add(() => scheduleAutoSave())
        sceneInstance.onLightRemovedObservable.add(() => scheduleAutoSave())
        sceneInstance.onNewTransformNodeAddedObservable.add(() =>
            scheduleAutoSave()
        )
        sceneInstance.onTransformNodeRemovedObservable.add(() =>
            scheduleAutoSave()
        )

        const periodicInterval = setInterval(() => {
            if (isPlaying()) return
            performSave(sceneInstance)
        }, 30_000)
        onCleanup(() => clearInterval(periodicInterval))

        setLastSaved(new Date())
        setScene(sceneInstance)
        setEngine(eng)
        eng.runRenderLoop(() => sceneInstance.render())

        const resizeObserver = new ResizeObserver(() => {
            eng.resize()
        })
        resizeObserver.observe(canvas.parentElement!)

        window.addEventListener('resize', () => {
            eng.resize()
        })
    })

    const handlePlayStop = async () => {
        const s = scene()
        if (!s) return
        if (isPlaying()) {
            if (_scriptRuntime) {
                _scriptRuntime.stop()
                _scriptRuntime = null
            }

            for (const [, agg] of _physicsAggregates) {
                agg.dispose()
            }
            _physicsAggregates.clear()

            await new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve())
            )

            if (_sceneSnapshot) {
                restoreSceneSnapshot(s, _sceneSnapshot)
                _sceneSnapshot = null
            }

            const gm = gizmoManager()
            if (gm) {
                gm.attachToMesh(
                    selectedNode() instanceof Mesh
                        ? (selectedNode() as Mesh)
                        : null
                )
                gm.positionGizmoEnabled = selectedGizmo() === 'position'
                gm.rotationGizmoEnabled = selectedGizmo() === 'rotation'
                gm.scaleGizmoEnabled = selectedGizmo() === 'scale'
                gm.boundingBoxGizmoEnabled = selectedGizmo() === 'boundingBox'
            }

            const canvas = document.getElementById(
                'canvas'
            ) as HTMLCanvasElement
            setupEditorCamera(s, canvas)
            setIsPlaying(false)
        } else {
            clearLogs()
            _sceneSnapshot = captureSceneSnapshot(s)

            for (const mesh of s.meshes) {
                if (!(mesh instanceof Mesh)) continue
                const metadata = mesh.metadata as
                    | { physicsMass?: number; physicsEnabled?: boolean }
                    | undefined
                const mass = metadata?.physicsMass ?? 1
                const enabled = metadata?.physicsEnabled ?? false
                if (enabled) {
                    const agg = new PhysicsAggregate(
                        mesh,
                        PhysicsShapeType.CONVEX_HULL,
                        { mass, restitution: 0.75 },
                        s
                    )
                    agg.body.disablePreStep = false
                    _physicsAggregates.set(mesh, agg)
                }
            }

            const canvas = document.getElementById(
                'canvas'
            ) as HTMLCanvasElement
            setupRuntimeCamera(s, canvas)

            _scriptRuntime = new ScriptRuntime()
            await _scriptRuntime.start(s, canvas)

            setIsPlaying(true)
        }
    }

    return {
        scheduleAutoSave,
        performSave,
        handlePlayStop,
        setSelectedGizmo,
    }
}
