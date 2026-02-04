import {
    JSX,
    splitProps,
    For,
    createContext,
    useContext,
    createSignal,
    Accessor,
} from 'solid-js'

export interface Tab {
    id: string
    label: string
    disabled?: boolean
}

interface TabsContextValue {
    activeTab: Accessor<string>
    setActiveTab: (id: string) => void
}

const TabsContext = createContext<TabsContextValue>()

export interface TabsProps {
    tabs: Tab[]
    defaultTab?: string
    onChange?: (tabId: string) => void
    children: JSX.Element
    class?: string
}

export interface TabPanelProps extends JSX.HTMLAttributes<HTMLDivElement> {
    tabId: string
}

export function Tabs(props: TabsProps) {
    const [local, rest] = splitProps(props, [
        'tabs',
        'defaultTab',
        'onChange',
        'children',
        'class',
    ])

    const [activeTab, setActiveTabState] = createSignal(
        local.defaultTab ?? local.tabs[0]?.id ?? ''
    )

    const setActiveTab = (id: string) => {
        setActiveTabState(id)
        local.onChange?.(id)
    }

    return (
        <TabsContext.Provider value={{ activeTab, setActiveTab }}>
            <div class={local.class}>
                <div class="border-b border-gray-200 dark:border-gray-700">
                    <nav class="-mb-px flex space-x-4" aria-label="Tabs">
                        <For each={local.tabs}>
                            {(tab) => (
                                <button
                                    type="button"
                                    onClick={() =>
                                        !tab.disabled && setActiveTab(tab.id)
                                    }
                                    disabled={tab.disabled}
                                    class={`
                                        whitespace-nowrap py-2 px-1 border-b-2 text-sm font-medium
                                        transition-colors duration-150
                                        focus:outline-none
                                        ${
                                            activeTab() === tab.id
                                                ? 'border-blue-500 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600'
                                        }
                                        ${
                                            tab.disabled
                                                ? 'opacity-50 cursor-not-allowed'
                                                : 'cursor-pointer'
                                        }
                                    `}
                                >
                                    {tab.label}
                                </button>
                            )}
                        </For>
                    </nav>
                </div>
                <div class="mt-4">{local.children}</div>
            </div>
        </TabsContext.Provider>
    )
}

export function TabPanel(props: TabPanelProps) {
    const [local, rest] = splitProps(props, ['tabId', 'children', 'class'])
    const context = useContext(TabsContext)

    if (!context) {
        throw new Error('TabPanel must be used within a Tabs component')
    }

    return (
        <div
            role="tabpanel"
            class={local.class}
            style={{
                display: context.activeTab() === local.tabId ? 'block' : 'none',
            }}
            {...rest}
        >
            {local.children}
        </div>
    )
}
