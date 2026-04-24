import type {
    AwaitingInputKind,
    GameId,
    HarnessConfig,
    RunEvent,
    ScenarioId,
} from '../types'

export interface RunContext {
    runId: string
    game: GameId
    scenario: ScenarioId
    initialPrompt: string
    artifactDir: string
    config: HarnessConfig
}

export type EmitEvent = (e: RunEvent) => void

export interface NudgePayload {
    text: string
    kind: AwaitingInputKind
    cardChoice?: string
}

export interface ScenarioRunner {
    start(ctx: RunContext, emit: EmitEvent): Promise<void>
    nudge(payload: NudgePayload): Promise<void>
    stop(): Promise<void>
    abort(): Promise<void>
}
