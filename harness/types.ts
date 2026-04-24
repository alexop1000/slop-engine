export type GameId = 'dodger' | 'breakout' | 'platformer'
export type ScenarioId = 'slop' | 'opencode-plain' | 'opencode-roblox'
export type RunStatus =
    | 'created'
    | 'running'
    | 'idle'
    | 'stopped'
    | 'graded'

export type IterationKind =
    | 'initial'
    | 'nudge'
    | 'clarification'
    | 'plan_approval'

export type AwaitingInputKind =
    | 'free_text'
    | 'clarification_cards'
    | 'plan_approval'

export type FailureMode = 'none' | 'planning' | 'tool' | 'scope'

export type RunEvent =
    | {
          t: number
          type: 'run_started'
          scenario: ScenarioId
          game: GameId
      }
    | {
          t: number
          type: 'iteration_started'
          index: number
          kind: IterationKind
          prompt: string
      }
    | {
          t: number
          type: 'llm_call'
          iteration: number
          inputTokens: number
          outputTokens: number
          cachedTokens: number
          durationMs: number
          model: string
          finishReason?: string
      }
    | {
          t: number
          type: 'tool_call'
          iteration: number
          toolName: string
          inputPreview: string
          outputPreview?: string
          error?: string
      }
    | {
          t: number
          type: 'text_chunk'
          iteration: number
          text: string
      }
    | {
          t: number
          type: 'awaiting_input'
          iteration: number
          kind: AwaitingInputKind
          payload?: unknown
      }
    | {
          t: number
          type: 'iteration_ended'
          index: number
      }
    | {
          t: number
          type: 'run_stopped'
          reason: 'user' | 'error'
          error?: string
      }

export type RunEventType = RunEvent['type']

export interface RunMeta {
    runId: string
    game: GameId
    scenario: ScenarioId
    runNumber: number
    initialPrompt: string
    nudges: Array<{
        t: number
        kind: IterationKind
        text: string
        cardChoice?: string
    }>
    createdAt: number
    startedAt?: number
    stoppedAt?: number
}

export interface RunSummary {
    totalDurationMs: number
    totalInputTokens: number
    totalOutputTokens: number
    totalCachedTokens: number
    totalIterations: number
    totalToolCalls: number
}

export interface RunRubric {
    movement: 0 | 1
    win: 0 | 1
    lose: 0 | 1
    noCrash: 0 | 1
    failureMode: FailureMode
    notes: string
}

export interface GamePromptSpec {
    base: string
    perScenario: Record<ScenarioId, string>
}

export interface AzureProviderConfig {
    resourceName: string
    apiKey: string
    deployment: string
    apiVersion?: string
}

export interface LmStudioProviderConfig {
    baseUrl: string
    modelId: string
}

export interface HarnessConfig {
    provider: 'azure' | 'lmstudio'
    azure?: AzureProviderConfig
    lmstudio?: LmStudioProviderConfig
}
