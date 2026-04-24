import { templateDir } from '../paths'
import { OpencodeDriver } from './opencode-driver'
import type { ScenarioRunner } from './types'

export class OpencodeRobloxRunner
    extends OpencodeDriver
    implements ScenarioRunner
{
    constructor() {
        super({
            templateDir: templateDir('opencode-roblox'),
            mcp: {
                'roblox-studio': {
                    type: 'local',
                    command: ['npx', '-y', '@roblox/studio-mcp'],
                    enabled: true,
                },
            },
        })
    }
}
