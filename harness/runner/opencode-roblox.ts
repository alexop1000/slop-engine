import { templateDir } from '../paths'
import { OpencodeDriver } from './opencode-driver'
import type { ScenarioRunner } from './types'

/**
 * Roblox scenario runner. The Roblox Studio MCP server is installed locally
 * (via Studio's "install MCP" action) and exposed at
 * `%LOCALAPPDATA%\Roblox\mcp.bat`. We launch it via `cmd.exe /c` so cmd
 * expands the `%LOCALAPPDATA%` env var at spawn time. The server name
 * `Roblox_Studio` matches what Studio's MCP plugin advertises — tools land
 * in the agent's toolset under that namespace.
 *
 * If you install the MCP on a non-Windows machine or to a different path,
 * override this command. The driver's `buildOpencodeConfig` writes the block
 * verbatim into the generated `opencode.json`.
 */
export class OpencodeRobloxRunner
    extends OpencodeDriver
    implements ScenarioRunner
{
    constructor() {
        super({
            templateDir: templateDir('opencode-roblox'),
            mcp: {
                Roblox_Studio: {
                    type: 'local',
                    command: [
                        'cmd.exe',
                        '/c',
                        '%LOCALAPPDATA%\\Roblox\\mcp.bat',
                    ],
                    enabled: true,
                },
            },
        })
    }
}
