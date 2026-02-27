import {
    createSignal,
    Show,
    createMemo,
    type Accessor,
    type Setter,
} from 'solid-js'
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
    getAssetStore,
    getBlob,
    setBlob,
    deleteBlob,
    pathToId,
    type AssetNode,
} from '../../assetStore'
import { Scene, Node } from 'babylonjs'
import { openScriptFile } from '../../scriptEditorStore'
import {
    importModelToScene,
    type AssetResolver,
} from '../../scene/SceneOperations'

// ── Constants ──────────────────────────────────────────────

const MODEL_EXT = ['.glb', '.gltf', '.obj']
const TEXTURE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga']
const SCRIPT_EXT = ['.ts', '.tsx', '.js', '.jsx']
const INVALID_NAME_CHARS = /[\\/:*?"<>|]/
const MAX_DEDUP_RETRIES = 100

const DEFAULT_SCRIPT_CONTENT = `export default class extends Script {

    // Called when play mode starts
    start() {

    }

    // Called every frame during play mode
    update() {

    }

    // Called when the script instance is destroyed (e.g. node is removed)
    destroy() {

    }
}
`

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
    store: ReturnType<typeof getAssetStore>,
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

const store = getAssetStore()

// ── Component ──────────────────────────────────────────────

interface AssetPanelProps {
    scene?: Accessor<Scene | undefined>
    setSelectedNode?: (node: Node | undefined) => void
    setNodeTick?: Setter<number>
}

export default function AssetPanel(props: AssetPanelProps) {
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

    const resolveAsset: AssetResolver = (path) => getBlob(path)

    async function addAssetModelToScene(node: AssetNode) {
        const s = props.scene?.()
        if (!s || node.type !== 'file') return
        const ext = node.name.slice(node.name.lastIndexOf('.')).toLowerCase()
        if (!MODEL_EXT.includes(ext)) return

        const blob = await getBlob(node.path)
        if (!blob) return

        // Derive the asset directory (parent folder path)
        const lastSlash = node.path.lastIndexOf('/')
        const assetDir = lastSlash > 0 ? node.path.slice(0, lastSlash) : ''

        const root = await importModelToScene(
            s,
            blob,
            node.name,
            assetDir,
            resolveAsset
        )
        props.setSelectedNode?.(root)
        props.setNodeTick?.((t) => t + 1)
    }

    function isModelFile(node: AssetNode | null): boolean {
        if (!node || node.type !== 'file') return false
        const ext = node.name.slice(node.name.lastIndexOf('.')).toLowerCase()
        return MODEL_EXT.includes(ext)
    }

    const handleDoubleClick = (_id: string, data: AssetNode | undefined) => {
        if (!data || data.type !== 'file') return
        const ext = data.name.slice(data.name.lastIndexOf('.')).toLowerCase()
        if (SCRIPT_EXT.includes(ext)) {
            openScriptFile(data.path)
        } else if (MODEL_EXT.includes(ext)) {
            addAssetModelToScene(data)
        }
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

        const oldPath = source.path
        store.moveNode(source.path, target.path, event.position)

        // Migrate blobs when the file moves to a different parent folder
        if (event.position === 'inside') {
            const newBase = `${target.path}/${source.name}`
            migrateBlobs(store, source, oldPath, newBase)
        } else {
            const sourceParent = oldPath.slice(0, oldPath.lastIndexOf('/'))
            const targetParent = target.path.slice(
                0,
                target.path.lastIndexOf('/')
            )
            if (sourceParent !== targetParent) {
                const newBase = targetParent
                    ? `${targetParent}/${source.name}`
                    : source.name
                migrateBlobs(store, source, oldPath, newBase)
            }
        }
    }

    // ── Context menu ─────────────────────────────────────────

    function getContextMenuItems(): ContextMenuItem[] {
        const node = contextMenu()?.node
        return [
            ...(isModelFile(node ?? null) && props.scene
                ? [
                      {
                          id: 'add-to-scene',
                          label: 'Add to Scene',
                          icon: cube,
                      },
                      { id: 'sep-0', label: '', separator: true },
                  ]
                : []),
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
            case 'add-to-scene':
                if (ctx.node) addAssetModelToScene(ctx.node)
                break
            case 'new-folder':
                openModal('newFolder', { parentPath }, 'New Folder')
                break
            case 'new-file':
                openModal('newFile', { parentPath }, 'newfile.ts')
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
                const ext = val.slice(val.lastIndexOf('.')).toLowerCase()
                if (SCRIPT_EXT.includes(ext)) {
                    const filePath = joinPath(m.parentPath ?? '', val)
                    setBlob(
                        filePath,
                        new Blob([DEFAULT_SCRIPT_CONTENT], {
                            type: 'text/plain',
                        })
                    )
                }
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
        } catch (e) {
            if (
                !(e instanceof Error) ||
                !e.message.includes('already exists')
            ) {
                throw e
            }
            const [base, ext] = splitFilename(name)
            for (let n = 1; n <= MAX_DEDUP_RETRIES; n++) {
                const candidate = `${base}_${n}${ext}`
                try {
                    store.addNode(targetPath, candidate, 'file')
                    return joinPath(targetPath, candidate)
                } catch (e2) {
                    if (
                        !(e2 instanceof Error) ||
                        !e2.message.includes('already exists')
                    ) {
                        throw e2
                    }
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
        // Only handle external file drops, not internal tree reorder drags
        if (!e.dataTransfer?.types.includes('Files')) return
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
        // Only handle external file drops, not internal tree reorder drags
        if (!e.dataTransfer?.types.includes('Files')) return
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
                                'newfile.ts'
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
                    onDoubleClick={handleDoubleClick}
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
