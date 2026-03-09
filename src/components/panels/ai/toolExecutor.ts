import type { Accessor, Setter } from 'solid-js'
import type { Scene, Node } from 'babylonjs'
import {
    getAssetStore,
    getBlob,
    setBlob,
    deleteBlob,
} from '../../../assetStore'
import { Texture, StandardMaterial, Color3 } from 'babylonjs'
import { openScript, openScriptFile } from '../../../scriptEditorStore'
import { logs, type LogEntry } from '../../../scripting/consoleStore'
import {
    addMeshToScene,
    addLightToScene,
    updateNodeInScene,
    deleteNodeFromScene,
    getSceneSnapshot,
    importModelToScene,
    createGroupInScene,
    setParentInScene,
    executeBulkOperations,
    serializeNodeAsPrefab,
    type AddMeshOptions,
    type AddLightOptions,
    type UpdateNodeOptions,
    type CreateGroupOptions,
    type BulkOperation,
    type AssetResolver,
} from '../../../scene/SceneOperations'

const VALID_MESH_TYPES = [
    'box',
    'sphere',
    'cylinder',
    'cone',
    'torus',
    'pyramid',
    'plane',
    'ground',
] as const

function ensureNumberArray(
    val: unknown,
    length: number
): [number, number, number] | undefined {
    if (Array.isArray(val) && val.length >= length) {
        const arr = val.slice(0, length).map(Number)
        if (arr.every((n) => !Number.isNaN(n)))
            return arr as [number, number, number]
    }
    if (typeof val === 'string') {
        try {
            const parsed = JSON.parse(val) as unknown
            return ensureNumberArray(parsed, length)
        } catch {
            return undefined
        }
    }
    return undefined
}

function sanitizeBulkOperations(
    raw: Array<Record<string, unknown>>
): BulkOperation[] {
    const ops: BulkOperation[] = []
    for (const op of raw) {
        const action = String(
            op && typeof op.action === 'string' ? op.action : ''
        ).toLowerCase()
        if (
            ![
                'add_mesh',
                'add_light',
                'update_node',
                'delete_node',
                'create_group',
                'set_parent',
            ].includes(action)
        ) {
            continue
        }

        const sanitized = { ...op, action } as Record<string, unknown>
        delete sanitized.checkCollisions

        if (action === 'add_mesh') {
            const rawType = sanitized.type
            if (!rawType || typeof rawType !== 'string' || !rawType.trim()) {
                ops.push(sanitized as BulkOperation)
                continue
            }
            let meshType = String(rawType).toLowerCase()
            if (meshType === 'capsule') meshType = 'cylinder'
            if (
                !VALID_MESH_TYPES.includes(
                    meshType as (typeof VALID_MESH_TYPES)[number]
                )
            ) {
                meshType = 'box'
            }
            sanitized.type = meshType
            const pos = ensureNumberArray(sanitized.position, 3)
            if (pos) sanitized.position = pos
            const scale = ensureNumberArray(sanitized.scale, 3)
            if (scale) sanitized.scale = scale
            const color = ensureNumberArray(sanitized.color, 3)
            if (color) sanitized.color = color
            const rot = ensureNumberArray(sanitized.rotationDegrees, 3)
            if (rot) sanitized.rotationDegrees = rot
            const rotRad = ensureNumberArray(sanitized.rotation, 3)
            if (rotRad) sanitized.rotation = rotRad
            if (
                sanitized.size &&
                typeof sanitized.size === 'object' &&
                !Array.isArray(sanitized.size)
            ) {
                const size = sanitized.size as Record<string, unknown>
                const clean: Record<string, number> = {}
                for (const k of [
                    'width',
                    'height',
                    'depth',
                    'diameter',
                    'thickness',
                ]) {
                    if (
                        typeof size[k] === 'number' &&
                        !Number.isNaN(size[k] as number)
                    ) {
                        clean[k] = size[k] as number
                    }
                }
                if (Object.keys(clean).length > 0) sanitized.size = clean
            }
        } else if (action === 'add_light') {
            const pos = ensureNumberArray(sanitized.position, 3)
            if (pos) sanitized.position = pos
            const dir = ensureNumberArray(sanitized.direction, 3)
            if (dir) sanitized.direction = dir
            const color = ensureNumberArray(sanitized.color, 3)
            if (color) sanitized.color = color
            if (
                typeof sanitized.intensity !== 'number' ||
                Number.isNaN(sanitized.intensity)
            ) {
                delete sanitized.intensity
            }
        } else if (action === 'update_node') {
            if (typeof sanitized.name !== 'string' || !sanitized.name.trim()) {
                ops.push(sanitized as BulkOperation)
                continue
            }
            const pos = ensureNumberArray(sanitized.position, 3)
            if (pos) sanitized.position = pos
            const scale = ensureNumberArray(sanitized.scale, 3)
            if (scale) sanitized.scale = scale
            const color = ensureNumberArray(sanitized.color, 3)
            if (color) sanitized.color = color
            const rot = ensureNumberArray(sanitized.rotationDegrees, 3)
            if (rot) sanitized.rotationDegrees = rot
            const rotRad = ensureNumberArray(sanitized.rotation, 3)
            if (rotRad) sanitized.rotation = rotRad
            if (
                typeof sanitized.intensity !== 'number' ||
                Number.isNaN(sanitized.intensity)
            ) {
                delete sanitized.intensity
            }
        } else if (action === 'delete_node') {
            if (typeof sanitized.name !== 'string' || !sanitized.name.trim()) {
                ops.push(sanitized as BulkOperation)
                continue
            }
        } else if (action === 'create_group') {
            if (typeof sanitized.name !== 'string' || !sanitized.name.trim()) {
                ops.push(sanitized as BulkOperation)
                continue
            }
            const pos = ensureNumberArray(sanitized.position, 3)
            if (pos) sanitized.position = pos
        } else if (action === 'set_parent') {
            if (typeof sanitized.node !== 'string' || !sanitized.node.trim()) {
                ops.push(sanitized as BulkOperation)
                continue
            }
            const parentVal = sanitized.parent
            if (
                parentVal !== null &&
                (typeof parentVal !== 'string' || !parentVal.trim())
            ) {
                ops.push(sanitized as BulkOperation)
                continue
            }
        }

        ops.push(sanitized as BulkOperation)
    }
    return ops
}
import { formatLogArg } from './utils'
import {
    updateSubagent,
    type SubagentTurn,
    type SubagentToolCall,
} from './subagentStore'

export interface ToolExecutorContext {
    scene: Accessor<Scene | undefined>
    selectedNode: Accessor<Node | undefined>
    setSelectedNode: (node: Node | undefined) => void
    setNodeTick: Setter<number>
    isPlaying: Accessor<boolean>
    requestPlay: () => Promise<void>
    requestStop: () => Promise<void>
}

const SCRIPT_EXT = ['.ts', '.tsx', '.js', '.jsx']
const MODEL_EXT = ['.glb', '.gltf', '.obj']
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga']
const PREFAB_EXT = '.prefab.json'
const MAX_AGENT_STEPS = 20

async function typeCheckContent(content: string): Promise<string[]> {
    try {
        const res = await fetch('/api/typecheck', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
        })
        const { errors } = (await res.json()) as { errors: string[] }
        return errors
    } catch {
        return []
    }
}

interface SubagentStep {
    text: string
    toolCalls: Array<{
        toolCallId: string
        toolName: string
        args: unknown
    }>
    finishReason: string
    error?: string
}

type SubagentMessage =
    | { role: 'user'; content: string }
    | {
          role: 'assistant'
          content: Array<
              | { type: 'text'; text: string }
              | {
                    type: 'tool-call'
                    toolCallId: string
                    toolName: string
                    input: unknown
                }
          >
      }
    | {
          role: 'tool'
          content: Array<{
              type: 'tool-result'
              toolCallId: string
              toolName: string
              output: { type: 'text'; value: string }
          }>
      }

export function createToolExecutor(
    ctx: ToolExecutorContext
): (toolName: string, input: unknown, toolCallId?: string) => Promise<string> {
    const executeCreateScript = async (args: {
        path: string
        content: string
    }): Promise<string> => {
        const store = getAssetStore()
        const parts = args.path.split('/')
        const fileName = parts.at(-1)!

        let parentPath = ''
        for (let i = 0; i < parts.length - 1; i++) {
            const dirName = parts[i]
            const dirPath = parentPath ? `${parentPath}/${dirName}` : dirName
            if (!store.findNode(store.tree(), dirPath)) {
                store.addNode(parentPath, dirName, 'folder')
            }
            parentPath = dirPath
        }

        if (!store.findNode(store.tree(), args.path)) {
            store.addNode(parentPath, fileName, 'file')
        }

        await setBlob(
            args.path,
            new Blob([args.content], { type: 'text/plain' })
        )

        if (openScript()?.path === args.path) {
            await openScriptFile(args.path)
        }

        const errors = await typeCheckContent(args.content)
        if (errors.length > 0) {
            return `Script created at "${
                args.path
            }" but has TypeScript errors:\n${errors.join(
                '\n'
            )}\n\nFix these errors with edit_script.`
        }

        return `Script created at "${args.path}"`
    }

    const executeGetScene = (): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        const snapshot = getSceneSnapshot(s)
        return JSON.stringify(
            {
                simulation: ctx.isPlaying() ? 'running' : 'stopped',
                nodes: snapshot,
            },
            null,
            2
        )
    }

    const executeAddMesh = (args: AddMeshOptions): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        const mesh = addMeshToScene(s, args)
        ctx.setSelectedNode(mesh)
        ctx.setNodeTick((t) => t + 1)
        return `Created ${args.type} mesh "${mesh.name}"`
    }

    const executeAddLight = (args: AddLightOptions): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        const light = addLightToScene(s, args)
        ctx.setSelectedNode(light)
        ctx.setNodeTick((t) => t + 1)
        return `Created ${args.type} light "${light.name}"`
    }

    const executeUpdateNode = (args: UpdateNodeOptions): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        updateNodeInScene(s, args)
        ctx.setNodeTick((t) => t + 1)
        const fields = Object.keys(args)
            .filter((k) => k !== 'name')
            .join(', ')
        return `Updated "${args.name}" (${fields})`
    }

    const executeDeleteNode = (args: { name: string }): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        const node = s.getNodeByName(args.name)
        if (ctx.selectedNode() === node) {
            ctx.setSelectedNode(undefined)
        }
        deleteNodeFromScene(s, args.name)
        ctx.setNodeTick((t) => t + 1)
        return `Deleted node "${args.name}"`
    }

    const executeCreateGroup = (args: CreateGroupOptions): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        const group = createGroupInScene(s, args)
        ctx.setSelectedNode(group)
        ctx.setNodeTick((t) => t + 1)
        return `Created group "${group.name}"`
    }

    const executeSetParent = (args: {
        node: string
        parent: string | null
    }): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        setParentInScene(s, args.node, args.parent)
        ctx.setNodeTick((t) => t + 1)
        return args.parent
            ? `Set parent of "${args.node}" to "${args.parent}"`
            : `Unparented "${args.node}"`
    }

    const executeBulkScene = (args: {
        operations: BulkOperation[] | Array<Record<string, unknown>>
    }): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        const raw = Array.isArray(args.operations) ? args.operations : []
        const operations = sanitizeBulkOperations(
            raw.map((o) =>
                o && typeof o === 'object' ? { ...o } : { action: '' }
            )
        )
        if (operations.length === 0) {
            return 'Bulk: no valid operations. Ensure each operation has an "action" (add_mesh, add_light, update_node, delete_node, create_group, set_parent) and required params (add_mesh needs type; update_node/delete_node/create_group need name; set_parent needs node). Unsupported: checkCollisions, capsule (use cylinder).'
        }
        const results = executeBulkOperations(s, operations)
        ctx.setNodeTick((t) => t + 1)
        const succeeded = results.filter((r) => r.success).length
        const failed = results.filter((r) => !r.success).length
        const summary = results
            .map((r) => (r.success ? `OK: ${r.message}` : `FAIL: ${r.message}`))
            .join('\n')
        return `Bulk: ${succeeded} succeeded, ${failed} failed\n${summary}`
    }

    const executeListScripts = (): string => {
        const store = getAssetStore()
        const allFiles = store.collectFilePaths(store.tree())
        const scripts = allFiles.filter((p) =>
            SCRIPT_EXT.some((ext) => p.toLowerCase().endsWith(ext))
        )
        if (scripts.length === 0) return 'No scripts found in asset store.'
        return JSON.stringify(scripts)
    }

    const executeAttachScript = (args: {
        node: string
        script: string
    }): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        const node = s.getNodeByName(args.node)
        if (!node) throw new Error(`Node "${args.node}" not found`)
        if (!node.metadata) node.metadata = {}
        const meta = node.metadata as Record<string, unknown>
        const scripts = (meta.scripts as string[] | undefined) ?? []
        if (scripts.includes(args.script)) {
            return `"${args.script}" is already attached to "${args.node}"`
        }
        meta.scripts = [...scripts, args.script]
        ctx.setNodeTick((t) => t + 1)
        return `Attached "${args.script}" to "${args.node}"`
    }

    const executeDetachScript = (args: {
        node: string
        script: string
    }): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        const node = s.getNodeByName(args.node)
        if (!node) throw new Error(`Node "${args.node}" not found`)
        const meta = node.metadata as { scripts?: string[] } | undefined
        const scripts = meta?.scripts ?? []
        if (!scripts.includes(args.script)) {
            throw new Error(
                `"${args.script}" is not attached to "${args.node}"`
            )
        }
        ;(node.metadata as Record<string, unknown>).scripts = scripts.filter(
            (s) => s !== args.script
        )
        ctx.setNodeTick((t) => t + 1)
        return `Detached "${args.script}" from "${args.node}"`
    }

    const executeReadScript = async (args: {
        path: string
    }): Promise<string> => {
        const blob = await getBlob(args.path)
        if (!blob) throw new Error(`Script "${args.path}" not found`)
        return await blob.text()
    }

    const executeEditScript = async (args: {
        path: string
        old_string: string
        new_string: string
    }): Promise<string> => {
        const blob = await getBlob(args.path)
        if (!blob) throw new Error(`Script "${args.path}" not found`)
        const content = await blob.text()

        const normalizedContent = content.replace(/\r\n/g, '\n')
        const normalizedOld = args.old_string.replace(/\r\n/g, '\n')

        if (!normalizedContent.includes(normalizedOld)) {
            throw new Error(
                `Could not find the specified text in "${args.path}". Make sure you use read_script first and copy the exact text including whitespace. Current file content:\n\`\`\`\n${normalizedContent}\n\`\`\``
            )
        }
        const updated = normalizedContent.replace(
            normalizedOld,
            () => args.new_string
        )
        await setBlob(args.path, new Blob([updated], { type: 'text/plain' }))
        if (openScript()?.path === args.path) {
            await openScriptFile(args.path)
        }

        const errors = await typeCheckContent(updated)
        if (errors.length > 0) {
            return `Edited "${
                args.path
            }" but it has TypeScript errors:\n${errors.join(
                '\n'
            )}\n\nFix these errors with edit_script.`
        }

        return `Edited "${args.path}"`
    }

    const executeDeleteScript = async (args: {
        path: string
    }): Promise<string> => {
        const s = ctx.scene()
        if (s) {
            const allNodes = [
                ...s.meshes,
                ...s.lights,
                ...s.cameras,
                ...s.transformNodes,
            ]
            for (const node of allNodes) {
                const meta = node.metadata as { scripts?: string[] } | undefined
                if (meta?.scripts?.includes(args.path)) {
                    meta.scripts = meta.scripts.filter((p) => p !== args.path)
                }
            }
        }

        await deleteBlob(args.path)
        const store = getAssetStore()
        if (store.findNode(store.tree(), args.path)) {
            store.deleteNode(args.path)
        }

        ctx.setNodeTick((t) => t + 1)
        return `Deleted script "${args.path}"`
    }

    const executeListAssets = (): string => {
        const store = getAssetStore()
        const allFiles = store.collectFilePaths(store.tree())
        const models = allFiles.filter((p) =>
            MODEL_EXT.some((ext) => p.toLowerCase().endsWith(ext))
        )
        if (models.length === 0) return 'No model assets found in asset store.'
        return JSON.stringify(models)
    }

    const executeListImageAssets = (): string => {
        const store = getAssetStore()
        const allFiles = store.collectFilePaths(store.tree())
        const images = allFiles.filter((p) =>
            IMAGE_EXT.some((ext) => p.toLowerCase().endsWith(ext))
        )
        if (images.length === 0) return 'No image assets found in asset store.'
        return JSON.stringify(images)
    }

    // Tracks blob URLs created for textures so we can revoke them when replaced
    const textureBlobUrls = new Map<string, string>()

    function applyTextureTransform(
        tex: Texture,
        tiling?: [number, number],
        offset?: [number, number],
        rotationDeg?: number
    ): void {
        if (tiling && tiling.length >= 2) {
            tex.uScale = tiling[0]
            tex.vScale = tiling[1]
        }
        if (offset && offset.length >= 2) {
            tex.uOffset = offset[0]
            tex.vOffset = offset[1]
        }
        if (typeof rotationDeg === 'number' && !Number.isNaN(rotationDeg)) {
            tex.wAng = (rotationDeg * Math.PI) / 180
        }
    }

    const executeApplyTexture = async (args: {
        mesh: string
        texturePath: string
        textureTiling?: [number, number]
        textureOffset?: [number, number]
        textureRotation?: number
    }): Promise<string> => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        const mesh = s.getMeshByName(args.mesh)
        if (!mesh) throw new Error(`Mesh "${args.mesh}" not found`)
        const blob = await getBlob(args.texturePath)
        if (!blob)
            throw new Error(`Asset "${args.texturePath}" not found in store`)

        const oldUrl = textureBlobUrls.get(args.mesh)
        if (oldUrl) URL.revokeObjectURL(oldUrl)

        const url = URL.createObjectURL(blob)
        textureBlobUrls.set(args.mesh, url)

        let mat = mesh.material as StandardMaterial | null
        if (!(mat instanceof StandardMaterial)) {
            mat = new StandardMaterial(`${args.mesh}_mat`, s)
            mesh.material = mat
        }
        if (mat.diffuseTexture) mat.diffuseTexture.dispose()
        const tex = new Texture(url, s)
        mat.diffuseTexture = tex
        applyTextureTransform(
            tex,
            args.textureTiling,
            args.textureOffset,
            args.textureRotation
        )

        if (!mesh.metadata) mesh.metadata = {}
        const meshMeta = mesh.metadata as Record<string, unknown>
        meshMeta.diffuseTexturePath = args.texturePath

        ctx.setNodeTick((t) => t + 1)
        return `Applied texture "${args.texturePath}" to "${args.mesh}"`
    }

    const executeUpdateMaterialProperties = (args: {
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
    }): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        const mesh = s.getMeshByName(args.mesh)
        if (!mesh) throw new Error(`Mesh "${args.mesh}" not found`)
        const mat = mesh.material as StandardMaterial | null
        if (!(mat instanceof StandardMaterial))
            throw new Error(`Mesh "${args.mesh}" has no StandardMaterial`)

        const tex = mat.diffuseTexture
        if (tex instanceof Texture)
            applyTextureTransform(
                tex,
                args.textureTiling,
                args.textureOffset,
                args.textureRotation
            )

        if (typeof args.roughness === 'number' && !Number.isNaN(args.roughness))
            mat.roughness = args.roughness
        if (
            typeof args.specularPower === 'number' &&
            !Number.isNaN(args.specularPower)
        )
            mat.specularPower = args.specularPower
        if (typeof args.alpha === 'number' && !Number.isNaN(args.alpha))
            mat.alpha = args.alpha

        const dc = ensureNumberArray(args.diffuseColor, 3)
        if (dc) mat.diffuseColor = new Color3(dc[0], dc[1], dc[2])
        const sc = ensureNumberArray(args.specularColor, 3)
        if (sc) mat.specularColor = new Color3(sc[0], sc[1], sc[2])
        const ec = ensureNumberArray(args.emissiveColor, 3)
        if (ec) mat.emissiveColor = new Color3(ec[0], ec[1], ec[2])
        const ac = ensureNumberArray(args.ambientColor, 3)
        if (ac) mat.ambientColor = new Color3(ac[0], ac[1], ac[2])

        ctx.setNodeTick((t) => t + 1)
        return `Updated material properties on "${args.mesh}"`
    }

    const executeRemoveTexture = (args: { mesh: string }): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        const mesh = s.getMeshByName(args.mesh)
        if (!mesh) throw new Error(`Mesh "${args.mesh}" not found`)
        const mat = mesh.material as StandardMaterial | null
        if (mat instanceof StandardMaterial && mat.diffuseTexture) {
            mat.diffuseTexture.dispose()
            mat.diffuseTexture = null
        }
        const oldUrl = textureBlobUrls.get(args.mesh)
        if (oldUrl) {
            URL.revokeObjectURL(oldUrl)
            textureBlobUrls.delete(args.mesh)
        }
        if (mesh.metadata) {
            delete (mesh.metadata as Record<string, unknown>).diffuseTexturePath
        }
        ctx.setNodeTick((t) => t + 1)
        return `Removed texture from "${args.mesh}"`
    }

    const BILLBOARD_MODES: Record<string, number> = {
        none: 0,
        x: 1,
        y: 2,
        z: 4,
        all: 7,
    }

    const executeSetBillboardMode = (args: {
        mesh: string
        mode: string
    }): string => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')
        const mesh = s.getMeshByName(args.mesh)
        if (!mesh) throw new Error(`Mesh "${args.mesh}" not found`)
        const mode = BILLBOARD_MODES[args.mode.toLowerCase()] ?? 0
        mesh.billboardMode = mode
        ctx.setNodeTick((t) => t + 1)
        return `Set billboard mode of "${args.mesh}" to "${args.mode}"`
    }

    const executeDeleteAsset = async (args: {
        path: string
    }): Promise<string> => {
        const store = getAssetStore()
        const node = store.findNode(store.tree(), args.path)
        if (!node) throw new Error(`Asset "${args.path}" not found`)
        if (node.type === 'folder')
            throw new Error(`Cannot delete folders with this tool`)
        await deleteBlob(args.path)
        store.deleteNode(args.path)
        ctx.setNodeTick((t) => t + 1)
        return `Deleted asset "${args.path}"`
    }

    const executeCreateAssetFolder = (args: { path: string }): string => {
        const store = getAssetStore()
        const segments = args.path.replace(/^\//, '').split('/').filter(Boolean)
        if (segments.length === 0) throw new Error('Invalid folder path')
        let parentPath = ''
        for (const seg of segments) {
            const fullPath = parentPath ? `${parentPath}/${seg}` : seg
            if (!store.findNode(store.tree(), fullPath)) {
                store.addNode(parentPath, seg, 'folder')
            }
            parentPath = fullPath
        }
        return `Created folder "${args.path}"`
    }

    const executeGenerateImage = async (args: {
        prompt: string
        path: string
        imageSize?: string
    }): Promise<string> => {
        const res = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: args.prompt,
                path: args.path,
                imageSize: args.imageSize,
            }),
        })
        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as {
                error?: string
            }
            throw new Error(
                err.error ?? `Generate image failed (${res.status})`
            )
        }
        const { path, base64, contentType } = (await res.json()) as {
            path: string
            base64: string
            contentType: string
        }
        const arr = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        const blob = new Blob([arr], { type: contentType })

        const store = getAssetStore()
        let pathStr = path.trim()
        if (pathStr.startsWith('/')) pathStr = pathStr.slice(1)
        const segments = pathStr.split('/').filter(Boolean)
        if (segments.length === 0) {
            throw new Error('Invalid path for generated image')
        }
        const fileName = segments.at(-1)!
        let parentPath = ''
        for (let i = 0; i < segments.length - 1; i++) {
            const dirName = segments[i]
            const dirPath = parentPath ? `${parentPath}/${dirName}` : dirName
            if (!store.findNode(store.tree(), dirPath)) {
                store.addNode(parentPath, dirName, 'folder')
            }
            parentPath = dirPath
        }
        if (!store.findNode(store.tree(), pathStr)) {
            store.addNode(parentPath, fileName, 'file')
        }

        await setBlob(pathStr, blob)
        ctx.setNodeTick((t) => t + 1)
        return `Generated and saved image to "${pathStr}"`
    }

    const resolveAsset: AssetResolver = (path) => getBlob(path)

    const executeImportAsset = async (args: {
        path: string
        position?: [number, number, number]
        scale?: [number, number, number]
    }): Promise<string> => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')

        const store = getAssetStore()
        const node = store.findNode(store.tree(), args.path)
        if (!node || node.type !== 'file') {
            throw new Error(`Asset "${args.path}" not found in asset store`)
        }

        const blob = await getBlob(args.path)
        if (!blob) throw new Error(`Could not read asset "${args.path}"`)

        const filename = args.path.slice(args.path.lastIndexOf('/') + 1)
        const lastSlash = args.path.lastIndexOf('/')
        const assetDir = lastSlash > 0 ? args.path.slice(0, lastSlash) : ''

        const root = await importModelToScene(
            s,
            blob,
            filename,
            assetDir,
            resolveAsset
        )

        if (args.position) {
            root.position.set(
                args.position[0],
                args.position[1],
                args.position[2]
            )
        }
        if (args.scale) {
            root.scaling.set(args.scale[0], args.scale[1], args.scale[2])
        }

        ctx.setSelectedNode(root)
        ctx.setNodeTick((t) => t + 1)
        return `Imported "${args.path}" as "${root.name}"`
    }

    const executeSavePrefab = async (args: {
        node: string
        path?: string
    }): Promise<string> => {
        const s = ctx.scene()
        if (!s) throw new Error('Scene not initialized')

        const sourceNode = s.getNodeByName(args.node)
        if (!sourceNode) {
            throw new Error(`Node "${args.node}" not found`)
        }

        const store = getAssetStore()

        const sanitizedNodeName = args.node.trim().replaceAll(/[\\/]+/g, '_')
        if (!sanitizedNodeName) {
            throw new Error('Node name is empty')
        }

        let path = args.path?.trim() || `prefabs/${sanitizedNodeName}`
        if (path.startsWith('/')) path = path.slice(1)
        if (!path.endsWith(PREFAB_EXT)) {
            path = `${path}${PREFAB_EXT}`
        }

        const segments = path.split('/').filter(Boolean)
        if (segments.length === 0) {
            throw new Error('Invalid prefab path')
        }

        const fileName = segments.at(-1)!
        let parentPath = ''
        for (let i = 0; i < segments.length - 1; i++) {
            const dirName = segments[i]
            const dirPath = parentPath ? `${parentPath}/${dirName}` : dirName
            if (!store.findNode(store.tree(), dirPath)) {
                store.addNode(parentPath, dirName, 'folder')
            }
            parentPath = dirPath
        }

        if (!store.findNode(store.tree(), path)) {
            store.addNode(parentPath, fileName, 'file')
        }

        const json = serializeNodeAsPrefab(sourceNode)
        await setBlob(path, new Blob([json], { type: 'application/json' }))

        return `Saved "${args.node}" as prefab at "${path}"`
    }

    const executePlaySimulation = async (): Promise<string> => {
        if (ctx.isPlaying()) return 'Simulation is already running'
        await ctx.requestPlay()
        return 'Simulation started'
    }

    const executeStopSimulation = async (): Promise<string> => {
        if (!ctx.isPlaying()) return 'Simulation is already stopped'
        await ctx.requestStop()
        return 'Simulation stopped'
    }

    const executeSleep = async (args: { seconds: number }): Promise<string> => {
        const sec = Math.min(30, Math.max(0.1, args.seconds))
        await new Promise((r) => setTimeout(r, sec * 1000))
        return `Waited ${sec} seconds`
    }

    const executeGetConsoleLogs = (): string => {
        const entries = logs()
        if (entries.length === 0) return 'No console logs yet.'
        const formatted = entries.map((e: LogEntry) => ({
            level: e.level,
            message: e.args.map(formatLogArg).join(' '),
            timestamp: e.timestamp,
        }))
        return JSON.stringify(formatted, null, 2)
    }

    const executeLookupScriptingApi = async (args: {
        topic: string
    }): Promise<string> => {
        const res = await fetch('/api/lookup-scripting-api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: args.topic ?? '' }),
        })
        if (!res.ok) {
            const err = (await res.json().catch(() => ({}))) as {
                error?: string
            }
            throw new Error(err.error ?? `Lookup failed (${res.status})`)
        }
        const { content } = (await res.json()) as { content: string }
        return content
    }

    const executeSpawnAgent = async (
        args: {
            agentType: 'scene' | 'script' | 'ui' | 'asset'
            task: string
            context?: string
        },
        toolCallId?: string
    ): Promise<string> => {
        const userContent = args.context
            ? `${args.task}\n\nContext:\n${args.context}`
            : args.task

        const messages: SubagentMessage[] = [
            { role: 'user', content: userContent },
        ]

        const actionsLog: string[] = []
        let finalText = ''

        const displayTurns: SubagentTurn[] = [
            { role: 'user', text: userContent },
        ]
        const emitState = (status: 'running' | 'done' | 'error') => {
            if (toolCallId) {
                updateSubagent(toolCallId, {
                    turns: displayTurns,
                    status,
                })
            }
        }
        emitState('running')

        for (let step = 0; step < MAX_AGENT_STEPS; step++) {
            const res = await fetch('/api/subagent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages, agentType: args.agentType }),
            })

            if (!res.ok) {
                const err = (await res.json().catch(() => ({}))) as {
                    error?: string
                }
                emitState('error')
                throw new Error(
                    err.error ?? `Subagent request failed (${res.status})`
                )
            }

            const data = (await res.json()) as SubagentStep

            const assistantContent: Extract<
                SubagentMessage,
                { role: 'assistant' }
            >['content'] = []
            if (data.text) {
                assistantContent.push({ type: 'text', text: data.text })
                finalText = data.text
            }
            for (const tc of data.toolCalls) {
                assistantContent.push({
                    type: 'tool-call',
                    toolCallId: tc.toolCallId,
                    toolName: tc.toolName,
                    input: tc.args,
                })
            }
            if (assistantContent.length > 0) {
                messages.push({ role: 'assistant', content: assistantContent })
            }

            const displayToolCalls: SubagentToolCall[] = data.toolCalls.map(
                (tc) => ({
                    name: tc.toolName,
                    args: (tc.args as Record<string, unknown>) ?? {},
                    status: 'pending' as const,
                })
            )
            const assistantTurn: SubagentTurn = {
                role: 'assistant',
                text: data.text || '',
                toolCalls:
                    displayToolCalls.length > 0 ? displayToolCalls : undefined,
            }
            displayTurns.push(assistantTurn)
            emitState('running')

            if (data.toolCalls.length === 0) break

            const toolResults: Extract<
                SubagentMessage,
                { role: 'tool' }
            >['content'] = []
            for (let i = 0; i < data.toolCalls.length; i++) {
                const tc = data.toolCalls[i]
                let result: string
                try {
                    result = await executeTool(tc.toolName, tc.args)
                    actionsLog.push(`${tc.toolName}: ${result}`)
                    displayToolCalls[i].status = 'done'
                    displayToolCalls[i].result = result
                } catch (err) {
                    result = `Error: ${
                        err instanceof Error ? err.message : String(err)
                    }`
                    actionsLog.push(`${tc.toolName} FAILED: ${result}`)
                    displayToolCalls[i].status = 'error'
                    displayToolCalls[i].error =
                        err instanceof Error ? err.message : String(err)
                }
                emitState('running')
                toolResults.push({
                    type: 'tool-result',
                    toolCallId: tc.toolCallId,
                    toolName: tc.toolName,
                    output: { type: 'text', value: result },
                })
            }
            messages.push({ role: 'tool', content: toolResults })

            if (data.finishReason === 'stop') break
        }

        emitState('done')

        const lines: string[] = []
        if (finalText) lines.push(finalText)
        if (actionsLog.length > 0) {
            lines.push(`\nActions taken (${actionsLog.length}):`)
            lines.push(...actionsLog.map((a) => `  • ${a}`))
        }
        return lines.join('\n') || 'Agent completed with no output.'
    }

    const executeTool = async (
        toolName: string,
        input: unknown,
        toolCallId?: string
    ): Promise<string> => {
        switch (toolName) {
            case 'create_script':
                return executeCreateScript(
                    input as { path: string; content: string }
                )
            case 'get_scene':
                return executeGetScene()
            case 'add_mesh':
                return executeAddMesh(input as AddMeshOptions)
            case 'add_light':
                return executeAddLight(input as AddLightOptions)
            case 'update_node':
                return executeUpdateNode(input as UpdateNodeOptions)
            case 'delete_node':
                return executeDeleteNode(input as { name: string })
            case 'create_group':
                return executeCreateGroup(input as CreateGroupOptions)
            case 'set_parent':
                return executeSetParent(
                    input as { node: string; parent: string | null }
                )
            case 'bulk_scene':
                return executeBulkScene(
                    input as { operations: BulkOperation[] }
                )
            case 'list_scripts':
                return executeListScripts()
            case 'attach_script':
                return executeAttachScript(
                    input as { node: string; script: string }
                )
            case 'detach_script':
                return executeDetachScript(
                    input as { node: string; script: string }
                )
            case 'read_script':
                return executeReadScript(input as { path: string })
            case 'edit_script':
                return executeEditScript(
                    input as {
                        path: string
                        old_string: string
                        new_string: string
                    }
                )
            case 'delete_script':
                return executeDeleteScript(input as { path: string })
            case 'list_assets':
                return executeListAssets()
            case 'generate_image':
                return executeGenerateImage(
                    input as {
                        prompt: string
                        path: string
                        imageSize?: string
                    }
                )
            case 'import_asset':
                return executeImportAsset(
                    input as {
                        path: string
                        position?: [number, number, number]
                        scale?: [number, number, number]
                    }
                )
            case 'save_prefab':
                return executeSavePrefab(
                    input as { node: string; path?: string }
                )
            case 'play_simulation':
                return executePlaySimulation()
            case 'stop_simulation':
                return executeStopSimulation()
            case 'sleep':
                return executeSleep(input as { seconds: number })
            case 'get_console_logs':
                return executeGetConsoleLogs()
            case 'lookup_scripting_api':
                return executeLookupScriptingApi(input as { topic: string })
            case 'spawn_agent':
                return executeSpawnAgent(
                    input as {
                        agentType: 'scene' | 'script' | 'ui' | 'asset'
                        task: string
                        context?: string
                    },
                    toolCallId
                )
            default:
                return executeAssetTool(toolName, input)
        }
    }

    const executeAssetTool = (
        toolName: string,
        input: unknown
    ): Promise<string> | string => {
        switch (toolName) {
            case 'list_image_assets':
                return executeListImageAssets()
            case 'apply_texture':
                return executeApplyTexture(
                    input as {
                        mesh: string
                        texturePath: string
                        textureTiling?: [number, number]
                        textureOffset?: [number, number]
                        textureRotation?: number
                    }
                )
            case 'update_material_properties':
                return executeUpdateMaterialProperties(
                    input as {
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
                    }
                )
            case 'remove_texture':
                return executeRemoveTexture(input as { mesh: string })
            case 'set_billboard_mode':
                return executeSetBillboardMode(
                    input as { mesh: string; mode: string }
                )
            case 'delete_asset':
                return executeDeleteAsset(input as { path: string })
            case 'create_asset_folder':
                return executeCreateAssetFolder(input as { path: string })
            default:
                throw new Error(`Unknown tool: ${toolName}`)
        }
    }

    return executeTool
}
