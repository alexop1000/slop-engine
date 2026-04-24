/**
 * Opencode integration spike.
 *
 * Verifies that `opencode run --format json --session <id>` supports
 * continuing a previous session programmatically — the core requirement for
 * OpencodeRunner's multi-turn flow in the harness.
 *
 * Usage:
 *   1. Start LM Studio with the model from harness/config.json loaded.
 *   2. Run: `bun harness/scripts/spike-opencode.ts`
 *
 * Success: prints OK and exits 0 after two turns in one session.
 * Failure: prints what went wrong and exits 1.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadConfig } from '../paths'

interface OpencodeEvent {
    type: string
    timestamp: number
    sessionID?: string
    [k: string]: unknown
}

async function runTurn(options: {
    cwd: string
    message: string
    sessionId?: string
    modelId: string
}): Promise<{ events: OpencodeEvent[]; sessionId: string | undefined }> {
    const args = ['run', '--format', 'json', '--model', options.modelId]
    if (options.sessionId) args.push('--session', options.sessionId)
    args.push(options.message)

    return new Promise((resolve, reject) => {
        const proc = spawn('opencode', args, {
            cwd: options.cwd,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true,
        })

        const events: OpencodeEvent[] = []
        let stderr = ''
        let stdoutBuf = ''
        let sessionId = options.sessionId

        proc.stdout.on('data', (chunk: Buffer) => {
            stdoutBuf += chunk.toString('utf-8')
            let nl: number
            while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
                const line = stdoutBuf.slice(0, nl).trim()
                stdoutBuf = stdoutBuf.slice(nl + 1)
                if (!line) continue
                try {
                    const ev = JSON.parse(line) as OpencodeEvent
                    events.push(ev)
                    if (ev.sessionID && !sessionId) sessionId = ev.sessionID
                } catch {
                    // Non-JSON lines — opencode sometimes prints a banner.
                }
            }
        })
        proc.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf-8')
        })
        proc.on('error', reject)
        proc.on('close', (code) => {
            if (code !== 0) {
                reject(
                    new Error(
                        `opencode exited ${code}\n--- stderr ---\n${stderr}\n--- events ---\n${events
                            .map((e) => JSON.stringify(e))
                            .join('\n')}`
                    )
                )
                return
            }
            resolve({ events, sessionId })
        })
    })
}

async function main(): Promise<void> {
    const config = loadConfig()
    const workspace = mkdtempSync(join(tmpdir(), 'opencode-spike-'))
    console.error(`[spike] workspace: ${workspace}`)

    let provider: Record<string, unknown>
    let modelId: string
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
        modelId = `azure/${config.azure.deployment}`
    } else if (config.provider === 'lmstudio' && config.lmstudio) {
        provider = {
            lmstudio: {
                npm: '@ai-sdk/openai-compatible',
                name: 'LM Studio',
                options: { baseURL: config.lmstudio.baseUrl },
                models: { [config.lmstudio.modelId]: {} },
            },
        }
        modelId = `lmstudio/${config.lmstudio.modelId}`
    } else {
        throw new Error(`provider not configured: ${config.provider}`)
    }

    writeFileSync(
        join(workspace, 'opencode.json'),
        JSON.stringify(
            {
                $schema: 'https://opencode.ai/config.json',
                provider,
                model: modelId,
            },
            null,
            2
        )
    )

    try {
        console.error('[spike] turn 1 — starting new session')
        const turn1 = await runTurn({
            cwd: workspace,
            message: 'Reply with exactly the word ALPHA and stop.',
            modelId,
        })
        if (!turn1.sessionId) {
            throw new Error('turn 1 did not return a sessionID')
        }
        console.error(
            `[spike] turn 1 ok — session=${turn1.sessionId} events=${turn1.events.length}`
        )

        console.error('[spike] turn 2 — continuing same session')
        const turn2 = await runTurn({
            cwd: workspace,
            sessionId: turn1.sessionId,
            message: 'Reply with exactly the word BETA and stop.',
            modelId,
        })
        console.error(
            `[spike] turn 2 ok — session=${turn2.sessionId} events=${turn2.events.length}`
        )

        if (turn2.sessionId !== turn1.sessionId) {
            throw new Error(
                `session id changed across turns: ${turn1.sessionId} -> ${turn2.sessionId}`
            )
        }

        console.log('OK: two-turn session continuation works')
        const uniqueTypes = Array.from(
            new Set(
                [...turn1.events, ...turn2.events].map((e) => e.type)
            )
        ).sort()
        console.log(`event types observed: ${uniqueTypes.join(', ')}`)
    } catch (e) {
        console.error(
            '[spike] FAILED:',
            e instanceof Error ? e.message : String(e)
        )
        process.exitCode = 1
    } finally {
        rmSync(workspace, { recursive: true, force: true })
    }
}

await main()
