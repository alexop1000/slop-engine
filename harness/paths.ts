import { resolve, join, relative, sep } from 'node:path'
import {
    mkdirSync,
    existsSync,
    readFileSync,
    writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'

import type { GameId, HarnessConfig, ScenarioId, GamePromptSpec } from './types'

export const HARNESS_ROOT = resolve(import.meta.dir)
export const DB_PATH = join(HARNESS_ROOT, 'harness.db')
export const CONFIG_PATH = join(HARNESS_ROOT, 'config.json')
export const PROMPTS_DIR = join(HARNESS_ROOT, 'prompts')
export const TEMPLATES_DIR = join(HARNESS_ROOT, 'templates')
export const ENGINE_REPO_ROOT = resolve(HARNESS_ROOT, '..')

let cachedRunsRoot: string | null = null

/**
 * Resolve the per-run artifacts root. Reads `runsDir` from config.json (with
 * env-var expansion) if set; falls back to `<homedir>/.slop-harness/runs`.
 * Refuses any path inside the slop-engine repo — opencode would otherwise
 * discover the repo as its workspace and edit engine source.
 */
export function runsRoot(): string {
    if (cachedRunsRoot) return cachedRunsRoot
    let resolved: string
    try {
        const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
        const expanded = expandEnvVars(raw) as { runsDir?: unknown }
        const configured =
            typeof expanded.runsDir === 'string' && expanded.runsDir.trim()
                ? expanded.runsDir.trim()
                : null
        resolved = configured
            ? resolve(configured)
            : join(homedir(), '.slop-harness', 'runs')
    } catch {
        resolved = join(homedir(), '.slop-harness', 'runs')
    }
    assertOutsideRepo(resolved)
    cachedRunsRoot = resolved
    return cachedRunsRoot
}

/** Fail loud if the configured runs dir sits inside the engine repo. */
function assertOutsideRepo(candidate: string): void {
    const rel = relative(ENGINE_REPO_ROOT, candidate)
    const inside = rel !== '' && !rel.startsWith(`..${sep}`) && !rel.startsWith('..')
    if (inside || rel === '') {
        throw new Error(
            `harness runsDir must not be inside the slop-engine repo (${candidate}). ` +
                `Opencode walks up looking for git roots and would treat the whole engine as its workspace. ` +
                `Set runsDir in harness/config.json to a path outside the repo, e.g. \${USERPROFILE}/.slop-harness/runs.`
        )
    }
}

export function runDir(runId: string): string {
    return join(runsRoot(), runId)
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

/**
 * Prepare a run's directory tree. Creates `runs/<id>/artifact/` and drops a
 * zero-commit `.git` folder inside the artifact dir. That `.git` is a hard
 * project-root boundary for opencode: even if the user's `runsDir` ever ends
 * up nested inside some other git repo, opencode's upward walk will stop
 * right here instead of escaping into parent checkouts.
 */
export function ensureRunDir(runId: string): void {
    const art = artifactDir(runId)
    mkdirSync(art, { recursive: true })
    const gitDir = join(art, '.git')
    if (!existsSync(gitDir)) {
        mkdirSync(gitDir, { recursive: true })
        // Minimal .git contents so any git-root detector recognizes it. We
        // don't want a working git repo, just the marker directory.
        writeFileSync(
            join(gitDir, 'HEAD'),
            'ref: refs/heads/harness-isolation-boundary\n'
        )
        writeFileSync(
            join(gitDir, 'config'),
            '[core]\n\trepositoryformatversion = 0\n'
        )
        mkdirSync(join(gitDir, 'objects'), { recursive: true })
        mkdirSync(join(gitDir, 'refs'), { recursive: true })
    }
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
