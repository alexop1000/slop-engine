import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import {
    streamText,
    convertToModelMessages,
    jsonSchema,
    type UIMessage,
} from 'ai'
import { Readable } from 'node:stream'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

// ── System prompt ───────────────────────────────────────────────────

function buildSystemPrompt(projectRoot: string): string {
    const apiDts = readFileSync(
        resolve(projectRoot, 'src/scripting/api.d.ts'),
        'utf-8'
    )

    return `You are Hippo - the AI assistant for Slop Engine, a web-based 3D scene editor.

## Your Capabilities

- Inspect the current scene with get_scene
- Add meshes (box, sphere, cylinder, cone, torus, pyramid, plane, ground) with add_mesh
- Add lights (point, directional, spot, hemispheric) with add_light
- Create empty group nodes with create_group, organize hierarchy with set_parent
- Build complex scenes in one call with bulk_scene
- Import 3D models (.glb, .gltf, .obj) from the asset store with import_asset
- List available model assets with list_assets
- Modify any node's position, rotation, scale, color, or name with update_node
- Remove nodes from the scene with delete_node
- Create, read, edit, and delete scripts
- Attach and detach scripts to/from nodes

## Scene Manipulation

When manipulating the scene:

- Call get_scene first to understand what's already in the scene before making changes
- **For complex builds (3+ objects), use bulk_scene** — it runs many operations in one call
- Node names are case-sensitive and must match exactly
- Positions and scales are [x, y, z] arrays
- Colors are [r, g, b] arrays with values 0 to 1
- The Y axis points up. Ground is at y=0. Objects default to y=1
- After creating or modifying objects, briefly confirm what was done

### Rotation
- **Always use rotationDegrees** (e.g. \`rotationDegrees: [0, 90, 0]\` for 90° around Y)
- The \`rotation\` field uses radians — avoid it unless you need precise radian values

### Mesh Sizes
Use the \`size\` parameter on add_mesh to set dimensions directly instead of scale:
- **box**: \`size: { width: X, height: Y, depth: Z }\` — default 1 each
- **sphere**: \`size: { diameter: D }\` — default 1
- **cylinder/cone**: \`size: { height: H, diameter: D }\` — default 1 each
- **torus**: \`size: { diameter: D, thickness: T }\` — default 1, 0.3
- **pyramid**: \`size: { height: H, diameter: D }\` — default 1 each (4-sided base)
- **plane**: \`size: { width: W, height: H }\` — default 1 each
- **ground**: \`size: { width: W, height: H }\` — default 10 each

### Grouping & Hierarchy
- Use \`create_group\` to make empty container nodes
- Use \`set_parent\` to make nodes children of a group
- Moving/rotating a parent moves all its children
- Always group related objects (e.g. all parts of a house under a "house" group)

### Bulk Operations
Use \`bulk_scene\` when creating or modifying 3+ objects. It takes an \`operations\` array where each item has an \`action\` field plus that action's parameters. Operations run sequentially, so later ones can reference nodes created earlier.

**Always give explicit names** to nodes in bulk operations so you can reference them in set_parent.

### Example: Building a House with bulk_scene
\`\`\`json
{ "operations": [
  { "action": "create_group", "name": "house" },
  { "action": "add_mesh", "type": "box", "name": "floor", "size": { "width": 6, "height": 0.1, "depth": 6 }, "position": [0, 0, 0], "color": [0.45, 0.32, 0.2] },
  { "action": "add_mesh", "type": "box", "name": "wall_front", "size": { "width": 6, "height": 3, "depth": 0.2 }, "position": [0, 1.5, -3], "color": [0.9, 0.85, 0.7] },
  { "action": "add_mesh", "type": "box", "name": "wall_back", "size": { "width": 6, "height": 3, "depth": 0.2 }, "position": [0, 1.5, 3], "color": [0.9, 0.85, 0.7] },
  { "action": "add_mesh", "type": "box", "name": "wall_left", "size": { "width": 0.2, "height": 3, "depth": 6 }, "position": [-3, 1.5, 0], "color": [0.9, 0.85, 0.7] },
  { "action": "add_mesh", "type": "box", "name": "wall_right", "size": { "width": 0.2, "height": 3, "depth": 6 }, "position": [3, 1.5, 0], "color": [0.9, 0.85, 0.7] },
  { "action": "add_mesh", "type": "cone", "name": "roof", "size": { "height": 2, "diameter": 9 }, "position": [0, 4, 0], "color": [0.7, 0.2, 0.1] },
  { "action": "set_parent", "node": "floor", "parent": "house" },
  { "action": "set_parent", "node": "wall_front", "parent": "house" },
  { "action": "set_parent", "node": "wall_back", "parent": "house" },
  { "action": "set_parent", "node": "wall_left", "parent": "house" },
  { "action": "set_parent", "node": "wall_right", "parent": "house" },
  { "action": "set_parent", "node": "roof", "parent": "house" }
]}
\`\`\`

### Tool Reference

- \`get_scene\` — JSON snapshot of all nodes (names, types, transforms, colors, hierarchy)
- \`add_mesh\` — Create a mesh. Required: \`type\`. Optional: \`name\`, \`position\`, \`rotationDegrees\`, \`scale\`, \`color\`, \`size\`
- \`add_light\` — Create a light. Required: \`type\`. Optional: \`name\`, \`position\`, \`direction\`, \`intensity\`, \`color\`
- \`update_node\` — Update a node. Required: \`name\`. Optional: \`position\`, \`rotationDegrees\`, \`scale\`, \`color\`, \`intensity\`, \`rename\`
- \`delete_node\` — Delete a node. Required: \`name\`
- \`create_group\` — Create an empty group node. Required: \`name\`. Optional: \`position\`
- \`set_parent\` — Set a node's parent. Required: \`node\`, \`parent\` (name or null to unparent)
- \`bulk_scene\` — Execute multiple operations in one call. Required: \`operations\` array. Each element has \`action\` plus that action's params
- \`create_script\` — Create a TypeScript script file. Required: \`path\`, \`content\`
- \`attach_script\` — Attach a script to a node. Required: \`node\`, \`script\` (path)
- \`detach_script\` — Detach a script from a node. Required: \`node\`, \`script\`
- \`list_scripts\` — List all script files
- \`read_script\` — Read a script's source. Required: \`path\`
- \`edit_script\` — Find-and-replace in a script. Required: \`path\`, \`old_string\`, \`new_string\`
- \`delete_script\` — Delete a script file. Required: \`path\`
- \`list_assets\` — List importable 3D models (.glb, .gltf, .obj)
- \`import_asset\` — Import a model into the scene. Required: \`path\`. Optional: \`position\`, \`scale\`

## Creating Scripts

When creating scripts, use the create_script tool. Scripts follow these rules:

- Must export a default class extending \`Script\`
- Written in TypeScript (transpiled automatically)
- All engine types are available globally — no imports needed
- File paths use forward slashes, e.g. \`"scripts/rotate.ts"\`
- Convention: place scripts in a \`scripts/\` folder

### Lifecycle Methods

- \`start()\` — Called once when play mode starts. Use for initialization.
- \`update()\` — Called every frame. Use \`this.deltaTime\` for frame-independent movement.
- \`destroy()\` — Called when play mode stops. Clean up resources here.

### Available Properties (on \`this\`)

- \`this.node\` — The TransformNode this script is attached to
- \`this.scene\` — The Slop Engine Scene
- \`this.deltaTime\` — Seconds since last frame
- \`this.time\` — Seconds since play started
- \`this.input\` — Keyboard/mouse input state

### Helper Methods

- \`this.findNode(name)\` — Find a scene node by name
- \`this.findMesh(name)\` — Find a mesh by name
- \`this.log(...args)\` — Log to the editor's console panel

## Full Scripting API Reference

\`\`\`typescript
${apiDts}
\`\`\`

## Guidelines

- When the user asks to "add a box/sphere/etc.", use add_mesh directly
- When the user asks to "move/scale/rotate something", use get_scene to find it, then update_node
- When asked to change colors, use update_node with the color parameter
- For complex scene setups, call get_scene first, then use multiple tools
- When the user asks to "make something spin/move/bounce/etc.", create a script with create_script, then attach it to the node with attach_script
- To modify an existing script, use read_script first, then edit_script for targeted changes
- Prefer simple, readable code. Avoid over-engineering.
- Use \`this.deltaTime\` for all movement to ensure frame-rate independence
- When referencing nodes by name, remind users the name must match their scene
- If the user asks about scene setup or editor features (not scripting), answer conversationally without tools
- After creating and attaching a script, briefly explain what it does`
}

// ── Tool definitions ────────────────────────────────────────────────

const createScriptTool = {
    description:
        'Create or update a TypeScript script file in the project asset store. The script should export a default class extending Script. Use forward-slash paths like "scripts/rotate.ts".',
    inputSchema: jsonSchema<{ path: string; content: string }>({
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description:
                    'File path for the script (e.g. "scripts/rotate.ts"). Use forward slashes.',
            },
            content: {
                type: 'string',
                description:
                    'Full TypeScript source code for the script. Must export a default class extending Script.',
            },
        },
        required: ['path', 'content'],
    }),
}

const getSceneTool = {
    description:
        'Get a JSON snapshot of all nodes in the current 3D scene, including types, positions, rotations, scales, colors, and hierarchy. Call this first to understand the scene before making changes.',
    inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
    }),
}

const addMeshTool = {
    description:
        'Create a new mesh (3D shape) in the scene. Use size to set dimensions directly.',
    inputSchema: jsonSchema<{
        type: string
        name?: string
        position?: [number, number, number]
        rotation?: [number, number, number]
        rotationDegrees?: [number, number, number]
        scale?: [number, number, number]
        color?: [number, number, number]
        size?: {
            width?: number
            height?: number
            depth?: number
            diameter?: number
            thickness?: number
        }
    }>({
        type: 'object',
        properties: {
            type: {
                type: 'string',
                enum: [
                    'box',
                    'sphere',
                    'cylinder',
                    'cone',
                    'torus',
                    'pyramid',
                    'plane',
                    'ground',
                ],
                description: 'The type of mesh to create.',
            },
            name: {
                type: 'string',
                description:
                    'Optional name for the mesh. Auto-generated if omitted.',
            },
            position: {
                type: 'array',
                items: { type: 'number' },
                description:
                    'Position as [x, y, z]. Defaults to [0, 1, 0] for most meshes.',
            },
            rotationDegrees: {
                type: 'array',
                items: { type: 'number' },
                description:
                    'Rotation in degrees as [x, y, z]. Preferred over rotation.',
            },
            rotation: {
                type: 'array',
                items: { type: 'number' },
                description:
                    'Rotation in radians as [x, y, z]. Prefer rotationDegrees instead.',
            },
            scale: {
                type: 'array',
                items: { type: 'number' },
                description:
                    'Scale multiplier as [x, y, z]. Defaults to [1, 1, 1]. Prefer size for initial dimensions.',
            },
            color: {
                type: 'array',
                items: { type: 'number' },
                description:
                    'Diffuse color as [r, g, b], each 0-1. Defaults to gray.',
            },
            size: {
                type: 'object',
                properties: {
                    width: {
                        type: 'number',
                        description: 'Width (X axis). For box, plane, ground.',
                    },
                    height: {
                        type: 'number',
                        description:
                            'Height (Y axis). For box, cylinder, cone, plane, ground.',
                    },
                    depth: {
                        type: 'number',
                        description: 'Depth (Z axis). For box.',
                    },
                    diameter: {
                        type: 'number',
                        description:
                            'Diameter. For sphere, cylinder, cone, torus.',
                    },
                    thickness: {
                        type: 'number',
                        description: 'Tube thickness. For torus.',
                    },
                },
                description:
                    'Mesh dimensions. Fields vary by type: box(width,height,depth), sphere(diameter), cylinder/cone(height,diameter), torus(diameter,thickness), plane/ground(width,height).',
            },
        },
        required: ['type'],
    }),
}

const addLightTool = {
    description: 'Create a new light source in the scene.',
    inputSchema: jsonSchema<{
        type: string
        name?: string
        position?: [number, number, number]
        direction?: [number, number, number]
        intensity?: number
        color?: [number, number, number]
    }>({
        type: 'object',
        properties: {
            type: {
                type: 'string',
                enum: ['point', 'directional', 'spot', 'hemispheric'],
                description: 'The type of light to create.',
            },
            name: {
                type: 'string',
                description: 'Optional name for the light.',
            },
            position: {
                type: 'array',
                items: { type: 'number' },
                description: 'Position as [x, y, z]. Defaults to [0, 5, 0].',
            },
            direction: {
                type: 'array',
                items: { type: 'number' },
                description:
                    'Direction as [x, y, z]. Used by directional, spot, and hemispheric lights.',
            },
            intensity: {
                type: 'number',
                description: 'Light intensity. Default is 1.',
            },
            color: {
                type: 'array',
                items: { type: 'number' },
                description: 'Diffuse color as [r, g, b], each 0-1.',
            },
        },
        required: ['type'],
    }),
}

const updateNodeTool = {
    description:
        'Update properties of an existing node in the scene. Use get_scene first to find node names.',
    inputSchema: jsonSchema<{
        name: string
        position?: [number, number, number]
        rotation?: [number, number, number]
        rotationDegrees?: [number, number, number]
        scale?: [number, number, number]
        color?: [number, number, number]
        intensity?: number
        rename?: string
    }>({
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description:
                    'The name of the node to update. Must match exactly.',
            },
            position: {
                type: 'array',
                items: { type: 'number' },
                description: 'New position as [x, y, z].',
            },
            rotationDegrees: {
                type: 'array',
                items: { type: 'number' },
                description:
                    'New rotation in degrees as [x, y, z]. Preferred over rotation.',
            },
            rotation: {
                type: 'array',
                items: { type: 'number' },
                description:
                    'New rotation in radians as [x, y, z]. Prefer rotationDegrees instead.',
            },
            scale: {
                type: 'array',
                items: { type: 'number' },
                description: 'New scale as [x, y, z].',
            },
            color: {
                type: 'array',
                items: { type: 'number' },
                description:
                    'New color as [r, g, b], 0-1. Sets diffuseColor on meshes or diffuse on lights.',
            },
            intensity: {
                type: 'number',
                description: 'New intensity (lights only).',
            },
            rename: {
                type: 'string',
                description: 'Rename the node to this value.',
            },
        },
        required: ['name'],
    }),
}

const deleteNodeTool = {
    description:
        'Remove a node from the scene by name. Cannot delete the active camera.',
    inputSchema: jsonSchema<{ name: string }>({
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'The name of the node to delete.',
            },
        },
        required: ['name'],
    }),
}

const attachScriptTool = {
    description:
        'Attach a script to a node in the scene. The script file must already exist (use create_script first). Use get_scene to find node names.',
    inputSchema: jsonSchema<{ node: string; script: string }>({
        type: 'object',
        properties: {
            node: {
                type: 'string',
                description:
                    'The name of the node to attach the script to. Must match exactly.',
            },
            script: {
                type: 'string',
                description:
                    'The script file path (e.g. "scripts/rotate.ts"). Must already exist in the asset store.',
            },
        },
        required: ['node', 'script'],
    }),
}

const detachScriptTool = {
    description:
        'Detach (remove) a script from a node without deleting the script file.',
    inputSchema: jsonSchema<{ node: string; script: string }>({
        type: 'object',
        properties: {
            node: {
                type: 'string',
                description: 'The name of the node to detach the script from.',
            },
            script: {
                type: 'string',
                description: 'The script file path to detach.',
            },
        },
        required: ['node', 'script'],
    }),
}

const readScriptTool = {
    description:
        'Read the contents of a script file from the asset store. Use this before editing a script to see its current code.',
    inputSchema: jsonSchema<{ path: string }>({
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'The script file path (e.g. "scripts/rotate.ts").',
            },
        },
        required: ['path'],
    }),
}

const editScriptTool = {
    description:
        'Edit a script by replacing a specific string with a new string. Use read_script first to see the current code, then provide the exact text to find and what to replace it with. For multiple edits, call this tool multiple times.',
    inputSchema: jsonSchema<{
        path: string
        old_string: string
        new_string: string
    }>({
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'The script file path to edit.',
            },
            old_string: {
                type: 'string',
                description:
                    'The exact text to find in the script. Must match exactly (including whitespace/indentation).',
            },
            new_string: {
                type: 'string',
                description: 'The replacement text.',
            },
        },
        required: ['path', 'old_string', 'new_string'],
    }),
}

const listScriptsTool = {
    description:
        'List all script files in the asset store. Returns an array of file paths. Use this to discover available scripts before reading or attaching them.',
    inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
    }),
}

const deleteScriptTool = {
    description:
        'Delete a script file from the asset store. Also detaches it from any nodes that reference it.',
    inputSchema: jsonSchema<{ path: string }>({
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description:
                    'The script file path to delete (e.g. "scripts/rotate.ts").',
            },
        },
        required: ['path'],
    }),
}

const listAssetsTool = {
    description:
        'List all model files available in the asset store that can be imported into the scene. Returns file paths for .glb, .gltf, .obj models.',
    inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
    }),
}

const importAssetTool = {
    description:
        'Import a 3D model from the asset store into the scene. The model file must already exist in the asset store (use list_assets to see available models). Supports .glb, .gltf, and .obj formats. OBJ files with .mtl materials and textures are handled automatically.',
    inputSchema: jsonSchema<{
        path: string
        position?: [number, number, number]
        scale?: [number, number, number]
    }>({
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description:
                    'The asset file path of the model (e.g. "models/car.glb"). Use list_assets to find available models.',
            },
            position: {
                type: 'array',
                items: { type: 'number' },
                description:
                    'Position to place the model at as [x, y, z]. Defaults to [0, 0, 0].',
            },
            scale: {
                type: 'array',
                items: { type: 'number' },
                description: 'Scale as [x, y, z]. Defaults to [1, 1, 1].',
            },
        },
        required: ['path'],
    }),
}

const createGroupTool = {
    description:
        'Create an empty TransformNode group for organizing objects. Use set_parent to add children.',
    inputSchema: jsonSchema<{
        name: string
        position?: [number, number, number]
    }>({
        type: 'object',
        properties: {
            name: {
                type: 'string',
                description: 'Name for the group node.',
            },
            position: {
                type: 'array',
                items: { type: 'number' },
                description: 'Position as [x, y, z]. Defaults to [0, 0, 0].',
            },
        },
        required: ['name'],
    }),
}

const setParentTool = {
    description:
        'Set the parent of a node, making it a child of another node. Useful for grouping. Pass parent as null to unparent.',
    inputSchema: jsonSchema<{
        node: string
        parent: string | null
    }>({
        type: 'object',
        properties: {
            node: {
                type: 'string',
                description: 'Name of the node to reparent.',
            },
            parent: {
                type: ['string', 'null'] as unknown as 'string',
                description:
                    'Name of the new parent node, or null to unparent.',
            },
        },
        required: ['node', 'parent'],
    }),
}

const bulkSceneTool = {
    description:
        'Execute multiple scene operations in one call. Use this for complex scene construction (building a house, landscape, etc). Operations run sequentially so later ones can reference nodes created by earlier ones. ALWAYS give explicit names to nodes you will reference later. Supported actions: add_mesh, add_light, update_node, delete_node, create_group, set_parent. Each operation uses the same parameters as the corresponding individual tool, plus an "action" field.',
    inputSchema: jsonSchema<{
        operations: Array<{ action: string; [key: string]: unknown }>
    }>({
        type: 'object',
        properties: {
            operations: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: [
                                'add_mesh',
                                'add_light',
                                'update_node',
                                'delete_node',
                                'create_group',
                                'set_parent',
                            ],
                            description: 'The operation type.',
                        },
                    },
                    required: ['action'],
                },
                description:
                    'Array of operations. Each has "action" plus that action\'s parameters (e.g. add_mesh operations take type, name, position, size, color, rotationDegrees, etc).',
            },
        },
        required: ['operations'],
    }),
}

// ── Plugin ──────────────────────────────────────────────────────────

export function chatApiPlugin(): Plugin {
    return {
        name: 'chat-api',
        configureServer(server) {
            const env = loadEnv(
                server.config.mode,
                server.config.envDir ?? process.cwd(),
                ''
            )

            const openrouter = createOpenRouter({
                apiKey: env.OPENROUTER_API_KEY,
            })

            server.middlewares.use('/api/chat', async (req, res) => {
                if (req.method !== 'POST') {
                    res.statusCode = 405
                    res.end('Method Not Allowed')
                    return
                }

                try {
                    const body = await new Promise<string>((resolve) => {
                        let data = ''
                        req.on('data', (chunk: Buffer) => {
                            data += chunk.toString()
                        })
                        req.on('end', () => resolve(data))
                    })

                    const { messages } = JSON.parse(body) as {
                        messages: UIMessage[]
                    }

                    const modelMessages = await convertToModelMessages(messages)

                    const result = streamText({
                        model: openrouter.chat(
                            env.OPENROUTER_MODEL ?? 'arcee-ai/arcee-blitz'
                        ),
                        system: buildSystemPrompt(server.config.root),
                        tools: {
                            create_script: createScriptTool,
                            get_scene: getSceneTool,
                            add_mesh: addMeshTool,
                            add_light: addLightTool,
                            update_node: updateNodeTool,
                            delete_node: deleteNodeTool,
                            create_group: createGroupTool,
                            set_parent: setParentTool,
                            bulk_scene: bulkSceneTool,
                            attach_script: attachScriptTool,
                            detach_script: detachScriptTool,
                            read_script: readScriptTool,
                            edit_script: editScriptTool,
                            list_scripts: listScriptsTool,
                            delete_script: deleteScriptTool,
                            list_assets: listAssetsTool,
                            import_asset: importAssetTool,
                        },
                        messages: modelMessages,
                    })

                    const webResponse = result.toUIMessageStreamResponse()

                    res.statusCode = webResponse.status
                    webResponse.headers.forEach((value, key) => {
                        res.setHeader(key, value)
                    })

                    if (webResponse.body) {
                        const nodeStream = Readable.fromWeb(
                            webResponse.body as WebReadableStream
                        )
                        nodeStream.pipe(res)
                    } else {
                        res.end()
                    }
                } catch (error) {
                    console.error('[chat-api]', error)
                    if (!res.headersSent) {
                        res.statusCode = 500
                        res.setHeader('Content-Type', 'application/json')
                        res.end(
                            JSON.stringify({
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : 'Internal server error',
                            })
                        )
                    }
                }
            })
        },
    }
}
