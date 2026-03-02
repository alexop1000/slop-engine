import HavokPhysics from '@babylonjs/havok'
import type { AssetNode } from '../assetStore'

const SCRIPT_EXT = ['.ts', '.tsx', '.js', '.jsx']

export function collectScriptPaths(node: AssetNode): string[] {
    if (node.type === 'file') {
        const lower = node.path.toLowerCase()
        return SCRIPT_EXT.some((ext) => lower.endsWith(ext)) ? [node.path] : []
    }
    const paths: string[] = []
    for (const child of node.children ?? []) {
        paths.push(...collectScriptPaths(child))
    }
    return paths
}

export async function getInitializedHavok() {
    return await HavokPhysics()
}
