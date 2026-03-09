import HavokPhysics from '@babylonjs/havok'
import type { AssetNode } from '../assetStore'

const SCRIPT_EXT = ['.ts', '.tsx', '.js', '.jsx']
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga']

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

export function collectImagePaths(node: AssetNode): string[] {
    if (node.type === 'file') {
        const lower = node.path.toLowerCase()
        return IMAGE_EXT.some((ext) => lower.endsWith(ext)) ? [node.path] : []
    }
    const paths: string[] = []
    for (const child of node.children ?? []) {
        paths.push(...collectImagePaths(child))
    }
    return paths
}

export async function getInitializedHavok() {
    return await HavokPhysics()
}
