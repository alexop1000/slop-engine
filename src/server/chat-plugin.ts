import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { createAzure } from '@ai-sdk/azure'
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

- Help users write scripts that control 3D objects in their scene
- Explain the scripting API, and game-dev patterns
- Create and update script files using the create_script tool
- Help debug and improve existing scripts
- Answer general questions about the editor

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

- When the user asks to "make something spin/move/bounce/etc.", create a script using the tool
- Prefer simple, readable code. Avoid over-engineering.
- Use \`this.deltaTime\` for all movement to ensure frame-rate independence
- When referencing nodes by name, remind users the name must match their scene
- If the user asks about scene setup or editor features (not scripting), answer conversationally without tools
- After creating a script, briefly explain what it does and how to attach it (select a node → Properties panel → Scripts section → add the script path)`
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

            const azure = createAzure({
                resourceName: env.AZURE_RESOURCE_NAME,
                apiKey: env.AZURE_API_KEY,
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
                            env.AZURE_DEPLOYMENT_NAME ?? 'gpt-5.2-chat'
                        ),
                        system: buildSystemPrompt(server.config.root),
                        tools: {
                            create_script: createScriptTool,
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
