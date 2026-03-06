import { jsonSchema } from 'ai'

export const createScriptTool = {
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

export const getSceneTool = {
    description:
        'Get a JSON snapshot of the scene. Returns { simulation: "running"|"stopped", nodes: [...] }. Nodes include types, positions, rotations, scales, colors, hierarchy. Works during play—nodes reflect current runtime state. Call first to understand the scene.',
    inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
    }),
}

export const addMeshTool = {
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

export const addLightTool = {
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

export const updateNodeTool = {
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

export const deleteNodeTool = {
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

export const attachScriptTool = {
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

export const detachScriptTool = {
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

export const readScriptTool = {
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

export const editScriptTool = {
    description:
        'Edit a script by find-and-replace. IMPORTANT: Always call read_script first so you have the exact current content. Provide `old_string` with the EXACT text to find (including whitespace, indentation, and newlines) and `new_string` with the replacement. Only the first occurrence is replaced. For multiple edits, call this tool multiple times.',
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

export const listScriptsTool = {
    description:
        'List all script files in the asset store. Returns an array of file paths. Use this to discover available scripts before reading or attaching them.',
    inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
    }),
}

export const deleteScriptTool = {
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

export const listAssetsTool = {
    description:
        'List all model files available in the asset store that can be imported into the scene. Returns file paths for .glb, .gltf, .obj models.',
    inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
    }),
}

export const importAssetTool = {
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

export const savePrefabTool = {
    description:
        'Save a scene node (including children) as a prefab file in the asset store. Defaults to prefabs/<node>.prefab.json unless a path is provided.',
    inputSchema: jsonSchema<{
        node: string
        path?: string
    }>({
        type: 'object',
        properties: {
            node: {
                type: 'string',
                description: 'The exact scene node name to save as a prefab.',
            },
            path: {
                type: 'string',
                description:
                    'Optional asset path for the prefab file (e.g. "prefabs/crate.prefab.json"). If omitted, uses prefabs/<node>.prefab.json.',
            },
        },
        required: ['node'],
    }),
}

export const createGroupTool = {
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

export const setParentTool = {
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

export const playSimulationTool = {
    description:
        'Start the game simulation. Scripts will run, physics will be active. Use stop_simulation to stop.',
    inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
    }),
}

export const stopSimulationTool = {
    description:
        'Stop the game simulation and restore the scene to its state before play.',
    inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
    }),
}

export const sleepTool = {
    description:
        'Wait for a number of seconds. Useful for runtime testing: start simulation, sleep, then check get_scene or get_console_logs. Max 30 seconds.',
    inputSchema: jsonSchema<{ seconds: number }>({
        type: 'object',
        properties: {
            seconds: {
                type: 'number',
                description:
                    'Seconds to wait. Use 1–3 for typical script output checks.',
            },
        },
        required: ['seconds'],
    }),
}

export const getConsoleLogsTool = {
    description:
        'Read the editor console logs. Scripts output via this.log() appears here. Use after sleep during play to inspect runtime output.',
    inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
    }),
}

export const bulkSceneTool = {
    description:
        'Execute multiple scene operations in one call. Use this for complex scene construction (building a house, landscape, etc). Operations run sequentially so later ones can reference nodes created by earlier ones. ALWAYS give explicit names to nodes you will reference later. Supported actions: add_mesh, add_light, update_node, delete_node, create_group, set_parent. REQUIRED params per action: add_mesh→type; add_light→type; update_node/delete_node/create_group→name; set_parent→node,parent. Never omit these.',
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
                            description:
                                'The operation type. Each action also requires its params: add_mesh needs type; add_light needs type; update_node/delete_node/create_group need name; set_parent needs node and parent.',
                        },
                    },
                    required: ['action'],
                    additionalProperties: true,
                },
                description:
                    'Array of operations. Each has "action" plus that action\'s parameters. add_mesh: type (required), name, position, size, color, rotationDegrees. set_parent: node, parent (both required).',
            },
        },
        required: ['operations'],
    }),
}

export const lookupScriptingApiTool = {
    description:
        'Look up detailed API documentation from the full scripting reference. Use when you need specifics: method signatures, parameter types, examples, or options. Topics: Script, GUI, Input, Vector3, spawn, raycast, createButton, createLabel, PhysicsBody, CollisionEvent, SpawnOptions, etc.',
    inputSchema: jsonSchema<{ topic: string }>({
        type: 'object',
        properties: {
            topic: {
                type: 'string',
                description:
                    'The API topic to look up (e.g. "GUI", "spawn", "createButton", "Vector3", "raycast").',
            },
        },
        required: ['topic'],
    }),
}

export const spawnAgentTool = {
    description:
        'Spawn a specialist subagent. Use agentType "scene" for 3D world building (meshes, lights, layout, assets), "script" for TypeScript gameplay scripting (writing/editing scripts, attaching them, debugging via simulation), and "ui" for in-game UI (buttons, labels, HUDs via this.gui). Provide a clear self-contained task and any relevant context.',
    inputSchema: jsonSchema<{
        agentType: 'scene' | 'script' | 'ui'
        task: string
        context?: string
    }>({
        type: 'object',
        properties: {
            agentType: {
                type: 'string',
                enum: ['scene', 'script', 'ui'],
                description:
                    '"scene" for 3D world construction (meshes, lights, hierarchy, assets). "script" for TypeScript gameplay scripting, logic, and debugging. "ui" for in-game UI (buttons, labels, HUDs via scripts).',
            },
            task: {
                type: 'string',
                description:
                    'A clear, complete description of the task. The agent has no conversation memory — include all necessary details, node names, constraints, and expected behaviour.',
            },
            context: {
                type: 'string',
                description:
                    'Optional additional context (e.g. current scene layout, node names from earlier agents, style/design constraints).',
            },
        },
        required: ['agentType', 'task'],
    }),
}
