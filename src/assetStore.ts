import { createSignal } from 'solid-js'
import { makePersisted } from '@solid-primitives/storage'

const DB_NAME = 'slop-engine-assets'
const DB_VERSION = 1
const STORE_NAME = 'blobs'

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result)
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME)
            }
        }
    })
}

export async function getBlob(path: string): Promise<Blob | null> {
    const db = await openDB()
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(path)
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => resolve(null)
    })
}

export async function setBlob(path: string, blob: Blob): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const req = tx.objectStore(STORE_NAME).put(blob, path)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
    })
}

export async function deleteBlob(path: string): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const req = tx.objectStore(STORE_NAME).delete(path)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
    })
}

export interface AssetNode {
    id: string
    name: string
    type: 'file' | 'folder'
    path: string
    children?: AssetNode[]
    mimeType?: string
    size?: number
}

const ROOT_PATH = ''
const ROOT_ID = '__root__'

function generateId(): string {
    return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function joinPath(parent: string, name: string): string {
    if (!parent) return name
    return `${parent}/${name}`
}

function getParentPath(path: string): string {
    const last = path.lastIndexOf('/')
    if (last === -1) return ROOT_PATH
    return path.slice(0, last)
}

export function pathToId(path: string): string {
    return path || ROOT_ID
}

export function idToPath(id: string): string {
    return id === ROOT_ID ? ROOT_PATH : id
}

export function createAssetStore() {
    const [tree, setTree] = makePersisted(
        createSignal<AssetNode>({
            id: ROOT_ID,
            name: 'Assets',
            type: 'folder',
            path: ROOT_PATH,
            children: [],
        }),
        { name: 'slop-engine-asset-tree-v1' }
    )

    function findNode(root: AssetNode, path: string): AssetNode | null {
        if (root.path === path) return root
        for (const child of root.children ?? []) {
            const found = findNode(child, path)
            if (found) return found
        }
        return null
    }

    function findParent(root: AssetNode, path: string): AssetNode | null {
        const parentPath = getParentPath(path)
        return findNode(root, parentPath)
    }

    function collectFilePaths(node: AssetNode): string[] {
        if (node.type === 'file') return [node.path]
        const paths: string[] = []
        for (const child of node.children ?? []) {
            paths.push(...collectFilePaths(child))
        }
        return paths
    }

    function addNode(parentPath: string, name: string, type: 'file' | 'folder'): AssetNode {
        const path = joinPath(parentPath, name)
        const parent = findNode(tree(), parentPath)
        if (!parent || parent.type !== 'folder') {
            throw new Error('Parent not found or not a folder')
        }
        const existing = (parent.children ?? []).find((c) => c.name === name)
        if (existing) {
            throw new Error(`"${name}" already exists`)
        }
        const node: AssetNode = {
            id: generateId(),
            name,
            type,
            path,
            children: type === 'folder' ? [] : undefined,
        }
        setTree((prev) => {
            const next = JSON.parse(JSON.stringify(prev))
            const p = findNode(next, parentPath)
            if (!p) return prev
            p.children = p.children ?? []
            p.children.push(node)
            return next
        })
        return node
    }

    function renameNode(path: string, newName: string): void {
        const parentPath = getParentPath(path)
        const parent = findNode(tree(), parentPath)
        if (!parent) return
        const existing = (parent.children ?? []).find((c) => c.name === newName && c.path !== path)
        if (existing) {
            throw new Error(`"${newName}" already exists`)
        }
        setTree((prev) => {
            const next = JSON.parse(JSON.stringify(prev))
            const node = findNode(next, path)
            if (!node) return prev
            const oldPath = node.path
            node.name = newName
            node.path = joinPath(parentPath, newName)
            if (node.type === 'folder' && node.children?.length) {
                node.children = node.children.map((c) =>
                    renamePathRecursive(c, oldPath, node.path)
                )
            }
            return next
        })
    }

    function renamePathRecursive(
        node: AssetNode,
        oldPrefix: string,
        newPrefix: string
    ): AssetNode {
        const newPath = node.path.replace(oldPrefix, newPrefix)
        return {
            ...node,
            path: newPath,
            children: node.children?.map((c) =>
                renamePathRecursive(c, oldPrefix, newPrefix)
            ),
        }
    }

    function deleteNode(path: string): void {
        const node = findNode(tree(), path)
        if (!node) return
        setTree((prev) => {
            const next = JSON.parse(JSON.stringify(prev))
            const parent = findParent(next, path)
            if (!parent) return prev
            parent.children = (parent.children ?? []).filter((c) => c.path !== path)
            return next
        })
    }

    function moveNode(sourcePath: string, targetPath: string, position: 'before' | 'inside' | 'after'): void {
        const source = findNode(tree(), sourcePath)
        const target = findNode(tree(), targetPath)
        if (!source || !target) return
        if (sourcePath === targetPath) return
        if (target.type === 'folder' && position === 'inside') {
            const newParentPath = targetPath
            if (sourcePath.startsWith(newParentPath + '/')) return
            setTree((prev) => {
                const next = JSON.parse(JSON.stringify(prev))
                const src = findNode(next, sourcePath)
                const tgt = findNode(next, targetPath)
                if (!src || !tgt || tgt.type !== 'folder') return prev
                const oldParent = findParent(next, sourcePath)
                if (!oldParent) return prev
                oldParent.children = (oldParent.children ?? []).filter((c) => c.path !== sourcePath)
                const newPath = joinPath(targetPath, src.name)
                src.path = newPath
                if (src.type === 'folder' && src.children?.length) {
                    src.children = src.children.map((c) =>
                        renamePathRecursive(c, sourcePath, newPath)
                    )
                }
                tgt.children = tgt.children ?? []
                tgt.children.push(src)
                return next
            })
        } else {
            const parentPath = getParentPath(targetPath)
            const parent = findNode(tree(), parentPath)
            if (!parent) return
            const siblings = [...(parent.children ?? [])]
            const srcIdx = siblings.findIndex((c) => c.path === sourcePath)
            const tgtIdx = siblings.findIndex((c) => c.path === targetPath)
            if (srcIdx === -1 || tgtIdx === -1) return
            const [removed] = siblings.splice(srcIdx, 1)
            const insertIdx = position === 'before' ? tgtIdx : tgtIdx + 1
            siblings.splice(insertIdx, 0, removed)
            setTree((prev) => {
                const next = JSON.parse(JSON.stringify(prev))
                const p = findNode(next, parentPath)
                if (!p) return prev
                p.children = siblings.map((s) => findNode(next, s.path) ?? s)
                return next
            })
        }
    }

    return {
        tree,
        addNode,
        renameNode,
        deleteNode,
        moveNode,
        findNode,
        collectFilePaths,
        pathToId,
        idToPath,
    }
}

/** Shared singleton asset store instance. */
let _sharedStore: ReturnType<typeof createAssetStore> | null = null

export function getAssetStore(): ReturnType<typeof createAssetStore> {
    if (!_sharedStore) _sharedStore = createAssetStore()
    return _sharedStore
}
