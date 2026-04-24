import { Mesh } from 'babylonjs'
import { createEffect, onMount } from 'solid-js'
import {
    ResetConfirmModal,
    EditorTopbar,
    EditorLayout,
} from '../components/editor'
import { downloadSceneBundle, importSceneBundle } from '../scene/EditorScene'
import { getAssetStore, clearAllBlobs, clearSceneJsonFromDB, saveSceneJsonToDB } from '../assetStore'
import { clearAllSessions } from '../chatHistoryStore'
import { useEditorState } from '../hooks/useEditorState'
import { useEditorEngine } from '../hooks/useEditorEngine'
import {
    reportHarnessRuntimeError,
    setHarnessRunId,
    setPendingInitialPrompt,
} from '../harnessClient'
import { logs } from '../scripting/consoleStore'

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

export default function Home() {
    const state = useEditorState()
    const engine = useEditorEngine(state)

    let bundleInputRef: HTMLInputElement | undefined

    onMount(async () => {
        const params = new URLSearchParams(globalThis.location.search)
        const harnessRunId = params.get('harnessRunId')
        if (!harnessRunId) return
        setHarnessRunId(harnessRunId)
        try {
            const res = await fetch(
                `/api/harness/runs/${encodeURIComponent(harnessRunId)}/meta`
            )
            if (!res.ok) throw new Error(`fetch meta ${res.status}`)
            const meta = (await res.json()) as { initialPrompt: string }
            setPendingInitialPrompt(meta.initialPrompt)
        } catch (e) {
            console.error('[harness] init failed', e)
        }

        // Forward script-runtime errors to the harness. We snapshot the count
        // at subscribe time so prior logs (from a previous run, restored via
        // HMR) aren't replayed.
        let lastSeen = logs().length
        createEffect(() => {
            const all = logs()
            for (let i = lastSeen; i < all.length; i++) {
                const entry = all[i]
                if (entry.level !== 'error') continue
                const message = entry.args
                    .map((a) =>
                        typeof a === 'string' ? a : safeStringify(a)
                    )
                    .join(' ')
                reportHarnessRuntimeError(message)
            }
            lastSeen = all.length
        })
    })

    const handleReset = async () => {
        await clearAllBlobs()
        await clearSceneJsonFromDB()
        localStorage.removeItem('slop-engine-scene-v1')
        await clearAllSessions()
        getAssetStore().setTree({
            id: '__root__',
            name: 'Assets',
            type: 'folder',
            path: '',
            children: [],
        })
        state.setSceneJson(null)
        globalThis.location.reload()
    }

    const handleBundleImport = async (e: Event) => {
        const input = e.currentTarget as HTMLInputElement
        const file = input.files?.[0]
        if (!file) return
        try {
            const { sceneJson: bundleJson, assetTree } =
                await importSceneBundle(file)
            getAssetStore().setTree(assetTree)
            await saveSceneJsonToDB(bundleJson)
            globalThis.location.reload()
        } catch (err) {
            console.error('Failed to import bundle:', err)
        }
        input.value = ''
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
                boundingBoxGizmoDisabled={() =>
                    state.selectedNodes().filter((n) => n instanceof Mesh)
                        .length > 1
                }
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
                canUndo={engine.canUndo}
                canRedo={engine.canRedo}
                onUndo={() => void engine.undo()}
                onRedo={() => void engine.redo()}
            />
            <EditorLayout
                state={state}
                scheduleAutoSave={engine.scheduleAutoSave}
                handlePlayStop={engine.handlePlayStop}
                onEngineResize={() => state.engine()?.resize()}
                pushUndoState={engine.pushUndoState}
                captureCheckpoint={engine.captureCheckpoint}
                restoreCheckpoint={engine.restoreCheckpoint}
            />
        </section>
    )
}
