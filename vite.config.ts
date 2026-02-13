import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import devtools from 'solid-devtools/vite'
import { chatApiPlugin } from './src/server/chat-plugin'

export default defineConfig({
    plugins: [devtools(), solidPlugin(), chatApiPlugin()],
    server: {
        port: 3000,
    },
    build: {
        target: 'esnext',
    },
    optimizeDeps: {
        exclude: ['@babylonjs/havok', 'monaco-editor'],
    },
    assetsInclude: ['**/*.wasm'],
})
