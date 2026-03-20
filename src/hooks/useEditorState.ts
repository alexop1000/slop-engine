import {
    createSignal,
    createMemo,
    createEffect,
    on,
    type Accessor,
    type Setter,
} from 'solid-js'
import type { Scene, Node, Engine, GizmoManager } from 'babylonjs'
import { makePersisted } from '@solid-primitives/storage'
import { getAssetStore } from '../assetStore'
import { collectScriptPaths, collectImagePaths } from '../utils/editorUtils'
import { onScriptOpen, openScript } from '../scriptEditorStore'

export type GizmoType = 'position' | 'rotation' | 'scale' | 'boundingBox'

export interface EditorState {
    sizes: Accessor<number[]>
    setSizes: Setter<number[]>
    sceneSizes: Accessor<number[]>
    setSceneSizes: Setter<number[]>
    propertiesSizes: Accessor<number[]>
    setPropertiesSizes: Setter<number[]>
    vibeModeSizes: Accessor<number[]>
    setVibeModeSizes: Setter<number[]>
    isVibeMode: Accessor<boolean>
    setIsVibeMode: Setter<boolean>
    mainSizes: Accessor<number[]>
    centerVerticalSizes: Accessor<number[]>
    sceneJson: Accessor<string | null>
    setSceneJson: Setter<string | null>
    isPlaying: Accessor<boolean>
    setIsPlaying: Setter<boolean>
    scene: Accessor<Scene | undefined>
    setScene: Setter<Scene | undefined>
    selectedNodes: Accessor<Node[]>
    setSelectedNodes: Setter<Node[]>
    selectedNode: Accessor<Node | undefined>
    setSelectedNode: (node: Node | undefined) => void
    toggleSelectedNode: (node: Node) => void
    removeNodeFromSelection: (node: Node) => void
    engine: Accessor<Engine | undefined>
    setEngine: Setter<Engine | undefined>
    nodeTick: Accessor<number>
    setNodeTick: Setter<number>
    gizmoManager: Accessor<GizmoManager | undefined>
    setGizmoManager: Setter<GizmoManager | undefined>
    selectedGizmo: Accessor<GizmoType>
    setSelectedGizmo: Setter<GizmoType>
    isDirty: Accessor<boolean>
    setIsDirty: Setter<boolean>
    lastSaved: Accessor<Date | null>
    setLastSaved: Setter<Date | null>
    showResetConfirm: Accessor<boolean>
    setShowResetConfirm: Setter<boolean>
    centerWorkspace: Accessor<'viewport' | 'script'>
    setCenterWorkspace: Setter<'viewport' | 'script'>
    scriptAssets: Accessor<string[]>
    imageAssets: Accessor<string[]>
}

export function useEditorState(): EditorState {
    const [sizes, setSizes] = makePersisted(createSignal<number[]>([]), {
        name: 'resizable-sizes-v1',
    })
    const [sceneSizes, setSceneSizes] = makePersisted(
        createSignal<number[]>([]),
        { name: 'scene-resizable-sizes-v1' }
    )
    const [propertiesSizes, setPropertiesSizes] = makePersisted(
        createSignal<number[]>([]),
        { name: 'properties-resizable-sizes-v1' }
    )
    const [vibeModeSizes, setVibeModeSizes] = makePersisted(
        createSignal<number[]>([]),
        { name: 'vibe-mode-sizes-v1' }
    )
    const [isVibeMode, setIsVibeMode] = createSignal(false)

    const mainSizes = createMemo(() => {
        if (isVibeMode()) {
            const v = vibeModeSizes()
            const ai = v[0] ?? 0.35
            const center = v[1] ?? 0.65
            return [ai, center]
        }
        return sizes()
    })

    const centerVerticalSizes = createMemo(() => {
        if (isVibeMode()) return [1]
        return sceneSizes()
    })

    const [sceneJson, setSceneJson] = makePersisted(
        createSignal<string | null>(null),
        { name: 'slop-engine-scene-v1' }
    )

    const [isPlaying, setIsPlaying] = createSignal(false)
    const [scene, setScene] = createSignal<Scene>()
    const [selectedNodes, setSelectedNodes] = createSignal<Node[]>([])
    const selectedNode = createMemo(() => selectedNodes().at(-1))

    const setSelectedNode = (node: Node | undefined) => {
        setSelectedNodes(node ? [node] : [])
    }

    const toggleSelectedNode = (node: Node) => {
        setSelectedNodes((prev) => {
            const i = prev.findIndex((n) => n.uniqueId === node.uniqueId)
            if (i >= 0) return prev.filter((_, j) => j !== i)
            return [...prev, node]
        })
    }

    const removeNodeFromSelection = (node: Node) => {
        setSelectedNodes((prev) =>
            prev.filter((n) => n.uniqueId !== node.uniqueId)
        )
    }
    const [engine, setEngine] = createSignal<Engine>()
    const [nodeTick, setNodeTick] = createSignal(0)

    const [gizmoManager, setGizmoManager] = createSignal<GizmoManager>()
    const [selectedGizmo, setSelectedGizmo] =
        createSignal<GizmoType>('position')

    const [isDirty, setIsDirty] = createSignal(false)
    const [lastSaved, setLastSaved] = createSignal<Date | null>(null)
    const [showResetConfirm, setShowResetConfirm] = createSignal(false)

    const [centerWorkspace, setCenterWorkspace] = createSignal<
        'viewport' | 'script'
    >('viewport')
    onScriptOpen((_path, options) => {
        if (options?.revealInCenter) setCenterWorkspace('script')
    })

    createEffect(
        on(openScript, (s) => {
            if (!s) setCenterWorkspace('viewport')
        })
    )

    const assetStore = getAssetStore()
    const scriptAssets = createMemo(() => collectScriptPaths(assetStore.tree()))
    const imageAssets = createMemo(() => collectImagePaths(assetStore.tree()))

    return {
        sizes,
        setSizes,
        sceneSizes,
        setSceneSizes,
        propertiesSizes,
        setPropertiesSizes,
        vibeModeSizes,
        setVibeModeSizes,
        isVibeMode,
        setIsVibeMode,
        mainSizes,
        centerVerticalSizes,
        sceneJson,
        setSceneJson,
        isPlaying,
        setIsPlaying,
        scene,
        setScene,
        selectedNodes,
        setSelectedNodes,
        selectedNode,
        setSelectedNode,
        toggleSelectedNode,
        removeNodeFromSelection,
        engine,
        setEngine,
        nodeTick,
        setNodeTick,
        gizmoManager,
        setGizmoManager,
        selectedGizmo,
        setSelectedGizmo,
        isDirty,
        setIsDirty,
        lastSaved,
        setLastSaved,
        showResetConfirm,
        setShowResetConfirm,
        centerWorkspace,
        setCenterWorkspace,
        scriptAssets,
        imageAssets,
    }
}
