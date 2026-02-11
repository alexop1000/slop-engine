import { createSignal } from 'solid-js'
import { getBlob, setBlob } from './assetStore'

export interface OpenScript {
    /** Asset path of the file (e.g. "scripts/main.ts"). */
    path: string
    /** Text content loaded from IndexedDB. */
    content: string
}

const [openScript, setOpenScript] = createSignal<OpenScript | null>(null)

type OpenCallback = (path: string) => void
const openCallbacks: OpenCallback[] = []

/** Register a callback invoked whenever a script file is opened. */
export function onScriptOpen(cb: OpenCallback): () => void {
    openCallbacks.push(cb)
    return () => {
        const idx = openCallbacks.indexOf(cb)
        if (idx >= 0) openCallbacks.splice(idx, 1)
    }
}

/** Open a script asset by path – reads its blob from IndexedDB. */
export async function openScriptFile(path: string): Promise<void> {
    const blob = await getBlob(path)
    const content = blob ? await blob.text() : ''
    setOpenScript({ path, content })
    for (const cb of openCallbacks) cb(path)
}

/** Save the current editor content back to IndexedDB. */
export async function saveScriptFile(
    path: string,
    content: string
): Promise<void> {
    await setBlob(path, new Blob([content], { type: 'text/plain' }))
}

/** Close the currently open script. */
export function closeScriptFile(): void {
    setOpenScript(null)
}

export { openScript }
