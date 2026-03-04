import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { createAzure } from '@ai-sdk/azure'
import { streamText, generateText, convertToModelMessages, type UIMessage } from 'ai'
import { Readable } from 'node:stream'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import {
    buildSceneAgentSystemPrompt,
    buildScriptAgentSystemPrompt,
    buildCoordinatorSystemPrompt,
} from './prompts'
import {
    getSceneTool,
    playSimulationTool,
    stopSimulationTool,
    sleepTool,
    getConsoleLogsTool,
    spawnAgentTool,
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
} from './tools'
import { typeCheckScript } from './script-typecheck'

// Minimal CoreMessage-compatible type for the subagent endpoint
type SubagentMessage = {
    role: 'user' | 'assistant' | 'tool'
    content: unknown
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

            const apiDtsContent = readFileSync(
                resolve(server.config.root, 'src/scripting/api.d.ts'),
                'utf-8'
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

                    const { messages } = JSON.parse(body) as {
                        messages: UIMessage[]
                    }

                    const modelMessages = await convertToModelMessages(messages)

                    const result = streamText({
                        model: azure(
                            env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.2-chat'
                        ),
                        system: buildCoordinatorSystemPrompt(),
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

                    const { messages, agentType } = JSON.parse(body) as {
                        messages: SubagentMessage[]
                        agentType: 'scene' | 'script'
                    }

                    const isScriptAgent = agentType === 'script'

                    const system = isScriptAgent
                        ? buildScriptAgentSystemPrompt(server.config.root)
                        : buildSceneAgentSystemPrompt()

                    const tools = isScriptAgent
                        ? {
                              get_scene: getSceneTool,
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

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result = await generateText({
                        model: azure(
                            env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.2-chat'
                        ),
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
