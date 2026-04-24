import { spawn, type ChildProcess } from 'node:child_process'
import {
    appendFileSync,
    copyFileSync,
    mkdirSync,
    readdirSync,
    statSync,
    writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import type { HarnessConfig } from '../types'
import type { EmitEvent, NudgePayload, RunContext, ScenarioRunner } from './types'
import { parseOpencodeEvent, type OpencodeEvent } from './opencode-events'

export interface OpencodeDriverOptions {
    templateDir: string
    /** Optional MCP block merged into the generated opencode.json. */
    mcp?: Record<string, unknown>
}

/**
 * Shared implementation for scenarios that drive opencode as a subprocess.
 * Subclasses (plain and roblox) differ only in which template dir they use;
 * the MCP config comes from the template's `opencode.json`.
 */
export class OpencodeDriver implements ScenarioRunner {
    private emit: EmitEvent | null = null
    private ctx: RunContext | null = null
    private iterationIndex = -1
    private sessionId: string | undefined
    private activeChild: ChildProcess | null = null
    private aborted = false

    constructor(private readonly options: OpencodeDriverOptions) {}

    async start(ctx: RunContext, emit: EmitEvent): Promise<void> {
        this.ctx = ctx
        this.emit = emit
        copyTemplate(this.options.templateDir, ctx.artifactDir)
        writeFileSync(
            join(ctx.artifactDir, 'opencode.json'),
            buildOpencodeConfig(ctx.config, this.options.mcp)
        )
        await this.runTurn('initial', ctx.initialPrompt)
    }

    async nudge(payload: NudgePayload): Promise<void> {
        if (!this.ctx || !this.emit) return
        if (this.activeChild) {
            throw new Error('cannot nudge while an iteration is running')
        }
        const kindMap = {
            free_text: 'nudge',
            clarification_cards: 'clarification',
            plan_approval: 'plan_approval',
        } as const
        const prompt = payload.text || payload.cardChoice || ''
        await this.runTurn(kindMap[payload.kind], prompt)
    }

    async stop(): Promise<void> {
        this.cleanup()
        this.emit?.({
            t: Date.now(),
            type: 'run_stopped',
            reason: 'user',
        })
    }

    async abort(): Promise<void> {
        this.aborted = true
        this.cleanup()
        this.emit?.({
            t: Date.now(),
            type: 'run_stopped',
            reason: 'error',
            error: 'aborted',
        })
    }

    private cleanup(): void {
        if (this.activeChild) {
            try {
                this.activeChild.kill()
            } catch {
                // already exited
            }
            this.activeChild = null
        }
    }

    private runTurn(
        kind: 'initial' | 'nudge' | 'clarification' | 'plan_approval',
        prompt: string
    ): Promise<void> {
        const ctx = this.ctx
        const emit = this.emit
        if (!ctx || !emit) return Promise.resolve()
        this.iterationIndex += 1
        const iteration = this.iterationIndex
        const modelLiteral = modelLiteralFor(ctx.config)

        emit({
            t: Date.now(),
            type: 'iteration_started',
            index: iteration,
            kind,
            prompt,
        })

        const args = [
            'run',
            '--format',
            'json',
            '--model',
            modelLiteral,
        ]
        if (this.sessionId) {
            args.push('--session', this.sessionId)
        }
        args.push(prompt)

        return new Promise<void>((resolve) => {
            const proc = spawn('opencode', args, {
                cwd: ctx.artifactDir,
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true,
            })
            this.activeChild = proc
            let stdoutBuf = ''

            proc.stdout?.on('data', (chunk: Buffer) => {
                stdoutBuf += chunk.toString('utf-8')
                let nl: number
                while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
                    const line = stdoutBuf.slice(0, nl).trim()
                    stdoutBuf = stdoutBuf.slice(nl + 1)
                    if (!line) continue
                    this.ingestLine(line, iteration, modelLiteral)
                }
            })
            proc.stderr?.on('data', (chunk: Buffer) => {
                const text = chunk.toString('utf-8').trim()
                if (text) {
                    emit({
                        t: Date.now(),
                        type: 'text_chunk',
                        iteration,
                        text: `[stderr] ${text}`,
                    })
                }
            })
            proc.on('error', (err) => {
                emit({
                    t: Date.now(),
                    type: 'text_chunk',
                    iteration,
                    text: `[spawn error] ${err.message}`,
                })
            })
            proc.on('close', (code) => {
                this.activeChild = null
                if (stdoutBuf.trim()) {
                    this.ingestLine(stdoutBuf.trim(), iteration, modelLiteral)
                    stdoutBuf = ''
                }
                emit({
                    t: Date.now(),
                    type: 'iteration_ended',
                    index: iteration,
                })
                if (this.aborted) {
                    resolve()
                    return
                }
                if (code !== 0) {
                    emit({
                        t: Date.now(),
                        type: 'text_chunk',
                        iteration,
                        text: `[opencode exited ${code}]`,
                    })
                }
                emit({
                    t: Date.now(),
                    type: 'awaiting_input',
                    iteration,
                    kind: 'free_text',
                })
                resolve()
            })
        })
    }

    private ingestLine(
        line: string,
        iteration: number,
        modelId: string
    ): void {
        const emit = this.emit
        const ctx = this.ctx
        if (!emit || !ctx) return

        // Raw dump for post-mortem analysis of opencode's event shapes.
        try {
            const rawPath = join(
                dirname(ctx.artifactDir),
                'opencode-raw.ndjson'
            )
            appendFileSync(rawPath, `${line}\n`)
        } catch {
            // Non-fatal.
        }

        let ev: OpencodeEvent
        try {
            ev = JSON.parse(line) as OpencodeEvent
        } catch {
            // Non-JSON — opencode can print a short banner before events. Drop.
            return
        }
        const parsed = parseOpencodeEvent(ev, { iteration, modelId })
        if (parsed.sessionId && !this.sessionId) {
            this.sessionId = parsed.sessionId
        }
        for (const re of parsed.runEvents) {
            emit(re)
        }
    }
}

function copyTemplate(src: string, dst: string): void {
    mkdirSync(dst, { recursive: true })
    for (const name of readdirSync(src)) {
        const s = join(src, name)
        const d = join(dst, name)
        const st = statSync(s)
        if (st.isDirectory()) {
            copyTemplate(s, d)
        } else {
            copyFileSync(s, d)
        }
    }
}

function modelLiteralFor(config: HarnessConfig): string {
    if (config.provider === 'azure' && config.azure) {
        return `azure/${config.azure.deployment}`
    }
    if (config.provider === 'lmstudio' && config.lmstudio) {
        return `lmstudio/${config.lmstudio.modelId}`
    }
    throw new Error(`harness config provider not configured: ${config.provider}`)
}

function buildOpencodeConfig(
    config: HarnessConfig,
    mcp?: Record<string, unknown>
): string {
    let provider: Record<string, unknown>
    let model: string
    if (config.provider === 'azure' && config.azure) {
        provider = {
            azure: {
                npm: '@ai-sdk/azure',
                name: 'Azure OpenAI',
                options: {
                    resourceName: config.azure.resourceName,
                    apiKey: config.azure.apiKey,
                    ...(config.azure.apiVersion
                        ? { apiVersion: config.azure.apiVersion }
                        : {}),
                },
                models: { [config.azure.deployment]: {} },
            },
        }
        model = `azure/${config.azure.deployment}`
    } else if (config.provider === 'lmstudio' && config.lmstudio) {
        provider = {
            lmstudio: {
                npm: '@ai-sdk/openai-compatible',
                name: 'LM Studio',
                options: { baseURL: config.lmstudio.baseUrl },
                models: { [config.lmstudio.modelId]: {} },
            },
        }
        model = `lmstudio/${config.lmstudio.modelId}`
    } else {
        throw new Error(
            `harness config provider not configured: ${config.provider}`
        )
    }

    const out: Record<string, unknown> = {
        $schema: 'https://opencode.ai/config.json',
        provider,
        model,
    }
    if (mcp) out.mcp = mcp
    return `${JSON.stringify(out, null, 2)}\n`
}
