import Resizable from 'corvu/resizable'
import { Show } from 'solid-js'
import Handle from '../Handle'
import {
    AIPanel,
    AssetPanel,
    ViewportPanel,
    ConsolePanel,
    ScenePanel,
    ScriptPanel,
    PropertiesPanel,
} from '../panels'
import { Tabs, TabPanel } from '../ui'
import type { EditorState } from '../../hooks/useEditorState'
import type { Checkpoint } from '../../hooks/useEditorEngine'

interface EditorLayoutProps {
    readonly state: EditorState
    readonly scheduleAutoSave: () => void
    readonly handlePlayStop: () => void | Promise<void>
    readonly onEngineResize: () => void
    readonly pushUndoState: () => void
    readonly captureCheckpoint: () => Promise<Checkpoint | null>
    readonly restoreCheckpoint: (cp: Checkpoint) => Promise<void>
}

export function EditorLayout(props: Readonly<EditorLayoutProps>) {
    const {
        mainSizes,
        setSizes,
        setVibeModeSizes,
        centerVerticalSizes,
        setSceneSizes,
        propertiesSizes,
        setPropertiesSizes,
        isVibeMode,
        scene,
        selectedNodes,
        selectedNode,
        setSelectedNode,
        toggleSelectedNode,
        removeNodeFromSelection,
        setNodeTick,
        nodeTick,
        centerWorkspace,
        setCenterWorkspace,
        scriptAssets,
        imageAssets,
    } = props.state

    return (
        <Resizable
            sizes={mainSizes()}
            onSizesChange={(newSizes) => {
                if (isVibeMode()) {
                    setVibeModeSizes(newSizes)
                } else {
                    setSizes(newSizes)
                }
                props.onEngineResize()
            }}
            class="size-full overflow-hidden"
        >
            <Resizable.Panel
                initialSize={0.2}
                minSize={0.2}
                class="bg-gray-800 p-2 rounded-md min-h-0 min-w-0 overflow-hidden flex flex-col"
            >
                <AIPanel
                    scene={scene}
                    selectedNode={selectedNode}
                    setSelectedNode={setSelectedNode}
                    removeNodeFromSelection={removeNodeFromSelection}
                    setNodeTick={setNodeTick}
                    scheduleAutoSave={props.scheduleAutoSave}
                    pushUndoState={props.pushUndoState}
                    isPlaying={props.state.isPlaying}
                    requestPlay={async () => {
                        if (!props.state.isPlaying())
                            await props.handlePlayStop()
                    }}
                    requestStop={async () => {
                        if (props.state.isPlaying())
                            await props.handlePlayStop()
                    }}
                    captureCheckpoint={props.captureCheckpoint}
                    restoreCheckpoint={props.restoreCheckpoint}
                />
            </Resizable.Panel>
            <Resizable.Handle
                class="group basis-3 px-1"
                startIntersection={false}
                endIntersection={false}
            >
                <Handle />
            </Resizable.Handle>
            <Resizable.Panel initialSize={0.75} minSize={0.1} class="h-full">
                <Resizable
                    orientation="vertical"
                    class="size-full"
                    sizes={centerVerticalSizes()}
                    onSizesChange={(newSizes) => {
                        if (!isVibeMode()) setSceneSizes(newSizes)
                        props.onEngineResize()
                    }}
                >
                    <Resizable.Panel
                        initialSize={0.9}
                        minSize={0.1}
                        class="bg-gray-800 p-2 rounded-md h-full overflow-hidden flex flex-col"
                    >
                        <div class="relative flex flex-1 min-h-0 flex-col">
                            {/* Keep canvas mounted — Engine holds a reference to that element */}
                            <div class="absolute inset-0 z-0 flex min-h-0 min-w-0 flex-col">
                                <ViewportPanel />
                            </div>
                            <Show when={centerWorkspace() === 'script'}>
                                <div class="absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col bg-gray-800">
                                    <ScriptPanel
                                        onBackToViewport={() =>
                                            setCenterWorkspace('viewport')
                                        }
                                    />
                                </div>
                            </Show>
                        </div>
                    </Resizable.Panel>
                    <Show when={!isVibeMode()}>
                        <Resizable.Handle class="group basis-3 py-1">
                            <Handle />
                        </Resizable.Handle>
                    </Show>
                    <Show when={!isVibeMode()}>
                        <Resizable.Panel
                            initialSize={0.1}
                            minSize={0.05}
                            class="bg-gray-800 p-2 rounded-md h-full overflow-hidden"
                        >
                            <Tabs
                                tabs={[
                                    {
                                        id: 'console',
                                        label: 'Console',
                                    },
                                    { id: 'assets', label: 'Assets' },
                                ]}
                                defaultTab="console"
                                class="flex flex-col h-full min-h-0"
                                contentClass="flex-1 min-h-0 flex flex-col"
                            >
                                <TabPanel
                                    tabId="console"
                                    class="flex-1 min-h-0"
                                >
                                    <ConsolePanel />
                                </TabPanel>
                                <TabPanel tabId="assets" class="flex-1 min-h-0">
                                    <AssetPanel
                                        scene={scene}
                                        setSelectedNode={setSelectedNode}
                                        setNodeTick={setNodeTick}
                                        pushUndoState={props.pushUndoState}
                                    />
                                </TabPanel>
                            </Tabs>
                        </Resizable.Panel>
                    </Show>
                </Resizable>
            </Resizable.Panel>
            <Show when={!isVibeMode()}>
                <Resizable.Handle
                    class="group basis-3 px-1"
                    startIntersection={false}
                    endIntersection={false}
                >
                    <Handle />
                </Resizable.Handle>
            </Show>
            <Show when={!isVibeMode()}>
                <Resizable.Panel
                    initialSize={0.2}
                    minSize={0.15}
                    class="size-full min-h-0 min-w-0"
                >
                    <Resizable
                        orientation="vertical"
                        class="size-full"
                        sizes={propertiesSizes()}
                        onSizesChange={(sizes) => {
                            setPropertiesSizes(sizes)
                            props.onEngineResize()
                        }}
                    >
                        <Resizable.Panel
                            initialSize={0.5}
                            minSize={0.05}
                            class="bg-gray-800 p-2 rounded-md size-full overflow-y-auto"
                        >
                            <ScenePanel
                                scene={scene}
                                selectedNodes={selectedNodes}
                                selectedNode={selectedNode}
                                setSelectedNode={setSelectedNode}
                                toggleSelectedNode={toggleSelectedNode}
                                removeNodeFromSelection={
                                    removeNodeFromSelection
                                }
                                nodeTick={nodeTick}
                                setNodeTick={setNodeTick}
                                pushUndoState={props.pushUndoState}
                            />
                        </Resizable.Panel>
                        <Resizable.Handle class="group basis-3 py-1">
                            <Handle />
                        </Resizable.Handle>
                        <Resizable.Panel
                            initialSize={0.5}
                            minSize={0.05}
                            class="bg-gray-800 p-2 rounded-md overflow-y-auto"
                        >
                            <PropertiesPanel
                                node={() => {
                                    nodeTick()
                                    return selectedNode()
                                }}
                                setNodeTick={setNodeTick}
                                scriptAssets={scriptAssets}
                                imageAssets={imageAssets}
                                scheduleAutoSave={props.scheduleAutoSave}
                                pushUndoState={props.pushUndoState}
                            />
                        </Resizable.Panel>
                    </Resizable>
                </Resizable.Panel>
            </Show>
        </Resizable>
    )
}
