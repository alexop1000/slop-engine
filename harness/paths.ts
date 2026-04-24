import { resolve, join } from 'node:path'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'

import type { GameId, HarnessConfig, ScenarioId, GamePromptSpec } from './types'

export const HARNESS_ROOT = resolve(import.meta.dir)
export const DB_PATH = join(HARNESS_ROOT, 'harness.db')
export const CONFIG_PATH = join(HARNESS_ROOT, 'config.json')
export const RUNS_DIR = join(HARNESS_ROOT, 'runs')
export const PROMPTS_DIR = join(HARNESS_ROOT, 'prompts')
export const TEMPLATES_DIR = join(HARNESS_ROOT, 'templates')

export function runDir(runId: string): string {
    return join(RUNS_DIR, runId)
}

export function eventsPath(runId: string): string {
    return join(runDir(runId), 'events.ndjson')
}

export function metaPath(runId: string): string {
    return join(runDir(runId), 'meta.json')
}

export function artifactDir(runId: string): string {
    return join(runDir(runId), 'artifact')
}

export function templateDir(scenario: ScenarioId): string {
    return join(TEMPLATES_DIR, scenario)
}

export function ensureRunDir(runId: string): void {
    mkdirSync(artifactDir(runId), { recursive: true })
}

function expandEnvVars(value: unknown): unknown {
    if (typeof value === 'string') {
        return value.replace(
            /\$\{([A-Z_][A-Z0-9_]*)\}/g,
            (_m, name: string) => process.env[name] ?? ''
        )
    }
    if (Array.isArray(value)) return value.map(expandEnvVars)
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(value)) out[k] = expandEnvVars(v)
        return out
    }
    return value
}

export function loadConfig(): HarnessConfig {
    if (!existsSync(CONFIG_PATH)) {
        throw new Error(`Missing harness config at ${CONFIG_PATH}`)
    }
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
    const expanded = expandEnvVars(raw) as HarnessConfig
    if (expanded.provider === 'azure') {
        const az = expanded.azure
        if (!az || !az.resourceName || !az.apiKey || !az.deployment) {
            throw new Error(
                'Azure provider selected but resourceName/apiKey/deployment are missing or empty. ' +
                    'Check that AZURE_OPENAI_RESOURCE_NAME, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT are set in .env.'
            )
        }
    } else if (expanded.provider === 'lmstudio') {
        const lm = expanded.lmstudio
        if (!lm || !lm.baseUrl || !lm.modelId) {
            throw new Error(
                'LM Studio provider selected but baseUrl/modelId are missing.'
            )
        }
    }
    return expanded
}

export function loadPromptSpec(game: GameId): GamePromptSpec {
    const path = join(PROMPTS_DIR, `${game}.json`)
    if (!existsSync(path)) {
        throw new Error(`Missing prompt spec at ${path}`)
    }
    return JSON.parse(readFileSync(path, 'utf-8')) as GamePromptSpec
}

export function buildInitialPrompt(
    game: GameId,
    scenario: ScenarioId
): string {
    const spec = loadPromptSpec(game)
    const prefix = spec.perScenario[scenario] ?? ''
    return `${prefix}${spec.base}`
}

export function generateRunId(
    game: GameId,
    scenario: ScenarioId,
    runNumber: number
): string {
    const d = new Date()
    const pad = (n: number, w = 2) => String(n).padStart(w, '0')
    const stamp =
        `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
        `T${pad(d.getHours())}${pad(d.getMinutes())}`
    return `${stamp}-${game}-${scenario}-${runNumber}`
}
