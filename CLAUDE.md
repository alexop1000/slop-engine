# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Slop Engine is a web-based 3D scene editor built with **Solid.js**, **BabylonJS**, and **Havok Physics**. It features a resizable panel layout with a 3D viewport, scene hierarchy tree, property inspector, and gizmo-based object manipulation.

## Commands

```bash
bun run dev      # Start dev server on http://localhost:3000
bun run build    # Production build
bun run serve    # Preview production build
```

Package manager: project uses `bun`.

## Code Style

-   **Prettier**: 4-space indentation, no semicolons, single quotes, trailing commas (es5)
-   **TypeScript**: Strict mode, JSX preserved for Solid.js (`jsxImportSource: "solid-js"`)
-   No linter or test runner configured

## Architecture

### Entry Flow

`index.html` -> `src/index.tsx` (Router + App mount) -> `src/routes.ts` -> `src/pages/home.tsx` (main editor)

### Core Page: `src/pages/home.tsx`

This is the main file containing all 3D engine setup, physics initialization, gizmo management, play/pause state, and the panel layout. BabylonJS engine and scene are created in `onMount` and rendered to a `<canvas id="canvas">`.

Key state signals:

-   `scene` / `selectedNode` / `isPlaying` - core editor state
-   `sizes` / `sceneSizes` / `propSizes` - panel sizes persisted to localStorage via `makePersisted()`
-   `nodeTick` - incremented during gizmo drags to force property panel re-renders

### Panel Layout (`corvu/resizable`)

```
+--------+---------------------------+------------+
| AI     | Viewport     | Console   | Properties |
| Panel  |              |           | Panel      |
|        +--------------+           |            |
|        | Scene Panel  |           |            |
+--------+--------------+-----------+------------+
```

Panels are nested `Resizable` components from corvu. Sizes persist to localStorage.

### Component Organization

-   `src/components/panels/` - Editor panels (ViewportPanel, ScenePanel, PropertiesPanel, AIPanel, ConsolePanel)
-   `src/components/ui/` - Reusable UI components (Button, Input, Vector3Input, Color3Input, TreeView, Collapsible, etc.)
-   `src/components/Handle.tsx` - Resizable panel divider
-   `src/components/Panel.tsx` - Panel wrapper

### Key Patterns

**Solid.js reactivity**: Use `createSignal`, `splitProps`, `<Show>`, `<Switch>`/`<Match>`, `<For>`. No virtual DOM - mutations are fine-grained.

**BabylonJS types via globals**: TypeScript types come from `"types": ["babylonjs"]` in tsconfig (global namespace, not ES module imports for types).

**Property editing**: PropertiesPanel uses `<Switch>`/`<Match>` to dispatch on node type (Mesh, Light, Camera). Property mutations apply directly to BabylonJS objects.

**Scene tree**: ScenePanel builds a `TreeNode<Node>[]` tree from BabylonJS scene hierarchy. TreeView component supports drag-drop reparenting with ancestor validation.

**Physics**: Havok WASM is excluded from Vite's `optimizeDeps` and loaded async. Physics aggregates are created when play is pressed, not at scene init.

### Styling

Tailwind CSS 4 with dark mode (`dark:` prefix). All UI components support dark theme.
