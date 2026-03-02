import { HavokPlugin } from 'babylonjs'

import {
    ResetConfirmModal,
    EditorTopbar,
    EditorLayout,
} from '../components/editor'
import {
    createDefaultScene,
    loadSceneFromJson,
    setupEditorCamera,
    downloadSceneBundle,
    importSceneBundle,
} from '../scene/EditorScene'
import { getInitializedHavok } from '../utils/editorUtils'
import { getAssetStore, clearAllBlobs } from '../assetStore'
import { clearAllSessions } from '../chatHistoryStore'
import { useEditorState } from '../hooks/useEditorState'
import { useEditorEngine } from '../hooks/useEditorEngine'

export default function Home() {
    const state = useEditorState()
    const engine = useEditorEngine(state)

    let bundleInputRef: HTMLInputElement | undefined

    const handleReset = async () => {
        const eng = state.engine()
        if (!eng) return
        const initializedHavok = await getInitializedHavok()
        const physicsPlugin = new HavokPlugin(true, initializedHavok)
        const { scene: newScene } = createDefaultScene(eng, physicsPlugin)
        setupEditorCamera(
            newScene,
            document.getElementById('canvas') as HTMLCanvasElement
        )
        await clearAllBlobs()
        await clearAllSessions()
        state.setScene(newScene)
        state.setSelectedNode(undefined)
        state.setSceneJson(null)
        state.setLastSaved(null)
        state.setIsDirty(false)
    }

    const handleBundleImport = async (e: Event) => {
        const file = (e.currentTarget as HTMLInputElement).files?.[0]
        if (!file) return
        const eng = state.engine()
        if (!eng) return
        try {
            const { sceneJson: bundleJson, assetTree } =
                await importSceneBundle(file)
            const initializedHavok = await getInitializedHavok()
            const physicsPlugin = new HavokPlugin(true, initializedHavok)
            const { scene: newScene } = await loadSceneFromJson(
                eng,
                bundleJson,
                physicsPlugin
            )
            setupEditorCamera(
                newScene,
                document.getElementById('canvas') as HTMLCanvasElement
            )
            getAssetStore().setTree(assetTree)
            state.setScene(newScene)
            state.setSelectedNode(undefined)
            state.setSceneJson(bundleJson)
            state.setLastSaved(new Date())
            state.setIsDirty(false)
        } catch (err) {
            console.error('Failed to import bundle:', err)
        }
        ;(e.currentTarget as HTMLInputElement).value = ''
    }

    return (
        <section class="bg-gray-900 text-gray-100 size-full p-2 flex flex-col">
            <ResetConfirmModal
                open={state.showResetConfirm()}
                onClose={() => state.setShowResetConfirm(false)}
                onConfirm={handleReset}
            />
            <input
                ref={(el) => {
                    bundleInputRef = el
                }}
                type="file"
                accept=".slop"
                class="hidden"
                onChange={handleBundleImport}
            />
            <EditorTopbar
                isPlaying={state.isPlaying}
                onPlayStop={engine.handlePlayStop}
                onResetClick={() => {
                    if (state.isPlaying()) return
                    state.setShowResetConfirm(true)
                }}
                onDownload={() => {
                    const s = state.scene()
                    if (s) downloadSceneBundle(s)
                }}
                onImportClick={() => bundleInputRef?.click()}
                isVibeMode={state.isVibeMode}
                onVibeModeToggle={() => state.setIsVibeMode((v) => !v)}
                isDirty={state.isDirty}
                lastSaved={state.lastSaved}
                selectedGizmo={state.selectedGizmo}
                onGizmoSelect={engine.setSelectedGizmo}
            />
            <EditorLayout
                state={state}
                scheduleAutoSave={engine.scheduleAutoSave}
                handlePlayStop={engine.handlePlayStop}
                onEngineResize={() => state.engine()?.resize()}
            />
        </section>
    )
}
