import { createSignal } from 'solid-js'
import { makePersisted } from '@solid-primitives/storage'

export type AIProvider = 'azure' | 'openrouter' | 'google'

export type AgentType =
    | 'orchestrator'
    | 'scene'
    | 'script'
    | 'ui'
    | 'asset'
    | 'test'

export interface ModelCredentials {
    azureApiKey?: string
    azureResourceName?: string
    openrouterApiKey?: string
    googleApiKey?: string
}

export interface ModelSettings {
    provider: AIProvider
    models: Record<AgentType, string>
    providerModels: Record<AIProvider, Record<AgentType, string>>
    credentials: ModelCredentials
}

const DEFAULT_MODELS: Record<AgentType, string> = {
    orchestrator: 'gpt-5.3-chat',
    scene: 'gpt-5.4-mini',
    script: 'gpt-5.4-mini',
    ui: 'gpt-5.4-mini',
    asset: 'gpt-5.4-mini',
    test: 'gpt-5.4-mini',
}

const DEFAULT_OPENROUTER_MODELS: Record<AgentType, string> = {
    orchestrator: 'anthropic/claude-4.6-sonnet',
    scene: 'google/gemini-3.1-pro-preview',
    script: 'anthropic/claude-4.6-sonnet',
    ui: 'google/gemini-3.1-pro-preview',
    asset: 'openai/gpt-5.3-chat',
    test: 'openai/gpt-5.3-chat',
}

const DEFAULT_GOOGLE_MODELS: Record<AgentType, string> = {
    orchestrator: 'gemini-3.1-pro-preview',
    scene: 'gemini-3.1-pro-preview',
    script: 'gemini-3.1-pro-preview',
    ui: 'gemini-3.1-pro-preview',
    asset: 'gemini-3.1-pro-preview',
    test: 'gemini-3.1-pro-preview',
}

export const AGENT_LABELS: Record<AgentType, string> = {
    orchestrator: 'Orchestrator',
    scene: 'Scene Builder',
    script: 'Script Agent',
    ui: 'UI Agent',
    asset: 'Asset Generator',
    test: 'Test Agent',
}

const ALL_AGENT_TYPES: AgentType[] = [
    'orchestrator',
    'scene',
    'script',
    'ui',
    'asset',
    'test',
]

const ALL_PROVIDERS: AIProvider[] = ['azure', 'openrouter', 'google']

const normalizeModelsForProvider = (
    provider: AIProvider,
    models: Partial<Record<AgentType, string>> | undefined
): Record<AgentType, string> => {
    const defaults = getDefaultModels(provider)
    const normalized = { ...defaults }

    for (const at of ALL_AGENT_TYPES) {
        const value = models?.[at]?.trim()
        if (value) normalized[at] = value
    }

    return normalized
}

/** Merge persisted settings so new agent types get default model IDs. */
export function normalizeModelSettings(settings: ModelSettings): ModelSettings {
    const provider = settings.provider
    const providerModels = {} as Record<AIProvider, Record<AgentType, string>>

    for (const p of ALL_PROVIDERS) {
        providerModels[p] = normalizeModelsForProvider(
            p,
            settings.providerModels?.[p]
        )
    }

    providerModels[provider] = normalizeModelsForProvider(provider, settings.models)
    const models = { ...providerModels[provider] }

    return { ...settings, models, providerModels }
}

export function getDefaultModels(
    provider: AIProvider
): Record<AgentType, string> {
    return ALL_AGENT_TYPES.reduce(
        (acc, at) => ({
            ...acc,
            [at]: getDefaultModel(provider, at),
        }),
        {} as Record<AgentType, string>
    )
}

export function getDefaultModel(
    provider: AIProvider,
    agentType: AgentType
): string {
    if (provider === 'openrouter') return DEFAULT_OPENROUTER_MODELS[agentType]
    if (provider === 'google') return DEFAULT_GOOGLE_MODELS[agentType]
    return DEFAULT_MODELS[agentType]
}

export const [modelSettings, setModelSettings] = makePersisted(
    createSignal<ModelSettings>({
        provider: 'azure',
        models: { ...DEFAULT_MODELS },
        providerModels: {
            azure: { ...DEFAULT_MODELS },
            openrouter: { ...DEFAULT_OPENROUTER_MODELS },
            google: { ...DEFAULT_GOOGLE_MODELS },
        },
        credentials: {},
    }),
    { name: 'slop-ai-model-settings' }
)
