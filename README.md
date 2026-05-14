# Slop Engine

A web-based 3D scene editor built with **Solid.js**, **BabylonJS**, and **Havok Physics**. Create, manipulate, and simulate 3D scenes directly in the browser.

## Features

- **3D Viewport** with gizmo-based object manipulation (translate, rotate, scale)
- **Scene Hierarchy** panel with drag-and-drop reparenting
- **Properties Inspector** for editing mesh, light, and camera properties
- **Physics Simulation** powered by Havok WASM with play/pause controls
- **AI Assistant** panel with configurable providers (Azure OpenAI, OpenRouter, Google Gemini)
- **Script Editor** with Monaco-based code editing
- **Asset Management** panel
- **Console** panel for runtime output
- **Resizable Panel Layout** with persistent sizing via localStorage
- **Dark Mode** UI with Tailwind CSS

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (package manager and runtime)

### Installation

```bash
bun install
```

### Development

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
bun run build
bun run serve   # Preview the production build
```

## AI Provider Setup

The AI panel supports multiple providers with per-agent model selection. You can enter API keys directly in the browser (stored in localStorage) or set them as environment variables:

- `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_RESOURCE_NAME` / `AZURE_OPENAI_DEPLOYMENT`
- `OPENROUTER_API_KEY`
- `GOOGLE_API_KEY` (Gemini via Google AI Studio)

## Tech Stack

- [Solid.js](https://solidjs.com/) - Reactive UI framework
- [BabylonJS](https://www.babylonjs.com/) - 3D rendering engine
- [Havok Physics](https://www.havok.com/) - Physics simulation
- [Vite](https://vitejs.dev/) - Build tooling
- [Tailwind CSS 4](https://tailwindcss.com/) - Styling
- [corvu](https://corvu.dev/) - Resizable panel primitives
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editing
- [Vercel AI SDK](https://sdk.vercel.ai/) - AI provider integrations

## License

MIT

Copyright 2026 alexop1000 & MrBStones

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
