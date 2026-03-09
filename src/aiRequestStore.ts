import { createSignal } from 'solid-js'

const [fixErrorRequest, setFixErrorRequest] = createSignal<string | null>(null)

export function requestFixError(errorText: string) {
    setFixErrorRequest(errorText)
}

export function clearFixErrorRequest() {
    setFixErrorRequest(null)
}

export { fixErrorRequest }
