import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { createAzure } from '@ai-sdk/azure'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { streamText, generateText, type UIMessage } from 'ai'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

import {
    buildSceneAgentSystemPrompt,
    buildScriptAgentSystemPrompt,
    buildUIAgentSystemPrompt,
    buildAssetAgentSystemPrompt,
    buildTestAgentSystemPrompt,
    buildCoordinatorSystemPrompt,
} from '../src/server/prompts'
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
} from '../src/server/tools'
import { typeCheckScript } from '../src/server/script-typecheck'
import { createLookupHandler } from '../src/server/api-lookup'
import { generateImage, pollTaskResult } from '../src/server/nanobanana'
import {
    tripoPollUntilModelReady,
    tripoSubmitTextToModel,
} from '../src/server/tripo'
import {
    aggregateCostUsd,
    logAgentLlmCall,
    summarizeChatRequest,
    summarizeSubagentRequest,
} from '../src/server/agent-llm-log'
import { convertToModelMessagesWithDataUris } from '../src/server/message-utils'
import { harnessRoutes } from '../harness/plugin/routes'
import {
    beginIteration,
    endIteration,
    getCurrentIteration,
    recordLlmCall,
    recordToolCall,
} from '../harness/plugin/slop-instrument'
import { loadConfig as loadHarnessConfig } from '../harness/paths'
import type { HarnessConfig } from '../harness/types'

function harnessModelSettingsOverride(
    config: HarnessConfig
): ModelSettings | undefined {
    if (config.provider === 'azure' && config.azure) {
        const dep = config.azure.deployment
        return {
            provider: 'azure',
            models: {
                orchestrator: dep,
                scene: dep,
                script: dep,
                ui: dep,
                asset: dep,
                test: dep,
            },
            credentials: {
                azureApiKey: config.azure.apiKey,
                azureResourceName: config.azure.resourceName,
            },
        }
    }
    return undefined
}

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
    envDefault: string
) {
    const modelId = settings?.models?.[agentType]?.trim() || envDefault
    const credentials = settings?.credentials

    if (settings?.provider === 'openrouter') {
        const openrouter = createOpenRouter({
            apiKey:
                credentials?.openrouterApiKey?.trim() ||
                process.env.OPENROUTER_API_KEY,
        })
        return openrouter.chat(modelId)
    }

    if (settings?.provider === 'google') {
        const google = createGoogleGenerativeAI({
            apiKey:
                credentials?.googleApiKey?.trim() || process.env.GOOGLE_API_KEY,
        })
        return google(modelId)
    }

    const azure = createAzure({
        apiKey:
            credentials?.azureApiKey?.trim() ||
            process.env.AZURE_OPENAI_API_KEY,
        resourceName:
            credentials?.azureResourceName?.trim() ||
            process.env.AZURE_OPENAI_RESOURCE_NAME,
    })

    return azure(modelId)
}

const projectRoot = resolve(import.meta.dir, '..')
const apiDtsContent = readFileSync(
    resolve(projectRoot, 'src/scripting/api.d.ts'),
    'utf-8'
)
const lookupApi = createLookupHandler(projectRoot)

const defaultDeployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.4-mini'

const distDir = resolve(projectRoot, 'dist')
const indexHtml = resolve(distDir, 'index.html')

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.ttf': 'font/ttf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
}

function getMimeType(path: string): string {
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
    return MIME_TYPES[ext] ?? 'application/octet-stream'
}

const api = new Elysia({ prefix: '/api' })
    .use(cors())
    .post('/lookup-scripting-api', async ({ body }) => {
        const { topic } = body as { topic: string }
        const result = lookupApi(typeof topic === 'string' ? topic : '')
        return { content: result }
    })
    .post('/typecheck', async ({ body }) => {
        const { content } = body as { content: string }
        const errors = typeCheckScript(content, apiDtsContent)
        return { errors }
    })
    .post('/chat', async ({ body }) => {
        const {
            messages,
            modelSettings,
            selectedNode,
            harnessRunId,
            harnessIteration,
        } = body as {
            messages: UIMessage[]
            modelSettings?: ModelSettings
            selectedNode?: { name: string; type: string }
            harnessRunId?: string
            harnessIteration?: {
                kind: 'initial' | 'nudge' | 'clarification' | 'plan_approval'
                prompt: string
            }
        }

        if (harnessRunId && harnessIteration) {
            beginIteration(
                harnessRunId,
                harnessIteration.kind,
                harnessIteration.prompt
            )
        }

        // When a Slop run is driving this chat, force the harness-configured
        // provider so measurements are apples-to-apples with opencode scenarios
        // regardless of the editor's current model settings.
        const effectiveSettings = harnessRunId
            ? harnessModelSettingsOverride(loadHarnessConfig()) ?? modelSettings
            : modelSettings

        const callStartedAt = Date.now()
        const modelMessages = await convertToModelMessagesWithDataUris(
            messages,
            { ignoreIncompleteToolCalls: true }
        )
        const model = getModel(
            effectiveSettings,
            'orchestrator',
            defaultDeployment
        )
        const orchestratorModelId =
            effectiveSettings?.models?.orchestrator?.trim() || defaultDeployment
        const chatRequestSummary = summarizeChatRequest(messages)

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
            onFinish: (event) => {
                if (harnessRunId) {
                    recordLlmCall(harnessRunId, {
                        usage: event.totalUsage,
                        providerMetadata: event.providerMetadata,
                        finishReason: event.finishReason,
                        durationMs: Date.now() - callStartedAt,
                        modelId: orchestratorModelId,
                    })
                    for (const step of event.steps ?? []) {
                        for (const tc of step.toolCalls ?? []) {
                            const toolName =
                                (tc as { toolName?: string }).toolName ?? 'tool'
                            const input = (tc as { input?: unknown }).input
                            recordToolCall(harnessRunId, toolName, input)
                        }
                    }
                    if (event.finishReason === 'stop') {
                        endIteration(harnessRunId)
                    }
                }
                const costUsd = aggregateCostUsd({
                    providerMetadata: event.providerMetadata,
                    steps: event.steps,
                    usage: event.totalUsage,
                })
                logAgentLlmCall({
                    route: 'chat',
                    provider: effectiveSettings?.provider ?? 'azure',
                    modelId: orchestratorModelId,
                    agentRole: 'orchestrator',
                    request: chatRequestSummary,
                    usage: event.usage,
                    totalUsage: event.totalUsage,
                    costUsd,
                    finishReason: event.finishReason,
                    selectedNode,
                })
            },
        })

        return result.toUIMessageStreamResponse()
    })
    .post('/generate-tripo-mesh', async ({ body, set }) => {
        const apiKey = process.env.TRIPO_API_KEY
        if (!apiKey) {
            set.status = 500
            return { error: 'TRIPO_API_KEY not configured' }
        }

        const { prompt, path, negativePrompt } = body as {
            prompt: string
            path: string
            negativePrompt?: string
        }
        if (!prompt || !path) {
            set.status = 400
            return { error: 'prompt and path are required' }
        }
        if (!path.toLowerCase().endsWith('.glb')) {
            set.status = 400
            return { error: 'path must end with .glb' }
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
            set.status = 500
            return { error: 'Failed to download generated GLB' }
        }
        const buf = await glbRes.arrayBuffer()
        const base64 = Buffer.from(buf).toString('base64')
        const contentType =
            glbRes.headers.get('content-type') ?? 'model/gltf-binary'
        return { path, base64, contentType }
    })
    .post('/generate-image', async ({ body, set }) => {
        const apiKey = process.env.NANOBANANA_API_KEY
        if (!apiKey) {
            set.status = 500
            return { error: 'NANOBANANA_API_KEY not configured' }
        }

        const { prompt, path, imageSize } = body as {
            prompt: string
            path: string
            imageSize?: string
        }
        if (!prompt || !path) {
            set.status = 400
            return { error: 'prompt and path are required' }
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
            set.status = 500
            return { error: 'Image generation failed or timed out' }
        }

        const imgRes = await fetch(result.resultImageUrl)
        if (!imgRes.ok) {
            set.status = 500
            return { error: 'Failed to download generated image' }
        }
        const buf = await imgRes.arrayBuffer()
        const base64 = Buffer.from(buf).toString('base64')
        const contentType = imgRes.headers.get('content-type') ?? 'image/png'
        return { path, base64, contentType }
    })
    .post('/subagent', async ({ body, set }) => {
        const { messages, agentType, modelSettings, harnessRunId } = body as {
            messages: SubagentMessage[]
            agentType: 'scene' | 'script' | 'ui' | 'asset' | 'test'
            modelSettings?: ModelSettings
            harnessRunId?: string
        }
        const effectiveSubagentSettings = harnessRunId
            ? harnessModelSettingsOverride(loadHarnessConfig()) ?? modelSettings
            : modelSettings

        const isScriptingAgent = agentType === 'script' || agentType === 'ui'

        const system =
            agentType === 'script'
                ? buildScriptAgentSystemPrompt(projectRoot)
                : agentType === 'ui'
                ? buildUIAgentSystemPrompt(projectRoot)
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
                      update_material_properties: updateMaterialPropertiesTool,
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
            effectiveSubagentSettings,
            agentType,
            defaultDeployment
        )
        const subagentModelId =
            effectiveSubagentSettings?.models?.[agentType]?.trim() ||
            defaultDeployment
        const subagentRequestSummary = summarizeSubagentRequest(messages)

        const callStartedAt = Date.now()
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

        if (harnessRunId && getCurrentIteration(harnessRunId) !== undefined) {
            recordLlmCall(harnessRunId, {
                usage: result.totalUsage,
                providerMetadata: result.providerMetadata,
                finishReason: result.finishReason,
                durationMs: Date.now() - callStartedAt,
                modelId: subagentModelId,
            })
            for (const step of result.steps ?? []) {
                for (const tc of step.toolCalls ?? []) {
                    const toolName =
                        (tc as { toolName?: string }).toolName ?? 'tool'
                    const input = (tc as { input?: unknown }).input
                    recordToolCall(
                        harnessRunId,
                        `${agentType}/${toolName}`,
                        input
                    )
                }
            }
        }

        const costUsd = aggregateCostUsd({
            providerMetadata: result.providerMetadata,
            steps: result.steps,
            usage: result.totalUsage,
        })
        logAgentLlmCall({
            route: 'subagent',
            provider: effectiveSubagentSettings?.provider ?? 'azure',
            modelId: subagentModelId,
            agentRole: agentType,
            request: subagentRequestSummary,
            usage: result.usage,
            totalUsage: result.totalUsage,
            costUsd,
            finishReason: result.finishReason,
        })

        type AnyToolCall = {
            toolCallId: string
            toolName: string
            input: unknown
        }
        return {
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
    })
    .use(harnessRoutes)
    .onError(({ error, set }) => {
        console.error('[server]', error)
        set.status = 500
        return {
            error:
                error instanceof Error
                    ? error.message
                    : 'Internal server error',
        }
    })

const port = Number.parseInt(process.env.PORT || '3000', 10)

async function serveStatic(pathname: string): Promise<Response> {
    const filePath = join(distDir, pathname)
    const file = Bun.file(filePath)
    if (await file.exists()) {
        return new Response(file, {
            headers: { 'content-type': getMimeType(filePath) },
        })
    }
    return new Response(Bun.file(indexHtml), {
        headers: { 'content-type': 'text/html' },
    })
}

Bun.serve({
    port,
    idleTimeout: 255, // max; keeps SSE connections alive. SSE heartbeats every 5s.
    async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname.startsWith('/api/')) {
            return api.handle(request)
        }
        return serveStatic(url.pathname)
    },
})

console.log(`Slop Engine running on http://localhost:${port}`)
