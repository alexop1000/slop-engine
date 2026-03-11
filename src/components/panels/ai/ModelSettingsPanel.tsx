import { For } from 'solid-js'
import { Select, Input } from '../../ui'
import {
    modelSettings,
    setModelSettings,
    getDefaultModel,
    type AIProvider,
    type AgentType,
    AGENT_LABELS,
} from '../../../modelSettingsStore'

const PROVIDER_OPTIONS: { value: AIProvider; label: string }[] = [
    { value: 'azure', label: 'Azure OpenAI' },
    { value: 'openrouter', label: 'OpenRouter' },
]

const AGENT_TYPES: AgentType[] = [
    'orchestrator',
    'scene',
    'script',
    'ui',
    'asset',
]

export function ModelSettingsPanel() {
    const setProvider = (provider: AIProvider) => {
        setModelSettings((prev) => ({
            ...prev,
            provider,
            models: AGENT_TYPES.reduce(
                (acc, at) => ({
                    ...acc,
                    [at]: getDefaultModel(provider, at),
                }),
                {} as Record<AgentType, string>
            ),
        }))
    }

    const setModel = (agentType: AgentType, model: string) => {
        setModelSettings((prev) => ({
            ...prev,
            models: { ...prev.models, [agentType]: model },
        }))
    }

    const placeholder = () =>
        modelSettings().provider === 'openrouter'
            ? 'e.g. anthropic/claude-3.5-sonnet'
            : 'e.g. gpt-4o (deployment name)'

    return (
        <div class="flex flex-col gap-3">
            <Select
                    label="Provider"
                    options={PROVIDER_OPTIONS}
                    value={modelSettings().provider}
                    onChange={(e) =>
                        setProvider(e.currentTarget.value as AIProvider)
                    }
                />
                <For each={AGENT_TYPES}>
                    {(agentType) => (
                        <Input
                            label={AGENT_LABELS[agentType]}
                            value={modelSettings().models[agentType]}
                            onInput={(e) => setModel(agentType, e.currentTarget.value)}
                            placeholder={placeholder()}
                            class="text-sm"
                        />
                    )}
                </For>
        </div>
    )
}
