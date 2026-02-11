import { onMount, onCleanup, createEffect, on, Show } from 'solid-js'
import * as monaco from 'monaco-editor'
import {
    openScript,
    saveScriptFile,
    closeScriptFile,
} from '../../scriptEditorStore'
import apiTypes from '../../scripting/api.d.ts?raw'

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
        addExtraLib(content: string, filePath?: string): void
    }
    ScriptTarget: Record<string, number>
    ModuleKind: Record<string, number>
    ModuleResolutionKind: Record<string, number>
}

/** Configure Monaco's TypeScript defaults for script editing. */
let _tsDefaultsConfigured = false
function configureMonacoDefaults() {
    if (_tsDefaultsConfigured) return
    _tsDefaultsConfigured = true

    const tsDefaults = monacoTs.typescriptDefaults

    tsDefaults.setCompilerOptions({
        target: monacoTs.ScriptTarget.ESNext,
        module: monacoTs.ModuleKind.ESNext,
        moduleResolution: monacoTs.ModuleResolutionKind.NodeJs,
        allowNonTsExtensions: true,
        strict: true,
        noEmit: true,
        // Prevent default lib from polluting the script environment
        // with DOM types, Node types, etc.
        noLib: true,
        // Still include basic ES types
        lib: ['esnext'],
    })

    // Register our curated API type definitions so scripts get
    // autocomplete and type checking for Script, Vector3, etc.
    tsDefaults.addExtraLib(apiTypes, 'slop-engine://api.d.ts')
}

export default function ScriptPanel() {
    let container: HTMLDivElement | undefined
    let editor: monaco.editor.IStandaloneCodeEditor | null = null
    let saveTimeout: ReturnType<typeof setTimeout> | undefined

    onMount(() => {
        if (!container) return

        configureMonacoDefaults()

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
            }, 500)
        })
    })

    onCleanup(() => {
        clearTimeout(saveTimeout)
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
                <div class="flex items-center justify-between px-2 py-1 bg-gray-800 border-b border-gray-700 text-xs text-gray-300">
                    <span class="truncate">{openScript()!.path}</span>
                    <button
                        type="button"
                        class="text-gray-500 hover:text-gray-200 ml-2"
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
