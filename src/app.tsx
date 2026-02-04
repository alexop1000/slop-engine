import { Suspense, type Component } from 'solid-js'
import { A, useLocation } from '@solidjs/router'

const App: Component<{ children: Element }> = (props) => {
    return (
        <main class="h-screen bg-gray-900 dark">
            <Suspense>{props.children}</Suspense>
        </main>
    )
}

export default App
