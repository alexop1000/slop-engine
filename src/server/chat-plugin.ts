import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { createAzure } from '@ai-sdk/azure'
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
    buildCoordinatorSystemPrompt,
} from './prompts'
import {
    getSceneTool,
    playSimulationTool,
    stopSimulationTool,
    sleepTool,
    getConsoleLogsTool,
    spawnAgentTool,
    generateImageTool,
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

// Minimal CoreMessage-compatible type for the subagent endpoint
type SubagentMessage = {
    role: 'user' | 'assistant' | 'tool'
    content: unknown
}

type ModelSettings = {
    provider: 'azure' | 'openrouter'
    models: Record<string, string>
}

function getModel(
    provider: ReturnType<typeof createAzure>,
    openrouter: ReturnType<typeof createOpenRouter>,
    settings: ModelSettings | undefined,
    agentType: 'orchestrator' | 'scene' | 'script' | 'ui' | 'asset',
    envDefault: string
) {
    const modelId =
        settings?.models?.[agentType]?.trim() || envDefault
    if (settings?.provider === 'openrouter') {
        return openrouter.chat(modelId)
    }
    return provider(modelId)
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

            const azure = createAzure({
                apiKey: env.AZURE_OPENAI_API_KEY,
                resourceName: env.AZURE_OPENAI_RESOURCE_NAME,
            })
            const openrouter = createOpenRouter({
                apiKey: env.OPENROUTER_API_KEY,
            })

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

                    const modelMessages = await convertToModelMessages(messages)
                    const model = getModel(
                        azure,
                        openrouter,
                        modelSettings,
                        'orchestrator',
                        env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.2-chat'
                    )

                    const result = streamText({
                        model,
                        system: buildCoordinatorSystemPrompt(selectedNode),
                        tools: {
                            get_scene: getSceneTool,
                            play_simulation: playSimulationTool,
                            stop_simulation: stopSimulationTool,
                            sleep: sleepTool,
                            get_console_logs: getConsoleLogsTool,
                            spawn_agent: spawnAgentTool,
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

                    const { messages, agentType, modelSettings } = JSON.parse(body) as {
                        messages: SubagentMessage[]
                        agentType: 'scene' | 'script' | 'ui' | 'asset'
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
                            : buildSceneAgentSystemPrompt()

                    const tools =
                        agentType === 'asset'
                            ? {
                                  get_scene: getSceneTool,
                                  generate_image: generateImageTool,
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
                        azure,
                        openrouter,
                        modelSettings,
                        agentType,
                        env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.2-chat'
                    )

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result = await generateText({
                        model,
                        system,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        tools: tools as any,
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        messages: messages as any,
                    })

                    type AnyToolCall = {
                        toolCallId: string
                        toolName: string
                        input: unknown
                    }
                    const response = {
                        text: result.text,
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
