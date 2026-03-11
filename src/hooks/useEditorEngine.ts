import {
    createEffect,
    createMemo,
    createSignal,
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
    rehydrateTextures,
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

const MAX_UNDO_STEPS = 50

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
    let _physicsPlugin: HavokPlugin | null = null
    const _undoStack: SceneSnapshot[] = []
    const _redoStack: SceneSnapshot[] = []
    const [undoRedoVersion, setUndoRedoVersion] = createSignal(0)

    function pushUndoState() {
        const s = scene()
        if (!s || isPlaying()) return
        try {
            const snapshot = captureSceneSnapshot(s)
            if (_undoStack.length >= MAX_UNDO_STEPS) _undoStack.shift()
            _undoStack.push(snapshot)
            _redoStack.length = 0
            setUndoRedoVersion((v) => v + 1)
        } catch {
            // ignore snapshot errors
        }
    }

    function undo() {
        const s = scene()
        if (_undoStack.length === 0 || isPlaying() || !s) return
        const currentSnapshot = captureSceneSnapshot(s)
        if (_redoStack.length >= MAX_UNDO_STEPS) _redoStack.shift()
        _redoStack.push(currentSnapshot)
        const snapshot = _undoStack.pop()!
        restoreSceneSnapshot(s, snapshot)
        setUndoRedoVersion((v) => v + 1)
        setNodeTick((t) => t + 1)
        scheduleAutoSave()
    }

    function redo() {
        const s = scene()
        if (_redoStack.length === 0 || isPlaying() || !s) return
        const currentSnapshot = captureSceneSnapshot(s)
        if (_undoStack.length >= MAX_UNDO_STEPS) _undoStack.shift()
        _undoStack.push(currentSnapshot)
        const snapshot = _redoStack.pop()!
        restoreSceneSnapshot(s, snapshot)
        setUndoRedoVersion((v) => v + 1)
        setNodeTick((t) => t + 1)
        scheduleAutoSave()
    }

    const canUndo = createMemo(
        () => (undoRedoVersion(), _undoStack.length > 0 && !isPlaying())
    )
    const canRedo = createMemo(
        () => (undoRedoVersion(), _redoStack.length > 0 && !isPlaying())
    )

    function performSave(s: Scene) {
        try {
            setSceneJson(serializeScene(s))
            setLastSaved(new Date())
            setIsDirty(false)
        } catch (error) {
            setIsDirty(true)
            console.error('Failed to persist scene state.', error)
        }
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
                    pushUndoState()
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
        _physicsPlugin = physicsPlugin

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
                await rehydrateTextures(sceneInstance)
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
                const s = scene()
                if (!s) return
                const result = s.pick(
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
            const s = scene()
            if (s) performSave(s)
        }, 30_000)
        onCleanup(() => clearInterval(periodicInterval))

        const handleKeyDown = (e: KeyboardEvent) => {
            if (isPlaying()) return
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z') {
                    e.preventDefault()
                    if (e.shiftKey) {
                        redo()
                    } else {
                        undo()
                    }
                } else if (e.key === 'y') {
                    e.preventDefault()
                    redo()
                }
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        onCleanup(() => window.removeEventListener('keydown', handleKeyDown))

        setLastSaved(new Date())
        setScene(sceneInstance)
        setEngine(eng)
        eng.runRenderLoop(() => scene()?.render())

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
        undo,
        redo,
        pushUndoState,
        canUndo,
        canRedo,
    }
}
