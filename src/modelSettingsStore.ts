import { createSignal } from 'solid-js'
import { makePersisted } from '@solid-primitives/storage'

export type AIProvider = 'azure' | 'openrouter' | 'google'

export type AgentType = 'orchestrator' | 'scene' | 'script' | 'ui' | 'asset'

export interface ModelCredentials {
    azureApiKey?: string
    azureResourceName?: string
    openrouterApiKey?: string
    googleApiKey?: string
}

export interface ModelSettings {
    provider: AIProvider
    models: Record<AgentType, string>
    credentials: ModelCredentials
}

const DEFAULT_MODELS: Record<AgentType, string> = {
    orchestrator: 'gpt-5.3-chat',
    scene: 'gpt-5.3-chat',
    script: 'gpt-5.3-chat',
    ui: 'gpt-5.3-chat',
    asset: 'gpt-5.3-chat',
}

const DEFAULT_OPENROUTER_MODELS: Record<AgentType, string> = {
    orchestrator: 'anthropic/claude-4.6-sonnet',
    scene: 'google/gemini-3.1-pro-preview',
    script: 'anthropic/claude-4.6-sonnet',
    ui: 'google/gemini-3.1-pro-preview',
    asset: 'openai/gpt-5.3-chat',
}

const DEFAULT_GOOGLE_MODELS: Record<AgentType, string> = {
    orchestrator: 'gemini-3.1-pro-preview',
    scene: 'gemini-3.1-pro-preview',
    script: 'gemini-3.1-pro-preview',
    ui: 'gemini-3.1-pro-preview',
    asset: 'gemini-3.1-pro-preview',
}

export const AGENT_LABELS: Record<AgentType, string> = {
    orchestrator: 'Orchestrator',
    scene: 'Scene Builder',
    script: 'Script Agent',
    ui: 'UI Agent',
    asset: 'Asset Generator',
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
        credentials: {},
    }),
    { name: 'slop-ai-model-settings' }
)
