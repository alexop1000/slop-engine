import type { UIMessage } from 'ai'

// ── Types ───────────────────────────────────────────────────────────

export interface ChatSession {
    id: string
    title: string
    messages: UIMessage[]
    createdAt: number
    updatedAt: number
}

// ── IndexedDB helpers ───────────────────────────────────────────────

const DB_NAME = 'slop-engine-chats'
const DB_VERSION = 1
const STORE_NAME = 'sessions'

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onerror = () =>
            reject(new Error(req.error?.message ?? 'Failed to open DB'))
        req.onsuccess = () => resolve(req.result)
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' })
            }
        }
    })
}

// ── CRUD operations ─────────────────────────────────────────────────

export async function getAllSessions(): Promise<ChatSession[]> {
    const db = await openDB()
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).getAll()
        req.onsuccess = () => {
            const sessions = (req.result ?? []) as ChatSession[]
            sessions.sort((a, b) => b.updatedAt - a.updatedAt)
            resolve(sessions)
        }
        req.onerror = () => resolve([])
    })
}

export async function getSession(id: string): Promise<ChatSession | null> {
    const db = await openDB()
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(id)
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => resolve(null)
    })
}

export async function saveSession(session: ChatSession): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const req = tx.objectStore(STORE_NAME).put(session)
        req.onsuccess = () => resolve()
        req.onerror = () =>
            reject(new Error(req.error?.message ?? 'Failed to save session'))
    })
}

export async function deleteSession(id: string): Promise<void> {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const req = tx.objectStore(STORE_NAME).delete(id)
        req.onsuccess = () => resolve()
        req.onerror = () =>
            reject(new Error(req.error?.message ?? 'Failed to delete session'))
    })
}

// ── Utilities ───────────────────────────────────────────────────────

export function generateChatId(): string {
    return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function titleFromMessages(messages: UIMessage[]): string {
    const firstUserMsg = messages.find((m) => m.role === 'user')
    if (!firstUserMsg) return 'New Chat'
    const text = (firstUserMsg.parts ?? [])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('')
    if (!text) return 'New Chat'
    return text.length > 60 ? text.slice(0, 60) + '…' : text
}

export function formatSessionDate(ts: number): string {
    const d = new Date(ts)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) {
        return 'Yesterday'
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
