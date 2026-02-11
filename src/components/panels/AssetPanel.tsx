import { createSignal, Show, createMemo } from 'solid-js'
import {
    folder,
    document,
    photo,
    cube,
    codeBracket,
    arrowDownTray,
    pencilSquare,
    trash,
    documentPlus,
    folderPlus,
} from 'solid-heroicons/outline'
import { Icon } from 'solid-heroicons'
import {
    TreeNode,
    TreeView,
    TreeMoveEvent,
    TreeContextMenuEvent,
    Modal,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Input,
    Button,
    IconButton,
    ContextMenu,
} from '../ui'
import type { ContextMenuItem } from '../ui'
import {
    createAssetStore,
    getBlob,
    setBlob,
    deleteBlob,
    pathToId,
    type AssetNode,
} from '../../assetStore'

// ── Constants ──────────────────────────────────────────────

const MODEL_EXT = ['.glb', '.gltf', '.obj', '.fbx']
const TEXTURE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga']
const SCRIPT_EXT = ['.ts', '.tsx', '.js', '.jsx']
const INVALID_NAME_CHARS = /[\\/:*?"<>|]/
const MAX_DEDUP_RETRIES = 100

// ── Pure helpers ───────────────────────────────────────────

function joinPath(parent: string, name: string): string {
    return parent ? `${parent}/${name}` : name
}

/** Resolve the parent folder path for a given node. */
function getParentPath(node: AssetNode | null): string {
    if (!node) return ''
    if (node.type === 'folder') return node.path
    return node.path.slice(0, node.path.lastIndexOf('/'))
}

/** Split a filename into `[base, ext]` parts. */
function splitFilename(name: string): [string, string] {
    const dotIdx = name.lastIndexOf('.')
    if (dotIdx <= 0) return [name, '']
    return [name.slice(0, dotIdx), name.slice(dotIdx)]
}

function getFileIcon(name: string): typeof document {
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
    if (MODEL_EXT.includes(ext)) return cube
    if (TEXTURE_EXT.includes(ext)) return photo
    if (SCRIPT_EXT.includes(ext)) return codeBracket
    return document
}

function assetToTreeNode(node: AssetNode): TreeNode<AssetNode> {
    const isFolder = node.type === 'folder'
    return {
        id: pathToId(node.path),
        label: node.name,
        icon: isFolder ? folder : getFileIcon(node.name),
        children:
            isFolder && node.children?.length
                ? node.children.map(assetToTreeNode)
                : undefined,
        data: node,
    }
}

// ── Blob migration helper ──────────────────────────────────

async function migrateBlobs(
    store: ReturnType<typeof createAssetStore>,
    node: AssetNode,
    oldPath: string,
    newPath: string
) {
    if (node.type === 'file') {
        const blob = await getBlob(oldPath)
        if (blob) {
            await setBlob(newPath, blob)
            await deleteBlob(oldPath)
        }
    } else {
        for (const filePath of store.collectFilePaths(node)) {
            const blob = await getBlob(filePath)
            if (blob) {
                const dest = newPath + filePath.slice(oldPath.length)
                await setBlob(dest, blob)
                await deleteBlob(filePath)
            }
        }
    }
}

// ── Store singleton ────────────────────────────────────────

const store = createAssetStore()

// ── Component ──────────────────────────────────────────────

export default function AssetPanel() {
    const [contextMenu, setContextMenu] = createSignal<{
        x: number
        y: number
        node: AssetNode | null
    } | null>(null)
    const [modal, setModal] = createSignal<{
        type: 'newFolder' | 'newFile' | 'rename'
        parentPath?: string
        currentPath?: string
        currentName?: string
    } | null>(null)
    const [modalValue, setModalValue] = createSignal('')
    const [error, setError] = createSignal<string | null>(null)
    const [selectedPath, setSelectedPath] = createSignal<string | null>(null)
    const [importTarget, setImportTarget] = createSignal('')

    let fileInputEl: HTMLInputElement | undefined

    const treeItems = createMemo(() => [assetToTreeNode(store.tree())])

    const selectedId = () => {
        const p = selectedPath()
        return p !== null ? pathToId(p) : undefined
    }

    // ── Modal helpers ────────────────────────────────────────

    function openModal(
        type: 'newFolder' | 'newFile' | 'rename',
        defaults: {
            parentPath?: string
            currentPath?: string
            currentName?: string
        },
        defaultValue: string
    ) {
        setModal({ type, ...defaults })
        setModalValue(defaultValue)
        setError(null)
    }

    function closeModal() {
        setModal(null)
        setError(null)
    }

    const modalTitle = () => {
        const type = modal()?.type
        if (type === 'rename') return 'Rename'
        if (type === 'newFolder') return 'New Folder'
        return 'New File'
    }

    // ── Tree handlers ────────────────────────────────────────

    const handleSelect = (_id: string, data: AssetNode | undefined) => {
        setSelectedPath(data?.path ?? null)
    }

    const handleContextMenu = (event: TreeContextMenuEvent<AssetNode>) => {
        const node = event.data ?? null
        if (node) setSelectedPath(node.path)
        setContextMenu({ x: event.x, y: event.y, node })
    }

    const handleMove = (event: TreeMoveEvent<AssetNode>) => {
        const source = event.sourceData
        const target = event.targetData
        if (!source || !target) return
        if (source.path === '' || source.path === target.path) return

        store.moveNode(source.path, target.path, event.position)

        if (event.position === 'inside') {
            const newBase = `${target.path}/${source.name}`
            migrateBlobs(store, source, source.path, newBase)
        }
    }

    // ── Context menu ─────────────────────────────────────────

    function getContextMenuItems(): ContextMenuItem[] {
        const node = contextMenu()?.node
        return [
            { id: 'new-folder', label: 'New Folder', icon: folderPlus },
            { id: 'new-file', label: 'New File', icon: documentPlus },
            { id: 'import', label: 'Import Assets...', icon: arrowDownTray },
            { id: 'sep-1', label: '', separator: true },
            ...(node
                ? [
                      { id: 'rename', label: 'Rename', icon: pencilSquare },
                      {
                          id: 'delete',
                          label: 'Delete',
                          danger: true,
                          icon: trash,
                      },
                  ]
                : []),
        ]
    }

    function handleContextMenuSelect(id: string) {
        const ctx = contextMenu()
        if (!ctx) return

        const parentPath = getParentPath(ctx.node)

        switch (id) {
            case 'new-folder':
                openModal('newFolder', { parentPath }, 'New Folder')
                break
            case 'new-file':
                openModal('newFile', { parentPath }, 'newfile.txt')
                break
            case 'import':
                triggerFileImport(parentPath)
                break
            case 'rename':
                if (ctx.node) {
                    openModal(
                        'rename',
                        {
                            currentPath: ctx.node.path,
                            currentName: ctx.node.name,
                        },
                        ctx.node.name
                    )
                }
                break
            case 'delete':
                if (ctx.node) deleteAsset(ctx.node)
                break
        }

        setContextMenu(null)
    }

    // ── Asset CRUD ───────────────────────────────────────────

    function deleteAsset(node: AssetNode) {
        const paths =
            node.type === 'file' ? [node.path] : store.collectFilePaths(node)
        for (const p of paths) deleteBlob(p)
        store.deleteNode(node.path)
        if (selectedPath() === node.path) setSelectedPath(null)
    }

    function submitModal() {
        const m = modal()
        if (!m) return

        const val = modalValue().trim()
        if (!val) return setError('Name is required')
        if (INVALID_NAME_CHARS.test(val))
            return setError('Invalid characters in name')

        try {
            if (m.type === 'newFolder') {
                store.addNode(m.parentPath ?? '', val, 'folder')
            } else if (m.type === 'newFile') {
                store.addNode(m.parentPath ?? '', val, 'file')
            } else if (m.type === 'rename' && m.currentPath) {
                const oldPath = m.currentPath
                const node = store.findNode(store.tree(), oldPath)
                store.renameNode(oldPath, val)
                if (node) {
                    const parentDir = oldPath.slice(0, oldPath.lastIndexOf('/'))
                    migrateBlobs(store, node, oldPath, joinPath(parentDir, val))
                }
            }
            closeModal()
        } catch (e) {
            setError((e as Error).message)
        }
    }

    // ── File import / drop ───────────────────────────────────

    function triggerFileImport(targetPath: string) {
        setImportTarget(targetPath)
        fileInputEl?.click()
    }

    /**
     * Add a file node, deduplicating the name if it already exists.
     * Returns the final path used.
     */
    function addFileDeduped(targetPath: string, name: string): string {
        try {
            store.addNode(targetPath, name, 'file')
            return joinPath(targetPath, name)
        } catch {
            const [base, ext] = splitFilename(name)
            for (let n = 1; n <= MAX_DEDUP_RETRIES; n++) {
                const candidate = `${base}_${n}${ext}`
                try {
                    store.addNode(targetPath, candidate, 'file')
                    return joinPath(targetPath, candidate)
                } catch {
                    if (n === MAX_DEDUP_RETRIES) {
                        throw new Error('Could not find unique filename')
                    }
                }
            }
            throw new Error('Could not find unique filename')
        }
    }

    function handleFileImport(e: Event) {
        const input = e.target as HTMLInputElement
        const files = input.files
        if (!files?.length) return

        const targetPath = importTarget()
        const fileList = Array.from(files)
        input.value = ''

        queueMicrotask(async () => {
            for (const file of fileList) {
                const path = addFileDeduped(targetPath, file.name)
                await setBlob(path, file)
            }
        })
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault()
        e.stopPropagation()

        const path = selectedPath()
        const targetPath =
            path && store.findNode(store.tree(), path)?.type === 'folder'
                ? path
                : ''

        const files = e.dataTransfer?.files
        if (!files?.length) return

        for (const file of Array.from(files)) {
            const finalPath = addFileDeduped(targetPath, file.name)
            setBlob(finalPath, file)
        }
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer!.dropEffect = 'copy'
    }

    // ── Render ────────────────────────────────────────────────

    return (
        <div
            class="flex flex-col h-full overflow-hidden"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
        >
            <div class="flex items-center justify-between mb-2">
                <h2 class="text-sm font-semibold text-gray-200"></h2>
                <div class="flex gap-1">
                    <IconButton
                        variant="ghost"
                        size="sm"
                        label="New Folder"
                        onClick={() =>
                            openModal(
                                'newFolder',
                                { parentPath: '' },
                                'New Folder'
                            )
                        }
                    >
                        <Icon path={folderPlus} class="size-4" />
                    </IconButton>
                    <IconButton
                        variant="ghost"
                        size="sm"
                        label="New File"
                        onClick={() =>
                            openModal(
                                'newFile',
                                { parentPath: '' },
                                'newfile.txt'
                            )
                        }
                    >
                        <Icon path={documentPlus} class="size-4" />
                    </IconButton>
                    <IconButton
                        variant="ghost"
                        size="sm"
                        label="Import Assets"
                        onClick={() => {
                            const p = selectedPath()
                            const target = p
                                ? getParentPath(store.findNode(store.tree(), p))
                                : ''
                            triggerFileImport(target)
                        }}
                    >
                        <Icon path={arrowDownTray} class="size-4" />
                    </IconButton>
                </div>
            </div>

            <input
                ref={fileInputEl}
                type="file"
                multiple
                class="hidden"
                accept="*"
                onChange={handleFileImport}
            />

            <div class="flex-1 overflow-y-auto min-h-0">
                <TreeView
                    items={treeItems()}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                    onMove={handleMove}
                    onContextMenu={handleContextMenu}
                    defaultExpanded={[]}
                />
            </div>

            <ContextMenu
                open={contextMenu() !== null}
                x={contextMenu()?.x ?? 0}
                y={contextMenu()?.y ?? 0}
                items={getContextMenuItems()}
                onSelect={handleContextMenuSelect}
                onClose={() => setContextMenu(null)}
            />

            <Show when={modal()}>
                <Modal open={!!modal()} onClose={closeModal} size="sm">
                    <ModalHeader>{modalTitle()}</ModalHeader>
                    <ModalBody>
                        <Input
                            label="Name"
                            value={modalValue()}
                            onInput={(e) =>
                                setModalValue(e.currentTarget.value)
                            }
                            error={error() ?? undefined}
                            onKeyDown={(e) =>
                                e.key === 'Enter' && submitModal()
                            }
                        />
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost" onClick={() => setModal(null)}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={submitModal}>
                            {modal()?.type === 'rename' ? 'Rename' : 'Create'}
                        </Button>
                    </ModalFooter>
                </Modal>
            </Show>
        </div>
    )
}
