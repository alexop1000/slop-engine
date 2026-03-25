import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { createAzure } from '@ai-sdk/azure'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import {
    streamText,
    generateText,
    convertToModelMessages,
    type UIMessage,
} from 'ai'
import { Readable } from 'node:stream'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import {
    buildSceneAgentSystemPrompt,
    buildScriptAgentSystemPrompt,
    buildUIAgentSystemPrompt,
    buildAssetAgentSystemPrompt,
    buildTestAgentSystemPrompt,
    buildCoordinatorSystemPrompt,
} from './prompts'
import {
    getSceneTool,
    playSimulationTool,
    stopSimulationTool,
    sleepTool,
    getConsoleLogsTool,
    runAutonomousTestTool,
    spawnAgentTool,
    askClarificationTool,
    presentPlanTool,
    generateImageTool,
    generateTripoMeshTool,
    createScriptTool,
    listScriptsTool,
    readScriptTool,
    editScriptTool,
    deleteScriptTool,
    attachScriptTool,
    detachScriptTool,
    addMeshTool,
    addLightTool,
    updateNodeTool,
    deleteNodeTool,
    createGroupTool,
    setParentTool,
    bulkSceneTool,
    listAssetsTool,
    importAssetTool,
    savePrefabTool,
    lookupScriptingApiTool,
    listImageAssetsTool,
    applyTextureTool,
    removeTextureTool,
    updateMaterialPropertiesTool,
    setBillboardModeTool,
    deleteAssetTool,
    createAssetFolderTool,
} from './tools'
import { typeCheckScript } from './script-typecheck'
import { createLookupHandler } from './api-lookup'
import { generateImage, pollTaskResult } from './nanobanana'
import {
    tripoPollUntilModelReady,
    tripoSubmitTextToModel,
} from './tripo'

// Minimal CoreMessage-compatible type for the subagent endpoint
type SubagentMessage = {
    role: 'user' | 'assistant' | 'tool'
    content: unknown
}

const THINKING_BLOCK_RE =
    /<(think|thinking|thought|reasoning|inner_monologue)[\s>][\s\S]*?<\/\1>/gi

function stripThinkingBlocks(text: string): string {
    return text.replaceAll(THINKING_BLOCK_RE, '').trim()
}

type ModelSettings = {
    provider: 'azure' | 'openrouter' | 'google'
    models: Record<string, string>
    credentials?: {
        azureApiKey?: string
        azureResourceName?: string
        openrouterApiKey?: string
        googleApiKey?: string
    }
}

function getModel(
    settings: ModelSettings | undefined,
    agentType: 'orchestrator' | 'scene' | 'script' | 'ui' | 'asset' | 'test',
    envDefault: string,
    env: Record<string, string>
) {
    const modelId = settings?.models?.[agentType]?.trim() || envDefault
    const credentials = settings?.credentials

    if (settings?.provider === 'openrouter') {
        const openrouter = createOpenRouter({
            apiKey:
                credentials?.openrouterApiKey?.trim() || env.OPENROUTER_API_KEY,
        })
        return openrouter.chat(modelId)
    }

    if (settings?.provider === 'google') {
        const google = createGoogleGenerativeAI({
            apiKey: credentials?.googleApiKey?.trim() || env.GOOGLE_API_KEY,
        })
        return google(modelId)
    }

    const azure = createAzure({
        apiKey: credentials?.azureApiKey?.trim() || env.AZURE_OPENAI_API_KEY,
        resourceName:
            credentials?.azureResourceName?.trim() ||
            env.AZURE_OPENAI_RESOURCE_NAME,
    })

    return azure(modelId)
}

export function chatApiPlugin(): Plugin {
    return {
        name: 'chat-api',
        configureServer(server) {
            const env = loadEnv(
                server.config.mode,
                server.config.envDir ?? process.cwd(),
                ''
            )

            const apiDtsContent = readFileSync(
                resolve(server.config.root, 'src/scripting/api.d.ts'),
                'utf-8'
            )
            const lookupApi = createLookupHandler(server.config.root)

            server.middlewares.use(
                '/api/lookup-scripting-api',
                async (req, res) => {
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
                        const { topic } = JSON.parse(body) as { topic: string }
                        const result = lookupApi(
                            typeof topic === 'string' ? topic : ''
                        )
                        res.setHeader('Content-Type', 'application/json')
                        res.end(JSON.stringify({ content: result }))
                    } catch (error) {
                        console.error('[lookup-scripting-api]', error)
                        res.statusCode = 500
                        res.setHeader('Content-Type', 'application/json')
                        res.end(
                            JSON.stringify({
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : 'Lookup failed',
                            })
                        )
                    }
                }
            )

            server.middlewares.use('/api/typecheck', async (req, res) => {
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

                    const { content } = JSON.parse(body) as {
                        content: string
                    }
                    const errors = typeCheckScript(content, apiDtsContent)

                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify({ errors }))
                } catch (error) {
                    console.error('[typecheck]', error)
                    res.statusCode = 500
                    res.setHeader('Content-Type', 'application/json')
                    res.end(
                        JSON.stringify({
                            errors: [
                                error instanceof Error
                                    ? error.message
                                    : 'Typecheck failed',
                            ],
                        })
                    )
                }
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

                    const { messages, modelSettings, selectedNode } =
                        JSON.parse(body) as {
                            messages: UIMessage[]
                            modelSettings?: ModelSettings
                            selectedNode?: { name: string; type: string }
                        }

                    const modelMessages = await convertToModelMessages(
                        messages,
                        { ignoreIncompleteToolCalls: true }
                    )
                    const model = getModel(
                        modelSettings,
                        'orchestrator',
                        env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.2-chat',
                        env
                    )

                    const result = streamText({
                        model,
                        system: buildCoordinatorSystemPrompt(selectedNode),
                        tools: {
                            get_scene: getSceneTool,
                            spawn_agent: spawnAgentTool,
                            ask_clarification: askClarificationTool,
                            present_plan: presentPlanTool,
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

            server.middlewares.use('/api/generate-tripo-mesh', async (req, res) => {
                if (req.method !== 'POST') {
                    res.statusCode = 405
                    res.end('Method Not Allowed')
                    return
                }
                const apiKey = env.TRIPO_API_KEY
                if (!apiKey) {
                    res.statusCode = 500
                    res.setHeader('Content-Type', 'application/json')
                    res.end(
                        JSON.stringify({
                            error: 'TRIPO_API_KEY not configured',
                        })
                    )
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
                    const { prompt, path, negativePrompt } = JSON.parse(body) as {
                        prompt: string
                        path: string
                        negativePrompt?: string
                    }
                    if (!prompt || !path) {
                        res.statusCode = 400
                        res.setHeader('Content-Type', 'application/json')
                        res.end(
                            JSON.stringify({
                                error: 'prompt and path are required',
                            })
                        )
                        return
                    }
                    if (!path.toLowerCase().endsWith('.glb')) {
                        res.statusCode = 400
                        res.setHeader('Content-Type', 'application/json')
                        res.end(
                            JSON.stringify({
                                error: 'path must end with .glb',
                            })
                        )
                        return
                    }
                    const taskId = await tripoSubmitTextToModel({
                        apiKey,
                        prompt,
                        negativePrompt,
                    })
                    const { modelUrl } = await tripoPollUntilModelReady({
                        apiKey,
                        taskId,
                    })
                    const glbRes = await fetch(modelUrl)
                    if (!glbRes.ok) {
                        res.statusCode = 500
                        res.setHeader('Content-Type', 'application/json')
                        res.end(
                            JSON.stringify({
                                error: 'Failed to download generated GLB',
                            })
                        )
                        return
                    }
                    const buf = await glbRes.arrayBuffer()
                    const base64 = Buffer.from(buf).toString('base64')
                    const contentType =
                        glbRes.headers.get('content-type') ??
                        'model/gltf-binary'
                    res.setHeader('Content-Type', 'application/json')
                    res.end(
                        JSON.stringify({
                            path,
                            base64,
                            contentType,
                        })
                    )
                } catch (error) {
                    console.error('[generate-tripo-mesh]', error)
                    if (!res.headersSent) {
                        res.statusCode = 500
                        res.setHeader('Content-Type', 'application/json')
                        res.end(
                            JSON.stringify({
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : 'Tripo mesh generation failed',
                            })
                        )
                    }
                }
            })

            server.middlewares.use('/api/generate-image', async (req, res) => {
                if (req.method !== 'POST') {
                    res.statusCode = 405
                    res.end('Method Not Allowed')
                    return
                }
                const apiKey = env.NANOBANANA_API_KEY
                if (!apiKey) {
                    res.statusCode = 500
                    res.setHeader('Content-Type', 'application/json')
                    res.end(
                        JSON.stringify({
                            error: 'NANOBANANA_API_KEY not configured',
                        })
                    )
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
                    const { prompt, path, imageSize } = JSON.parse(body) as {
                        prompt: string
                        path: string
                        imageSize?: string
                    }
                    if (!prompt || !path) {
                        res.statusCode = 400
                        res.setHeader('Content-Type', 'application/json')
                        res.end(
                            JSON.stringify({
                                error: 'prompt and path are required',
                            })
                        )
                        return
                    }
                    const { taskId } = await generateImage({
                        apiKey,
                        prompt,
                        imageSize: imageSize as
                            | '1:1'
                            | '9:16'
                            | '16:9'
                            | '3:4'
                            | '4:3'
                            | '3:2'
                            | '2:3'
                            | '5:4'
                            | '4:5'
                            | '21:9'
                            | undefined,
                    })
                    const result = await pollTaskResult({ apiKey, taskId })
                    if (!result) {
                        res.statusCode = 500
                        res.setHeader('Content-Type', 'application/json')
                        res.end(
                            JSON.stringify({
                                error: 'Image generation failed or timed out',
                            })
                        )
                        return
                    }
                    const imgRes = await fetch(result.resultImageUrl)
                    if (!imgRes.ok) {
                        res.statusCode = 500
                        res.setHeader('Content-Type', 'application/json')
                        res.end(
                            JSON.stringify({
                                error: 'Failed to download generated image',
                            })
                        )
                        return
                    }
                    const buf = await imgRes.arrayBuffer()
                    const base64 = Buffer.from(buf).toString('base64')
                    const contentType =
                        imgRes.headers.get('content-type') ?? 'image/png'
                    res.setHeader('Content-Type', 'application/json')
                    res.end(
                        JSON.stringify({
                            path,
                            base64,
                            contentType,
                        })
                    )
                } catch (error) {
                    console.error('[generate-image]', error)
                    if (!res.headersSent) {
                        res.statusCode = 500
                        res.setHeader('Content-Type', 'application/json')
                        res.end(
                            JSON.stringify({
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : 'Image generation failed',
                            })
                        )
                    }
                }
            })

            server.middlewares.use('/api/subagent', async (req, res) => {
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

                    const { messages, agentType, modelSettings } = JSON.parse(
                        body
                    ) as {
                        messages: SubagentMessage[]
                        agentType: 'scene' | 'script' | 'ui' | 'asset' | 'test'
                        modelSettings?: ModelSettings
                    }

                    const isScriptingAgent =
                        agentType === 'script' || agentType === 'ui'

                    const system =
                        agentType === 'script'
                            ? buildScriptAgentSystemPrompt(server.config.root)
                            : agentType === 'ui'
                            ? buildUIAgentSystemPrompt(server.config.root)
                            : agentType === 'asset'
                            ? buildAssetAgentSystemPrompt()
                            : agentType === 'test'
                            ? buildTestAgentSystemPrompt()
                            : buildSceneAgentSystemPrompt()

                    const tools =
                        agentType === 'asset'
                            ? {
                                  get_scene: getSceneTool,
                                  generate_image: generateImageTool,
                                  generate_tripo_mesh: generateTripoMeshTool,
                                  list_assets: listAssetsTool,
                                  list_image_assets: listImageAssetsTool,
                                  apply_texture: applyTextureTool,
                                  remove_texture: removeTextureTool,
                                  update_material_properties:
                                      updateMaterialPropertiesTool,
                                  set_billboard_mode: setBillboardModeTool,
                                  delete_asset: deleteAssetTool,
                                  create_asset_folder: createAssetFolderTool,
                              }
                            : agentType === 'test'
                            ? {
                                  get_scene: getSceneTool,
                                  play_simulation: playSimulationTool,
                                  stop_simulation: stopSimulationTool,
                                  sleep: sleepTool,
                                  get_console_logs: getConsoleLogsTool,
                                  run_autonomous_test: runAutonomousTestTool,
                              }
                            : isScriptingAgent
                            ? {
                                  get_scene: getSceneTool,
                                  lookup_scripting_api: lookupScriptingApiTool,
                                  list_scripts: listScriptsTool,
                                  create_script: createScriptTool,
                                  read_script: readScriptTool,
                                  edit_script: editScriptTool,
                                  delete_script: deleteScriptTool,
                                  attach_script: attachScriptTool,
                                  detach_script: detachScriptTool,
                                  play_simulation: playSimulationTool,
                                  stop_simulation: stopSimulationTool,
                                  sleep: sleepTool,
                                  get_console_logs: getConsoleLogsTool,
                                  run_autonomous_test: runAutonomousTestTool,
                              }
                            : {
                                  get_scene: getSceneTool,
                                  add_mesh: addMeshTool,
                                  add_light: addLightTool,
                                  update_node: updateNodeTool,
                                  delete_node: deleteNodeTool,
                                  create_group: createGroupTool,
                                  set_parent: setParentTool,
                                  bulk_scene: bulkSceneTool,
                                  list_assets: listAssetsTool,
                                  import_asset: importAssetTool,
                                  save_prefab: savePrefabTool,
                              }

                    const model = getModel(
                        modelSettings,
                        agentType,
                        env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.2-chat',
                        env
                    )

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result = await generateText({
                        model,
                        system,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        tools: tools as any,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        messages: messages as any,
                        maxOutputTokens: 16384,
                        timeout: 110_000,
                    })

                    type AnyToolCall = {
                        toolCallId: string
                        toolName: string
                        input: unknown
                    }
                    const response = {
                        text: stripThinkingBlocks(result.text),
                        toolCalls: (
                            (result.toolCalls ?? []) as unknown as AnyToolCall[]
                        ).map((tc) => ({
                            toolCallId: tc.toolCallId,
                            toolName: tc.toolName,
                            args: tc.input,
                        })),
                        finishReason: result.finishReason,
                    }

                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify(response))
                } catch (error) {
                    console.error('[subagent]', error)
                    if (!res.headersSent) {
                        res.statusCode = 500
                        res.setHeader('Content-Type', 'application/json')
                        res.end(
                            JSON.stringify({
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : 'Subagent error',
                            })
                        )
                    }
                }
            })
        },
    }
}
