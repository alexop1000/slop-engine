import { templateDir } from '../paths'
import { OpencodeDriver } from './opencode-driver'
import type { ScenarioRunner } from './types'

export class OpencodePlainRunner
    extends OpencodeDriver
    implements ScenarioRunner
{
    constructor() {
        super({ templateDir: templateDir('opencode-plain') })
    }
}
