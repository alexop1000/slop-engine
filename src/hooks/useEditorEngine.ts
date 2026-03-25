import {
    createEffect,
    createMemo,
    createSignal,
    onMount,
    onCleanup,
} from 'solid-js'
import {
    Engine,
    Scene,
    Mesh,
    AbstractMesh,
    Color3,
    Vector3,
    Matrix,
    Quaternion,
    GizmoManager,
    UtilityLayerRenderer,
    PhysicsAggregate,
    PhysicsShapeType,
    HavokPlugin,
    TransformNode,
} from 'babylonjs'

import {
    createDefaultScene,
    loadSceneFromJson,
    rehydrateTextures,
    rehydrateImportedModels,
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
import {
    getAllBlobs,
    restoreAllBlobs,
    getAssetStore,
    getSceneJsonFromDB,
    saveSceneJsonToDB,
    type AssetNode,
} from '../assetStore'
import type { EditorState, GizmoType } from './useEditorState'
import {
    EDITOR_GIZMO_PIVOT_NAME,
    ensureEditorGizmoPivot,
    isSlopEditorHelper,
    worldAabbCenterForMeshes,
} from '../utils/editorGizmoUtils'

export interface Checkpoint {
    sceneJson: string
    blobs: Map<string, Blob>
    assetTree: AssetNode
}

const MAX_UNDO_STEPS = 50

export function useEditorEngine(state: EditorState) {
    const {
        scene,
        setScene,
        setEngine,
        setGizmoManager,
        selectedNodes,
        setSelectedNode,
        toggleSelectedNode,
        nodeTick,
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
    let _multiPivotSession = false
    let _multiPivotStartMatrix: Matrix | null = null
    let _multiMeshStartMatrices: Matrix[] = []
    let _multiGizmoFollowMeshes: Mesh[] = []
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
            const json = serializeScene(s)
            setSceneJson(json)
            saveSceneJsonToDB(json).catch((err) =>
                console.error('Failed to persist scene to IndexedDB.', err)
            )
            setLastSaved(new Date())
            setIsDirty(false)
        } catch (error) {
            setIsDirty(true)
            console.error('Failed to serialize scene.', error)
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

    function endMultiPivotSession() {
        if (!_multiPivotSession) return
        _multiPivotSession = false
        _multiPivotStartMatrix = null
        _multiMeshStartMatrices = []
        _multiGizmoFollowMeshes = []
    }

    function beginMultiPivotTransformSession(pivotMesh: AbstractMesh) {
        _multiPivotSession = true
        pushUndoState()
        _multiGizmoFollowMeshes = selectedNodes().filter(
            (n): n is Mesh => n instanceof Mesh
        )
        pivotMesh.computeWorldMatrix(true)
        _multiPivotStartMatrix = pivotMesh.getWorldMatrix().clone()
        _multiMeshStartMatrices = _multiGizmoFollowMeshes.map((m) => {
            m.computeWorldMatrix(true)
            return m.getWorldMatrix().clone()
        })
    }

    /** Babylon: A.multiply(B) === B×A. We need newWorld = pivotNow × inv(pivotStart) × meshStart. */
    function applyWorldMatrixToMesh(mesh: Mesh, world: Matrix) {
        const parent = mesh.parent
        let local = world
        if (parent instanceof TransformNode) {
            parent.computeWorldMatrix(true)
            const invParentWorld = Matrix.Invert(parent.getWorldMatrix())
            local = world.multiply(invParentWorld)
        }
        const scaling = Vector3.Zero()
        const rot = new Quaternion()
        const pos = Vector3.Zero()
        if (!local.decompose(scaling, rot, pos)) return
        mesh.scaling.copyFrom(scaling)
        mesh.position.copyFrom(pos)
        mesh.rotationQuaternion = rot
        mesh.rotation = Vector3.Zero()
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
                const isPosition = g === gm.gizmos.positionGizmo
                const isRotation = g === gm.gizmos.rotationGizmo
                const isScale = g === gm.gizmos.scaleGizmo
                const isPivotMultiTransform =
                    isPosition || isRotation || isScale
                gizmo.onDragStartObservable?.add(() => {
                    const attached = gm.attachedMesh
                    if (
                        isPivotMultiTransform &&
                        attached?.name === EDITOR_GIZMO_PIVOT_NAME &&
                        selectedNodes().filter((n) => n instanceof Mesh)
                            .length >= 2
                    ) {
                        beginMultiPivotTransformSession(attached)
                        return
                    }
                    if (attached?.name !== EDITOR_GIZMO_PIVOT_NAME) {
                        pushUndoState()
                    }
                })
                gizmo.onDragEndObservable?.add(() => {
                    if (isPivotMultiTransform) endMultiPivotSession()
                    setNodeTick((t) => t + 1)
                    scheduleAutoSave()
                })
            }
        }
    }

    /** After render: pivot TRS updated by gizmo; map onto selection via rigid group matrix. */
    function tickMultiPivotFromGizmo(s: Scene) {
        if (
            !_multiPivotSession ||
            !_multiPivotStartMatrix ||
            _multiGizmoFollowMeshes.length < 2
        ) {
            return
        }
        const pivot = s.getMeshByName(EDITOR_GIZMO_PIVOT_NAME)
        if (!pivot) return
        pivot.computeWorldMatrix(true)
        const pivotNow = pivot.getWorldMatrix()
        const pivotStartInv = Matrix.Invert(_multiPivotStartMatrix)
        const delta = pivotStartInv.multiply(pivotNow)

        for (let i = 0; i < _multiGizmoFollowMeshes.length; i++) {
            const m = _multiGizmoFollowMeshes[i]
            const meshStart = _multiMeshStartMatrices[i]
            if (!meshStart) continue
            const newWorld = meshStart.multiply(delta)
            applyWorldMatrixToMesh(m, newWorld)
        }
    }

    const setSelectedGizmo = (gizmo: GizmoType) => {
        state.setSelectedGizmo(gizmo)
    }

    createEffect(() => {
        isVibeMode()
        queueMicrotask(() => engine()?.resize())
    })

    let _prevOutlinedMeshes: Mesh[] = []

    createEffect(() => {
        const meshCount = state
            .selectedNodes()
            .filter((n) => n instanceof Mesh).length
        if (meshCount > 1 && state.selectedGizmo() === 'boundingBox') {
            state.setSelectedGizmo('position')
        }
    })

    createEffect(() => {
        const nodes = selectedNodes()
        const gm = gizmoManager()
        const playing = isPlaying()
        const s = scene()
        const gizmoType = selectedGizmo()

        for (const m of _prevOutlinedMeshes) {
            if (!nodes.includes(m)) {
                m.renderOutline = false
            }
        }
        _prevOutlinedMeshes = []

        if (playing) {
            if (gm) {
                gm.attachToMesh(null)
                gm.positionGizmoEnabled = false
                gm.rotationGizmoEnabled = false
                gm.scaleGizmoEnabled = false
                gm.boundingBoxGizmoEnabled = false
            }
            return
        }

        const meshNodes = nodes.filter((n): n is Mesh => n instanceof Mesh)
        if (meshNodes.length < 2) endMultiPivotSession()
        for (const m of meshNodes) {
            m.renderOutline = true
            m.outlineColor = new Color3(0, 0, 0)
            m.outlineWidth = 0.05
        }
        _prevOutlinedMeshes = meshNodes

        if (!gm || !s) return

        if (meshNodes.length === 0) {
            gm.attachToMesh(null)
            gm.positionGizmoEnabled = false
            gm.rotationGizmoEnabled = false
            gm.scaleGizmoEnabled = false
            gm.boundingBoxGizmoEnabled = false
            return
        }

        if (meshNodes.length === 1) {
            const m = meshNodes[0]
            gm.positionGizmoEnabled = gizmoType === 'position'
            gm.rotationGizmoEnabled = gizmoType === 'rotation'
            gm.scaleGizmoEnabled = gizmoType === 'scale'
            gm.boundingBoxGizmoEnabled = gizmoType === 'boundingBox'
            gm.attachToMesh(m)
            hookGizmoDrag()
            return
        }

        const pivot = ensureEditorGizmoPivot(s)
        if (!_multiPivotSession) {
            const center = worldAabbCenterForMeshes(meshNodes)
            pivot.setAbsolutePosition(center)
            pivot.rotationQuaternion = null
            pivot.rotation = Vector3.Zero()
            pivot.scaling.copyFromFloats(1, 1, 1)
        }
        gm.positionGizmoEnabled = gizmoType === 'position'
        gm.rotationGizmoEnabled = gizmoType === 'rotation'
        gm.scaleGizmoEnabled = gizmoType === 'scale'
        gm.boundingBoxGizmoEnabled = false
        gm.attachToMesh(pivot)
        hookGizmoDrag()
    })

    createEffect(() => {
        nodeTick()
        if (isPlaying()) return
        const s = scene()
        const gm = gizmoManager()
        if (!s || !gm) return
        const meshNodes = selectedNodes().filter(
            (n): n is Mesh => n instanceof Mesh
        )
        if (meshNodes.length < 2 || _multiPivotSession) return
        const pivot = ensureEditorGizmoPivot(s)
        const center = worldAabbCenterForMeshes(meshNodes)
        pivot.setAbsolutePosition(center)
        pivot.rotationQuaternion = null
        pivot.rotation = Vector3.Zero()
        pivot.scaling.copyFromFloats(1, 1, 1)
    })

    onMount(async () => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement
        const eng = new Engine(canvas, true)
        const initializedHavok = await getInitializedHavok()
        const physicsPlugin = new HavokPlugin(true, initializedHavok)
        _physicsPlugin = physicsPlugin

        let sceneInstance: Scene

        // Migrate scene data from localStorage (pre-IndexedDB) on first load
        const LS_SCENE_KEY = 'slop-engine-scene-v1'
        let savedJson = await getSceneJsonFromDB()
        if (typeof savedJson === 'string' && savedJson.trim() === '') {
            savedJson = null
        }
        if (!savedJson) {
            const lsJson = localStorage.getItem(LS_SCENE_KEY)
            if (lsJson && lsJson.trim() !== '') {
                savedJson = lsJson
                await saveSceneJsonToDB(lsJson)
                localStorage.removeItem(LS_SCENE_KEY)
            }
        }

        if (savedJson) {
            try {
                const result = await loadSceneFromJson(
                    eng,
                    savedJson,
                    physicsPlugin
                )
                sceneInstance = result.scene
                await rehydrateTextures(sceneInstance)
                await rehydrateImportedModels(sceneInstance)
            } catch {
                const result = createDefaultScene(eng, physicsPlugin)
                sceneInstance = result.scene
            }
        } else {
            const result = createDefaultScene(eng, physicsPlugin)
            sceneInstance = result.scene
        }

        setupEditorCamera(sceneInstance, canvas)
        ensureEditorGizmoPivot(sceneInstance)

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
                    (node) =>
                        node instanceof Mesh && !isSlopEditorHelper(node)
                )
                if (result.hit && result.pickedMesh) {
                    const mesh = result.pickedMesh as Mesh
                    if (e.ctrlKey || e.metaKey) {
                        toggleSelectedNode(mesh)
                    } else {
                        setSelectedNode(mesh)
                    }
                } else {
                    setSelectedNode(undefined)
                }
            }
            pointerDownPos = null
            hasDragged = false
        })

        setGizmoManager(gm)
        sceneInstance.onBeforeRenderObservable.add(() => {
            if (gizmoManager()?.isDragging || _multiPivotSession) {
                setNodeTick((t) => t + 1)
            }
        })
        sceneInstance.onAfterRenderObservable.add(() => {
            tickMultiPivotFromGizmo(sceneInstance)
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

    async function captureCheckpoint(): Promise<Checkpoint | null> {
        const s = scene()
        if (!s || isPlaying()) return null
        try {
            const sceneJson = serializeScene(s)
            const blobs = await getAllBlobs()
            const assetTree = structuredClone(getAssetStore().tree())
            return { sceneJson, blobs, assetTree }
        } catch {
            return null
        }
    }

    async function restoreCheckpoint(cp: Checkpoint): Promise<void> {
        const eng = engine()
        const s = scene()
        if (!eng || !s || !_physicsPlugin || isPlaying()) return

        // Restore blobs and asset tree
        await restoreAllBlobs(cp.blobs)
        getAssetStore().setTree(structuredClone(cp.assetTree))

        const canvas = document.getElementById('canvas') as HTMLCanvasElement

        // Load new scene from checkpoint JSON
        const { scene: newScene } = await loadSceneFromJson(
            eng,
            cp.sceneJson,
            _physicsPlugin
        )
        await rehydrateTextures(newScene)
        await rehydrateImportedModels(newScene)
        setupEditorCamera(newScene, canvas)
        ensureEditorGizmoPivot(newScene)

        // Create new gizmo manager for the new scene
        const utilityLayer = new UtilityLayerRenderer(newScene)
        const gm = new GizmoManager(newScene, undefined, utilityLayer)
        gm.positionGizmoEnabled = false
        gm.rotationGizmoEnabled = false
        gm.scaleGizmoEnabled = false
        gm.enableAutoPicking = false
        gm.boundingBoxGizmoEnabled = false

        // Attach auto-save observers to new scene
        newScene.onNewMeshAddedObservable.add(() => scheduleAutoSave())
        newScene.onMeshRemovedObservable.add(() => scheduleAutoSave())
        newScene.onNewLightAddedObservable.add(() => scheduleAutoSave())
        newScene.onLightRemovedObservable.add(() => scheduleAutoSave())
        newScene.onNewTransformNodeAddedObservable.add(() => scheduleAutoSave())
        newScene.onTransformNodeRemovedObservable.add(() => scheduleAutoSave())
        newScene.onBeforeRenderObservable.add(() => {
            if (gizmoManager()?.isDragging || _multiPivotSession) {
                setNodeTick((t) => t + 1)
            }
        })
        newScene.onAfterRenderObservable.add(() => {
            tickMultiPivotFromGizmo(newScene)
        })

        // Dispose old scene & gizmo manager
        const oldGm = gizmoManager()
        oldGm?.dispose()
        s.dispose()

        // Clear undo/redo stacks since scene is replaced
        _undoStack.length = 0
        _redoStack.length = 0
        setUndoRedoVersion((v) => v + 1)

        // Update all signals
        setSelectedNode(undefined)
        setGizmoManager(gm)
        setScene(newScene)
        setNodeTick((t) => t + 1)
        scheduleAutoSave()
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
        captureCheckpoint,
        restoreCheckpoint,
    }
}
