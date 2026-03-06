import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DECLARE_RE =
    /^(declare\s+(?:class|interface|function|const)\s+(\w+)|interface\s+(\w+)\s*\{)/m

const BLOCK_DECLARE_RE = /^declare\s+(?:class|interface)\s+\w+|^interface\s+\w+\s*\{/m

/** Map method/term names to the section that defines them */
const TERM_TO_SECTION: Record<string, string> = {
    spawn: 'Script',
    clone: 'Script',
    spawnPrefab: 'Script',
    addPhysics: 'Script',
    destroyNode: 'Script',
    raycast: 'Script',
    raycastAll: 'Script',
    screenRaycast: 'Script',
    onCollision: 'Script',
    onCollisionEnd: 'Script',
    findMesh: 'Script',
    findNode: 'Script',
    createButton: 'GUI',
    createLabel: 'GUI',
    gui: 'GUI',
    input: 'Input',
    vec3: 'vec3',
    rgb: 'rgb',
    physics: 'PhysicsBody',
    collision: 'CollisionEvent',
    raycastall: 'Script',
}

export function parseApiSections(content: string): Map<string, string> {
    const sections = new Map<string, string>()
    const lines = content.split('\n')
    let i = 0

    while (i < lines.length) {
        const line = lines[i]
        const match = line.match(DECLARE_RE)
        if (match) {
            const name = match[2] ?? match[3]
            if (!name) {
                i++
                continue
            }
            const start = i

            if (line.match(BLOCK_DECLARE_RE)) {
                let braceDepth = 0
                let started = false
                for (; i < lines.length; i++) {
                    const l = lines[i]
                    if (l.includes('{')) {
                        braceDepth += (l.match(/{/g) ?? []).length
                        started = true
                    }
                    if (l.includes('}')) braceDepth -= (l.match(/}/g) ?? []).length
                    if (started && braceDepth === 0) {
                        i++
                        break
                    }
                }
            } else {
                i++
            }

            const block = lines.slice(start, i).join('\n')
            if (name === 'Math' && block.length < 100) {
                continue
            }
            sections.set(name, block)
            continue
        }
        i++
    }

    return sections
}

export function lookupScriptingApi(
    content: string,
    topic: string
): string {
    const sections = parseApiSections(content)
    const normalized = topic.trim()
    if (!normalized) {
        return 'Available topics: Script, MeshScript, LightScript, Input, Vector3, Color3, Mesh, PhysicsBody, GUI, GuiButtonHandle, GuiLabelHandle, Scene, Camera, UniversalCamera, raycast, spawn, createButton, createLabel, SpawnOptions, RaycastHit, CollisionEvent, vec3, rgb, Math'
    }

    const exact = [...sections.keys()].find(
        (k) => k.toLowerCase() === normalized.toLowerCase()
    )
    if (exact) {
        return sections.get(exact)!
    }

    const viaTerm = TERM_TO_SECTION[normalized] ?? TERM_TO_SECTION[normalized.toLowerCase()]
    if (viaTerm && sections.has(viaTerm)) {
        return sections.get(viaTerm)!
    }

    const partial = [...sections.keys()].filter((k) =>
        k.toLowerCase().includes(normalized.toLowerCase())
    )
    if (partial.length === 1) {
        return sections.get(partial[0])!
    }
    if (partial.length > 1) {
        return partial
            .map((k) => `// --- ${k} ---\n${sections.get(k)}`)
            .join('\n\n')
    }

    const contains = [...sections.entries()].filter(([, body]) =>
        body.toLowerCase().includes(normalized.toLowerCase())
    )
    if (contains.length > 0 && contains.length <= 3) {
        return contains
            .map(([k, body]) => `// --- ${k} ---\n${body}`)
            .join('\n\n')
    }

    return `No section found for "${topic}". Available: ${[...sections.keys()].join(', ')}`
}

export function createLookupHandler(projectRoot: string) {
    const content = readFileSync(
        resolve(projectRoot, 'src/scripting/api.d.ts'),
        'utf-8'
    )
    return (topic: string) => lookupScriptingApi(content, topic)
}
