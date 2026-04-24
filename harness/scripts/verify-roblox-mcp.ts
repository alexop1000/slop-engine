// Ad-hoc verification that the opencode.json written by OpencodeRobloxRunner
// is shaped correctly for opencode's config parser. Run with:
//   bun harness/scripts/verify-roblox-mcp.ts
// Then from the printed directory:  `cd <dir> && opencode mcp list`

import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { OpencodeRobloxRunner } from '../runner/opencode-roblox'

const r = new OpencodeRobloxRunner() as unknown as {
    options: { mcp?: Record<string, unknown> }
}
const mcp = r.options.mcp

const dir = mkdtempSync(join(tmpdir(), 'verify-roblox-mcp-'))
const config = {
    $schema: 'https://opencode.ai/config.json',
    provider: {
        azure: {
            npm: '@ai-sdk/azure',
            name: 'Azure OpenAI',
            options: { resourceName: 'dummy', apiKey: 'dummy' },
            models: { 'dummy-deployment': {} },
        },
    },
    model: 'azure/dummy-deployment',
    mcp,
}
writeFileSync(join(dir, 'opencode.json'), JSON.stringify(config, null, 2))
console.log(`wrote opencode.json to: ${dir}`)
console.log(`run:  cd "${dir}" && opencode mcp list`)
