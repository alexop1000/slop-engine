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

interface EditorLayoutProps {
    readonly state: EditorState
    readonly scheduleAutoSave: () => void
    readonly handlePlayStop: () => void | Promise<void>
    readonly onEngineResize: () => void
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
        selectedNode,
        setSelectedNode,
        setNodeTick,
        nodeTick,
        viewportTab,
        setViewportTab,
        scriptAssets,
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
                minSize={0.05}
                class="bg-gray-800 p-2 rounded-md"
            >
                <AIPanel
                    scene={scene}
                    selectedNode={selectedNode}
                    setSelectedNode={setSelectedNode}
                    setNodeTick={setNodeTick}
                    scheduleAutoSave={props.scheduleAutoSave}
                    isPlaying={props.state.isPlaying}
                    requestPlay={async () => {
                        if (!props.state.isPlaying())
                            await props.handlePlayStop()
                    }}
                    requestStop={async () => {
                        if (props.state.isPlaying())
                            await props.handlePlayStop()
                    }}
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
                        <div
                            class="flex flex-col flex-1 min-h-0"
                            classList={{
                                '[&>div>div:first-child]:hidden': isVibeMode(),
                            }}
                        >
                            <Tabs
                                tabs={[
                                    {
                                        id: 'viewport',
                                        label: 'Viewport',
                                    },
                                    { id: 'script', label: 'Script' },
                                ]}
                                defaultTab="viewport"
                                activeTab={viewportTab}
                                onChange={(id) => setViewportTab(id)}
                                class="flex flex-col flex-1 min-h-0"
                                contentClass="flex-1 min-h-0 flex flex-col"
                            >
                                <TabPanel
                                    tabId="viewport"
                                    class="flex-1 min-h-0"
                                >
                                    <ViewportPanel />
                                </TabPanel>
                                <TabPanel tabId="script" class="flex-1 min-h-0">
                                    <ScriptPanel />
                                </TabPanel>
                            </Tabs>
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
                    class="size-full"
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
                                selectedNode={selectedNode}
                                setSelectedNode={setSelectedNode}
                                nodeTick={nodeTick}
                                setNodeTick={setNodeTick}
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
                            />
                        </Resizable.Panel>
                    </Resizable>
                </Resizable.Panel>
            </Show>
        </Resizable>
    )
}
