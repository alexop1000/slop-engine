import { onMount, onCleanup } from 'solid-js'
import * as monaco from 'monaco-editor'

export default function ScriptPanel() {
    let container: HTMLDivElement | undefined

    let editor: monaco.editor.IStandaloneCodeEditor | null = null
    onMount(() => {
        if (!container) return
        editor = monaco.editor.create(container, {
            value: '// Script editor\n',
            language: 'typescript',
            theme: 'vs-dark',
            automaticLayout: true,
            'semanticHighlighting.enabled': true,
            minimap: { enabled: false },
        })
    })
    onCleanup(() => editor?.dispose())

    return (
        <div class="flex flex-col h-full">
            <div
                ref={container}
                class="flex-1 min-h-0 rounded border border-gray-700"
            />
        </div>
    )
}
