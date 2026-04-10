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
        'Create a new mesh (3D shape) in the scene. Use size to set dimensions directly. Optionally set wireframe, physicsEnabled, and physicsMass for the mesh.',
    inputSchema: jsonSchema<{
        type: string
        name?: string
        position?: [number, number, number]
        rotation?: [number, number, number]
        rotationDegrees?: [number, number, number]
        scale?: [number, number, number]
        color?: [number, number, number]
        wireframe?: boolean
        physicsEnabled?: boolean
        physicsMass?: number
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
            wireframe: {
                type: 'boolean',
                description:
                    'Render the mesh as wireframe. Defaults to false.',
            },
            physicsEnabled: {
                type: 'boolean',
                description:
                    'Whether the mesh should have physics enabled. Defaults to false.',
            },
            physicsMass: {
                type: 'number',
                description:
                    'Physics mass for the mesh. Defaults to 1.',
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
        'Update properties of an existing node in the scene. Use get_scene first to find node names. For meshes, you can also update wireframe, physicsEnabled, and physicsMass.',
    inputSchema: jsonSchema<{
        name: string
        position?: [number, number, number]
        rotation?: [number, number, number]
        rotationDegrees?: [number, number, number]
        scale?: [number, number, number]
        color?: [number, number, number]
        intensity?: number
        wireframe?: boolean
        physicsEnabled?: boolean
        physicsMass?: number
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
            wireframe: {
                type: 'boolean',
                description:
                    'Render a mesh as wireframe. Updates the mesh material.',
            },
            physicsEnabled: {
                type: 'boolean',
                description:
                    'Enable or disable physics on a mesh. Updates mesh metadata.',
            },
            physicsMass: {
                type: 'number',
                description:
                    'Set the physics mass on a mesh. Updates mesh metadata.',
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
        'Create an empty TransformNode group for organizing objects. Nest groups (parent group for the whole build, child groups for sub-assemblies) and use set_parent to attach meshes.',
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

export const runAutonomousTestTool = {
    description:
        'Run an autonomous gameplay test in simulation by executing timed inputs (keys/mouse), capturing scene snapshots before/during/after, and evaluating assertions.',
    inputSchema: jsonSchema<{
        inputs: Array<
            | { action: 'key_down'; key: string }
            | { action: 'key_up'; key: string }
            | { action: 'hold_key'; key: string; seconds: number }
            | { action: 'wait'; seconds: number }
            | {
                  action: 'mouse_move'
                  at: [number, number]
              }
            | {
                  action: 'mouse_down'
                  button?: number
                  at?: [number, number]
              }
            | {
                  action: 'mouse_up'
                  button?: number
                  at?: [number, number]
              }
            | {
                  action: 'click'
                  button?: number
                  at: [number, number]
              }
        >
        checks?: {
            before?: boolean
            duringSeconds?: number[]
            after?: boolean
        }
        assertions?: Array<{
            checkpoint: 'before' | 'during' | 'after'
            duringIndex?: number
            node: string
            path?: string
            comparator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'approx'
            expected: string | number | boolean | null
            tolerance?: number
        }>
    }>({
        type: 'object',
        properties: {
            inputs: {
                type: 'array',
                description:
                    'Timed input steps to run. Coordinates are normalized viewport [x,y] in [0..1]. Example: key_down(KeyW), wait(2.5), key_up(KeyW), click(at:[0.5,0.5]).',
                items: {
                    type: 'object',
                    properties: {
                        action: {
                            type: 'string',
                            enum: [
                                'key_down',
                                'key_up',
                                'hold_key',
                                'wait',
                                'mouse_move',
                                'mouse_down',
                                'mouse_up',
                                'click',
                            ],
                        },
                        key: {
                            type: 'string',
                            description:
                                'Keyboard code like KeyW, Space, ArrowLeft.',
                        },
                        seconds: {
                            type: 'number',
                            description:
                                'Duration in seconds for wait/hold_key.',
                        },
                        at: {
                            type: 'array',
                            items: { type: 'number' },
                            description:
                                'Normalized viewport coordinate [x,y], each in [0..1].',
                        },
                        button: {
                            type: 'number',
                            description:
                                'Mouse button: 0 left, 1 middle, 2 right. Defaults to 0.',
                        },
                    },
                    required: ['action'],
                    additionalProperties: true,
                },
            },
            checks: {
                type: 'object',
                properties: {
                    before: {
                        type: 'boolean',
                        description:
                            'Capture snapshot before inputs run. Default true.',
                    },
                    duringSeconds: {
                        type: 'array',
                        items: { type: 'number' },
                        description:
                            'Capture snapshots at these elapsed times (seconds) after test starts.',
                    },
                    after: {
                        type: 'boolean',
                        description:
                            'Capture snapshot after all inputs finish. Default true.',
                    },
                },
                additionalProperties: false,
            },
            assertions: {
                type: 'array',
                description:
                    'Optional assertions against snapshot values. Path examples: position[0], enabled, intensity.',
                items: {
                    type: 'object',
                    properties: {
                        checkpoint: {
                            type: 'string',
                            enum: ['before', 'during', 'after'],
                        },
                        duringIndex: {
                            type: 'number',
                            description:
                                'Required when checkpoint=during. Uses index into captured during snapshots.',
                        },
                        node: {
                            type: 'string',
                            description: 'Node name to inspect.',
                        },
                        path: {
                            type: 'string',
                            description:
                                'Property path on the node snapshot (example: position[0]).',
                        },
                        comparator: {
                            type: 'string',
                            enum: [
                                'eq',
                                'neq',
                                'gt',
                                'gte',
                                'lt',
                                'lte',
                                'approx',
                            ],
                        },
                        expected: {
                            type: [
                                'string',
                                'number',
                                'boolean',
                                'null',
                            ] as unknown as 'string',
                        },
                        tolerance: {
                            type: 'number',
                            description:
                                'Only for approx comparator. Default 0.001.',
                        },
                    },
                    required: ['checkpoint', 'node', 'comparator', 'expected'],
                    additionalProperties: false,
                },
            },
        },
        required: ['inputs'],
        additionalProperties: false,
    }),
}

export const bulkSceneTool = {
    description:
        'Execute multiple scene operations in one call. Use this for complex scene construction (building a house, landscape, etc). Operations run sequentially so later ones can reference nodes created by earlier ones. For 2+ meshes, use create_group for an assembly root and nested sub-groups where logical; parent everything with set_parent instead of leaving many root-level siblings. ALWAYS give explicit names to nodes you will reference later. Supported actions: add_mesh, add_light, update_node, delete_node, create_group, set_parent. REQUIRED params per action: add_mesh→type; add_light→type; update_node/delete_node/create_group→name; set_parent→node,parent. Never omit these.',
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
                    'Array of operations. Each has "action" plus that action\'s parameters. Prefer create_group + set_parent for hierarchy when adding multiple objects. add_mesh: type (required), name, position, size, color, rotationDegrees. set_parent: node, parent (both required).',
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

export const generateImageTool = {
    description:
        'Generate an image from a text prompt using AI and save it to the asset store. Use for textures, sprites, concept art, or any image asset. Path should be under images/ (e.g. images/hero.png).',
    inputSchema: jsonSchema<{
        prompt: string
        path: string
        imageSize?: string
    }>({
        type: 'object',
        properties: {
            prompt: {
                type: 'string',
                description:
                    'Text description of the image to generate (e.g. "a red brick wall texture, seamless").',
            },
            path: {
                type: 'string',
                description:
                    'Asset path to save the image (e.g. "images/hero.png"). Use .png or .jpg extension.',
            },
            imageSize: {
                type: 'string',
                enum: [
                    '1:1',
                    '9:16',
                    '16:9',
                    '3:4',
                    '4:3',
                    '3:2',
                    '2:3',
                    '5:4',
                    '4:5',
                    '21:9',
                ],
                description:
                    'Aspect ratio. Default 1:1. Use 16:9 for landscapes, 9:16 for portraits.',
            },
        },
        required: ['prompt', 'path'],
    }),
}

export const generateTripoMeshTool = {
    description:
        'Generate a 3D mesh (GLB) from a text prompt using Tripo AI and save it to the asset store. Requires TRIPO_API_KEY in the dev server environment. Use descriptive prompts (materials, style, silhouette). Save under models/ (e.g. models/barrel.glb). The scene agent can import_asset afterward.',
    inputSchema: jsonSchema<{
        prompt: string
        path: string
        negativePrompt?: string
    }>({
        type: 'object',
        properties: {
            prompt: {
                type: 'string',
                description:
                    'Detailed description of the 3D object (shape, materials, style).',
            },
            path: {
                type: 'string',
                description:
                    'Asset path to save the GLB (e.g. "models/chair.glb"). Must end with .glb.',
            },
            negativePrompt: {
                type: 'string',
                description:
                    'Optional traits to avoid (e.g. "low poly, broken geometry").',
            },
        },
        required: ['prompt', 'path'],
    }),
}

export const listImageAssetsTool = {
    description:
        'List all image files in the asset store (.png, .jpg, .jpeg, .webp, .gif, .bmp, .tga). Use to find existing textures and sprites before generating new ones.',
    inputSchema: jsonSchema<Record<string, never>>({
        type: 'object',
        properties: {},
    }),
}

export const applyTextureTool = {
    description:
        'Apply an image asset from the asset store as the diffuse texture on a mesh. Use list_image_assets to find available images. Use get_scene to find mesh names. Optionally set texture tiling, offset, or rotation.',
    inputSchema: jsonSchema<{
        mesh: string
        texturePath: string
        textureTiling?: [number, number]
        textureOffset?: [number, number]
        textureRotation?: number
    }>({
        type: 'object',
        properties: {
            mesh: {
                type: 'string',
                description:
                    'Exact name of the mesh node to apply the texture to.',
            },
            texturePath: {
                type: 'string',
                description:
                    'Asset path of the image (e.g. "images/brick.png"). Must exist in the asset store.',
            },
            textureTiling: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                description:
                    '[u, v] — repeat texture. [2, 2] tiles 2x2. Optional.',
            },
            textureOffset: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                description: '[u, v] — shift texture 0–1. Optional.',
            },
            textureRotation: {
                type: 'number',
                description: 'Rotate texture in degrees. Optional.',
            },
        },
        required: ['mesh', 'texturePath'],
    }),
}

export const removeTextureTool = {
    description:
        'Remove the diffuse texture from a mesh, reverting to its flat colour.',
    inputSchema: jsonSchema<{ mesh: string }>({
        type: 'object',
        properties: {
            mesh: {
                type: 'string',
                description: 'Exact name of the mesh node.',
            },
        },
        required: ['mesh'],
    }),
}

export const updateMaterialPropertiesTool = {
    description:
        'Update material and texture properties on a mesh. Controls how the texture looks: tiling (repeat), offset, rotation, plus material roughness, specular, colors. Use after apply_texture to fine-tune appearance. All properties are optional — only set what you need.',
    inputSchema: jsonSchema<{
        mesh: string
        textureTiling?: [number, number]
        textureOffset?: [number, number]
        textureRotation?: number
        roughness?: number
        specularPower?: number
        diffuseColor?: [number, number, number]
        specularColor?: [number, number, number]
        emissiveColor?: [number, number, number]
        ambientColor?: [number, number, number]
        alpha?: number
    }>({
        type: 'object',
        properties: {
            mesh: {
                type: 'string',
                description: 'Exact name of the mesh node.',
            },
            textureTiling: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                description:
                    '[u, v] — how many times to repeat the texture. [2, 2] tiles 2x2. [1, 1] is default.',
            },
            textureOffset: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                description:
                    '[u, v] — shift the texture. Values 0–1. Use with tiling for precise placement.',
            },
            textureRotation: {
                type: 'number',
                description:
                    'Rotate the texture in degrees. 0 = default, 90 = quarter turn.',
            },
            roughness: {
                type: 'number',
                description:
                    'Material roughness 0–1. Lower = shinier, higher = matte.',
            },
            specularPower: {
                type: 'number',
                description:
                    'Specular highlight sharpness. Higher = tighter highlight.',
            },
            diffuseColor: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: '[r, g, b] 0–1. Base colour tint.',
            },
            specularColor: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: '[r, g, b] 0–1. Specular highlight colour.',
            },
            emissiveColor: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: '[r, g, b] 0–1. Glow colour.',
            },
            ambientColor: {
                type: 'array',
                items: { type: 'number' },
                minItems: 3,
                maxItems: 3,
                description: '[r, g, b] 0–1. Ambient lighting tint.',
            },
            alpha: {
                type: 'number',
                description: 'Opacity 0–1. 1 = fully opaque.',
            },
        },
        required: ['mesh'],
    }),
}

export const setBillboardModeTool = {
    description:
        'Set the billboard mode of a mesh so it always faces the camera (fully or on one axis).',
    inputSchema: jsonSchema<{
        mesh: string
        mode: 'none' | 'all' | 'x' | 'y' | 'z'
    }>({
        type: 'object',
        properties: {
            mesh: {
                type: 'string',
                description: 'Exact name of the mesh node.',
            },
            mode: {
                type: 'string',
                enum: ['none', 'all', 'x', 'y', 'z'],
                description:
                    '"none" — no billboard. "all" — always face camera. "x"/"y"/"z" — rotate on that axis only.',
            },
        },
        required: ['mesh', 'mode'],
    }),
}

export const deleteAssetTool = {
    description:
        'Delete a file from the asset store permanently. Cannot delete folders.',
    inputSchema: jsonSchema<{ path: string }>({
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: 'Asset path to delete (e.g. "images/old.png").',
            },
        },
        required: ['path'],
    }),
}

export const createAssetFolderTool = {
    description: 'Create a folder in the asset store.',
    inputSchema: jsonSchema<{ path: string }>({
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description:
                    'Folder path to create (e.g. "images/characters"). Parent folders are created automatically.',
            },
        },
        required: ['path'],
    }),
}

export const askClarificationTool = {
    description:
        'Ask the user a clarifying question with visual choice options. Use during planning phase to understand what the user wants before building. Each option is shown as a clickable card.',
    inputSchema: jsonSchema<{
        question: string
        options: Array<{
            id: string
            label: string
            description: string
            icon?: string
        }>
        allowCustom?: boolean
        multiSelect?: boolean
    }>({
        type: 'object',
        properties: {
            question: {
                type: 'string',
                description: 'The question to ask the user.',
            },
            options: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Unique identifier for this option.',
                        },
                        label: {
                            type: 'string',
                            description:
                                'Short label for the option (2-5 words).',
                        },
                        description: {
                            type: 'string',
                            description:
                                'Longer explanation of what this option means (1-2 sentences).',
                        },
                        icon: {
                            type: 'string',
                            description:
                                'Optional Heroicons v2 **outline** icon name (npm `solid-heroicons/outline`). Use camelCase or kebab-case export names, e.g. swatch, puzzle-piece, bolt, cube, sparkles, eye, musical-note, paint-brush. Unknown names show a default icon in the UI.',
                        },
                    },
                    required: ['id', 'label', 'description'],
                },
                description: 'Array of 2-5 choice options to show the user.',
            },
            allowCustom: {
                type: 'boolean',
                description:
                    'Whether the user can type a custom answer instead. Default true.',
            },
            multiSelect: {
                type: 'boolean',
                description:
                    'Whether the user can select multiple options. Default false.',
            },
        },
        required: ['question', 'options'],
    }),
}

export const presentPlanTool = {
    description:
        'Present a build plan to the user for approval before executing. Shows the planned steps with agent assignments. Call this after gathering enough information from ask_clarification.',
    inputSchema: jsonSchema<{
        title: string
        steps: Array<{
            agent: 'scene' | 'script' | 'ui' | 'asset' | 'test'
            description: string
        }>
    }>({
        type: 'object',
        properties: {
            title: {
                type: 'string',
                description:
                    'Short title for the plan (e.g. "Tetris Game Plan").',
            },
            steps: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        agent: {
                            type: 'string',
                            enum: ['scene', 'script', 'ui', 'asset', 'test'],
                            description:
                                'Which specialist agent handles this step.',
                        },
                        description: {
                            type: 'string',
                            description:
                                'What this step will build, in plain language.',
                        },
                    },
                    required: ['agent', 'description'],
                },
                description: 'Ordered list of build steps.',
            },
        },
        required: ['title', 'steps'],
    }),
}

export const spawnAgentTool = {
    description:
        'Spawn a specialist subagent. Use agentType "scene" for builds, "script" for gameplay code, "ui" for in-game UI, "asset" for images/textures/Tripo 3D meshes, "test" for simulation runs and autonomous tests (play/stop/logs/run_autonomous_test — not for editing). Provide a clear self-contained task and any relevant context.',
    inputSchema: jsonSchema<{
        agentType: 'scene' | 'script' | 'ui' | 'asset' | 'test'
        task: string
        context?: string
    }>({
        type: 'object',
        properties: {
            agentType: {
                type: 'string',
                enum: ['scene', 'script', 'ui', 'asset', 'test'],
                description:
                    '"scene" for 3D world construction. "script" for TypeScript gameplay. "ui" for in-game UI. "asset" for images/textures and Tripo text-to-3D GLB. "test" for simulation-only validation (smoke, logs, run_autonomous_test).',
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
