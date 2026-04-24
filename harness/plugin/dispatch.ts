import { OpencodePlainRunner } from '../runner/opencode-plain'
import { OpencodeRobloxRunner } from '../runner/opencode-roblox'
import type { ScenarioRunner } from '../runner/types'
import type { ScenarioId } from '../types'

export function createRunner(scenario: ScenarioId): ScenarioRunner {
    if (scenario === 'opencode-plain') return new OpencodePlainRunner()
    if (scenario === 'opencode-roblox') return new OpencodeRobloxRunner()
    // The 'slop' scenario is handled at the route level (no runner spawned).
    throw new Error(`no runner registered for scenario: ${scenario}`)
}
