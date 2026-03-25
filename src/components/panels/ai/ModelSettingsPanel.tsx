import { For, Show, createSignal } from 'solid-js'
import { Select, Input, Button, Collapsible } from '../../ui'
import {
    modelSettings,
    setModelSettings,
    getDefaultModel,
    getDefaultModels,
    type AIProvider,
    type AgentType,
    AGENT_LABELS,
} from '../../../modelSettingsStore'

const PROVIDER_OPTIONS: { value: AIProvider; label: string }[] = [
    { value: 'azure', label: 'Azure OpenAI' },
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'google', label: 'Google AI Studio (Gemini)' },
]

const AGENT_TYPES: AgentType[] = [
    'orchestrator',
    'scene',
    'script',
    'ui',
    'asset',
    'test',
]

export function ModelSettingsPanel() {
    const [showAzureKey, setShowAzureKey] = createSignal(false)
    const [showOpenRouterKey, setShowOpenRouterKey] = createSignal(false)
    const [showGoogleKey, setShowGoogleKey] = createSignal(false)

    const setProvider = (provider: AIProvider) => {
        setModelSettings((prev) => {
            const currentProvider = prev.provider
            const nextProviderModels = {
                ...prev.providerModels,
                [currentProvider]: { ...prev.models },
            }
            const nextModels = nextProviderModels[provider]
                ? { ...nextProviderModels[provider] }
                : getDefaultModels(provider)

            nextProviderModels[provider] = { ...nextModels }

            return {
                ...prev,
                provider,
                models: nextModels,
                providerModels: nextProviderModels,
            }
        })
    }

    const setModel = (agentType: AgentType, model: string) => {
        setModelSettings((prev) => {
            const nextModels = { ...prev.models, [agentType]: model }
            return {
                ...prev,
                models: nextModels,
                providerModels: {
                    ...prev.providerModels,
                    [prev.provider]: nextModels,
                },
            }
        })
    }

    const resetModelsToDefault = () => {
        setModelSettings((prev) => {
            const defaultModels = getDefaultModels(prev.provider)
            return {
                ...prev,
                models: defaultModels,
                providerModels: {
                    ...prev.providerModels,
                    [prev.provider]: defaultModels,
                },
            }
        })
    }

    const setCredential = (
        key:
            | 'azureApiKey'
            | 'azureResourceName'
            | 'openrouterApiKey'
            | 'googleApiKey',
        value: string
    ) => {
        setModelSettings((prev) => ({
            ...prev,
            credentials: {
                ...(prev.credentials ?? {}),
                [key]: value,
            },
        }))
    }

    const placeholder = () =>
        modelSettings().provider === 'openrouter'
            ? 'e.g. anthropic/claude-4.6-sonnet'
            : modelSettings().provider === 'google'
              ? 'e.g. gemini-3.1-pro-preview'
              : 'e.g. gpt-5.3-chat (deployment name)'

    const selectedProvider = () => modelSettings().provider

    const credentials = () => modelSettings().credentials ?? {}

    return (
        <div class="flex flex-col gap-3">
            <Select
                label="Provider"
                options={PROVIDER_OPTIONS}
                value={modelSettings().provider}
                autocomplete="off"
                onChange={(e) =>
                    setProvider(e.currentTarget.value as AIProvider)
                }
            />

            <Collapsible
                title="Credentials"
                defaultOpen={false}
                class="rounded-md border border-gray-200 dark:border-gray-700 px-3"
                headerClass="py-2"
                contentClass="pb-3"
            >
                <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    API keys are stored locally in your browser for this
                    workspace.
                </p>

                <Show when={selectedProvider() === 'azure'}>
                    <div class="rounded-md border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-2">
                        <div class="text-sm font-medium text-gray-800 dark:text-gray-100">
                            Azure credentials
                        </div>
                        <Input
                            label="Azure Resource Name"
                            value={credentials().azureResourceName ?? ''}
                            autocomplete="off"
                            onInput={(e) =>
                                setCredential(
                                    'azureResourceName',
                                    e.currentTarget.value
                                )
                            }
                            placeholder="e.g. my-openai-resource"
                            hint="Resource name from https://{resource}.openai.azure.com"
                        />
                        <div class="flex items-end gap-2">
                            <Input
                                label="Azure API Key"
                                type={showAzureKey() ? 'text' : 'password'}
                                value={credentials().azureApiKey ?? ''}
                                autocomplete="off"
                                onInput={(e) =>
                                    setCredential(
                                        'azureApiKey',
                                        e.currentTarget.value
                                    )
                                }
                                placeholder="Enter Azure OpenAI API key"
                                class="text-sm"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAzureKey((prev) => !prev)}
                                class="mb-0.5"
                            >
                                {showAzureKey() ? 'Hide' : 'Show'}
                            </Button>
                        </div>
                    </div>
                </Show>

                <Show when={selectedProvider() === 'openrouter'}>
                    <div class="rounded-md border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-2">
                        <div class="text-sm font-medium text-gray-800 dark:text-gray-100">
                            OpenRouter credentials
                        </div>
                        <div class="flex items-end gap-2">
                            <Input
                                label="OpenRouter API Key"
                                type={showOpenRouterKey() ? 'text' : 'password'}
                                value={credentials().openrouterApiKey ?? ''}
                                autocomplete="off"
                                onInput={(e) =>
                                    setCredential(
                                        'openrouterApiKey',
                                        e.currentTarget.value
                                    )
                                }
                                placeholder="Enter OpenRouter API key"
                                class="text-sm"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    setShowOpenRouterKey((prev) => !prev)
                                }
                                class="mb-0.5"
                            >
                                {showOpenRouterKey() ? 'Hide' : 'Show'}
                            </Button>
                        </div>
                    </div>
                </Show>

                <Show when={selectedProvider() === 'google'}>
                    <div class="rounded-md border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-2">
                        <div class="text-sm font-medium text-gray-800 dark:text-gray-100">
                            Google AI Studio credentials
                        </div>
                        <div class="flex items-end gap-2">
                            <Input
                                label="Google API Key"
                                type={showGoogleKey() ? 'text' : 'password'}
                                value={credentials().googleApiKey ?? ''}
                                autocomplete="off"
                                onInput={(e) =>
                                    setCredential(
                                        'googleApiKey',
                                        e.currentTarget.value
                                    )
                                }
                                placeholder="Enter Google AI Studio API key"
                                class="text-sm"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    setShowGoogleKey((prev) => !prev)
                                }
                                class="mb-0.5"
                            >
                                {showGoogleKey() ? 'Hide' : 'Show'}
                            </Button>
                        </div>
                    </div>
                </Show>
            </Collapsible>

            <For each={AGENT_TYPES}>
                {(agentType) => (
                    <Input
                        label={AGENT_LABELS[agentType]}
                        value={
                            modelSettings().models[agentType] ??
                            getDefaultModel(modelSettings().provider, agentType)
                        }
                        autocomplete="off"
                        onInput={(e) =>
                            setModel(agentType, e.currentTarget.value)
                        }
                        placeholder={placeholder()}
                        class="text-sm"
                    />
                )}
            </For>
            <div class="flex justify-end">
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={resetModelsToDefault}
                >
                    Reset models to default
                </Button>
            </div>
        </div>
    )
}
