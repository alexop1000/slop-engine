import type { ScenarioRunner } from '../runner/types'

const active = new Map<string, ScenarioRunner>()

export function registerRunner(runId: string, runner: ScenarioRunner): void {
    active.set(runId, runner)
}

export function getRunner(runId: string): ScenarioRunner | undefined {
    return active.get(runId)
}

export function dropRunner(runId: string): void {
    active.delete(runId)
}

export function listActiveRunIds(): string[] {
    return Array.from(active.keys())
}
