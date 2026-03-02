import {
    createSignal,
    createMemo,
    type Accessor,
    type Setter,
} from 'solid-js'
import type { Scene, Node, Engine, GizmoManager } from 'babylonjs'
import { makePersisted } from '@solid-primitives/storage'
import { getAssetStore } from '../assetStore'
import { collectScriptPaths } from '../utils/editorUtils'
import { onScriptOpen } from '../scriptEditorStore'

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
    selectedNode: Accessor<Node | undefined>
    setSelectedNode: Setter<Node | undefined>
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
    viewportTab: Accessor<string | undefined>
    setViewportTab: Setter<string | undefined>
    scriptAssets: Accessor<string[]>
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
            return [ai, center, 0]
        }
        return sizes()
    })

    const centerVerticalSizes = createMemo(() => {
        if (isVibeMode()) return [1, 0]
        return sceneSizes()
    })

    const [sceneJson, setSceneJson] = makePersisted(
        createSignal<string | null>(null),
        { name: 'slop-engine-scene-v1' }
    )

    const [isPlaying, setIsPlaying] = createSignal(false)
    const [scene, setScene] = createSignal<Scene>()
    const [selectedNode, setSelectedNode] = createSignal<Node>()
    const [engine, setEngine] = createSignal<Engine>()
    const [nodeTick, setNodeTick] = createSignal(0)

    const [gizmoManager, setGizmoManager] = createSignal<GizmoManager>()
    const [selectedGizmo, setSelectedGizmo] = createSignal<GizmoType>('position')

    const [isDirty, setIsDirty] = createSignal(false)
    const [lastSaved, setLastSaved] = createSignal<Date | null>(null)
    const [showResetConfirm, setShowResetConfirm] = createSignal(false)

    const [viewportTab, setViewportTab] = createSignal<string | undefined>(
        undefined
    )
    onScriptOpen(() => setViewportTab('script'))

    const assetStore = getAssetStore()
    const scriptAssets = createMemo(() => collectScriptPaths(assetStore.tree()))

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
        selectedNode,
        setSelectedNode,
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
        viewportTab,
        setViewportTab,
        scriptAssets,
    }
}
