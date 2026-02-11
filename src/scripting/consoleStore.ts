import { createSignal } from 'solid-js'

export type LogLevel = 'log' | 'warn' | 'error'

export interface LogEntry {
    level: LogLevel
    args: unknown[]
    timestamp: number
}

const [logs, setLogs] = createSignal<LogEntry[]>([])

export function pushLog(level: LogLevel, ...args: unknown[]): void {
    setLogs((prev) => [...prev, { level, args, timestamp: Date.now() }])
}

export function clearLogs(): void {
    setLogs([])
}

export { logs }
