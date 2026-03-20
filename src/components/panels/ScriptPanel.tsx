import { onMount, onCleanup, createEffect, on, Show } from 'solid-js'
import * as monaco from 'monaco-editor'
import {
    openScript,
    saveScriptFile,
    closeScriptFile,
} from '../../scriptEditorStore'
import apiTypes from '../../scripting/api.d.ts?raw'
import { getAssetStore } from '../../assetStore'
import { getBlob } from '../../assetStore'
import { generateScriptRegistry } from '../../scripting/scriptRegistry'
import type { ScriptSource } from '../../scripting/scriptRegistry'

/** Map file extensions to Monaco language ids. */
function extToLanguage(path: string): string {
    if (path.endsWith('.tsx')) return 'typescript'
    if (path.endsWith('.ts')) return 'typescript'
    if (path.endsWith('.jsx')) return 'javascript'
    if (path.endsWith('.js')) return 'javascript'
    return 'plaintext'
}

/**
 * Monaco's `monaco.languages.typescript` is typed as deprecated but
 * still functional at runtime. We access it via an untyped alias.
 */
const monacoTs = (monaco.languages as any).typescript as {
    typescriptDefaults: {
        setCompilerOptions(options: Record<string, unknown>): void
        addExtraLib(content: string, filePath?: string): { dispose(): void }
    }
    ScriptTarget: Record<string, number>
    ModuleKind: Record<string, number>
    ModuleResolutionKind: Record<string, number>
}

/** Collect all .ts script sources from the asset store. */
async function collectScriptSources(): Promise<ScriptSource[]> {
    const store = getAssetStore()
    const allPaths = store.collectFilePaths(store.tree())
    const tsPaths = allPaths.filter((p) => p.endsWith('.ts'))
    const sources: ScriptSource[] = []
    for (const path of tsPaths) {
        const blob = await getBlob(path)
        if (!blob) continue
        sources.push({ path, source: await blob.text() })
    }
    return sources
}

let _registryLibDisposable: { dispose(): void } | null = null

/** Regenerate the ScriptRegistry type declaration and feed it to Monaco. */
async function regenerateRegistry() {
    const scripts = await collectScriptSources()
    const decl = generateScriptRegistry(scripts)
    _registryLibDisposable?.dispose()
    if (decl) {
        _registryLibDisposable = monacoTs.typescriptDefaults.addExtraLib(
            decl,
            'slop-engine://script-registry.d.ts'
        )
    } else {
        _registryLibDisposable = null
    }
}

/** Configure Monaco's TypeScript defaults for script editing. */
let _tsDefaultsConfigured = false
let _apiLibDisposable: { dispose(): void } | null = null
function configureMonacoDefaults() {
    const tsDefaults = monacoTs.typescriptDefaults

    if (!_tsDefaultsConfigured) {
        _tsDefaultsConfigured = true
        tsDefaults.setCompilerOptions({
            target: monacoTs.ScriptTarget.ESNext,
            module: monacoTs.ModuleKind.ESNext,
            moduleResolution: monacoTs.ModuleResolutionKind.NodeJs,
            allowNonTsExtensions: true,
            strict: true,
            noEmit: true,
            // Keep the standard ES lib so utility types like Record,
            // Array, Promise, etc. resolve correctly inside scripts.
            // Restrict lib selection to ES only so browser DOM globals
            // do not leak into the gameplay scripting environment.
            noLib: false,
            lib: ['esnext'],
        })
    }

    _apiLibDisposable?.dispose()

    // Register our curated API type definitions so scripts get
    // autocomplete and type checking for Script, Vector3, etc.
    _apiLibDisposable = tsDefaults.addExtraLib(
        apiTypes,
        'slop-engine://api.d.ts'
    )
}

interface ScriptPanelProps {
    readonly onBackToViewport?: () => void
}

export default function ScriptPanel(props: Readonly<ScriptPanelProps>) {
    let container: HTMLDivElement | undefined
    let editor: monaco.editor.IStandaloneCodeEditor | null = null
    let saveTimeout: ReturnType<typeof setTimeout> | undefined

    onMount(() => {
        if (!container) return

        configureMonacoDefaults()
        void regenerateRegistry()

        editor = monaco.editor.create(container, {
            value: '',
            language: 'typescript',
            theme: 'vs-dark',
            automaticLayout: true,
            'semanticHighlighting.enabled': true,
            minimap: { enabled: false },
            readOnly: true,
        })

        // Auto-save on content change (debounced)
        editor.onDidChangeModelContent(() => {
            const script = openScript()
            if (!script || !editor) return
            clearTimeout(saveTimeout)
            saveTimeout = setTimeout(() => {
                saveScriptFile(script.path, editor!.getValue())
                void regenerateRegistry()
            }, 500)
        })
    })

    onCleanup(() => {
        clearTimeout(saveTimeout)
        _apiLibDisposable?.dispose()
        _apiLibDisposable = null
        _registryLibDisposable?.dispose()
        _registryLibDisposable = null
        _tsDefaultsConfigured = false
        editor?.dispose()
    })

    let currentPath: string | null = null

    // React to external file open/close
    createEffect(
        on(openScript, (script) => {
            if (!editor) return
            if (script) {
                // Only reload content when a different file is opened
                if (script.path !== currentPath) {
                    currentPath = script.path
                    const lang = extToLanguage(script.path)
                    const model = editor.getModel()
                    if (model) {
                        monaco.editor.setModelLanguage(model, lang)
                    }
                    editor.setValue(script.content)
                    editor.updateOptions({ readOnly: false })
                }
            } else {
                currentPath = null
                editor.setValue('')
                editor.updateOptions({ readOnly: true })
            }
        })
    )

    return (
        <div class="flex flex-col h-full">
            <Show when={openScript()}>
                <div class="flex items-center justify-between gap-2 px-2 py-1 bg-gray-800 border-b border-gray-700 text-xs text-gray-300">
                    <Show when={props.onBackToViewport}>
                        <button
                            type="button"
                            class="shrink-0 text-blue-400 hover:text-blue-300"
                            onClick={() => props.onBackToViewport?.()}
                            title="Back to viewport"
                        >
                            ← Viewport
                        </button>
                    </Show>
                    <span class="truncate flex-1 min-w-0">
                        {openScript()!.path}
                    </span>
                    <button
                        type="button"
                        class="text-gray-500 hover:text-gray-200 shrink-0"
                        onClick={closeScriptFile}
                        title="Close file"
                    >
                        ✕
                    </button>
                </div>
            </Show>
            <Show when={!openScript()}>
                <div class="flex items-center justify-center h-full text-sm text-gray-500">
                    Double-click a script file in Assets to open it
                </div>
            </Show>
            <div
                ref={container}
                class="flex-1 min-h-0 rounded border border-gray-700"
                style={{ display: openScript() ? 'block' : 'none' }}
            />
        </div>
    )
}
