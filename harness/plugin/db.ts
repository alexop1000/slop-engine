import { Database } from 'bun:sqlite'

import { DB_PATH } from '../paths'
import type {
    FailureMode,
    GameId,
    IterationKind,
    RubricScore,
    RunStatus,
    RunRubric,
    RunSummary,
    ScenarioId,
} from '../types'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
    id                   TEXT PRIMARY KEY,
    game                 TEXT NOT NULL,
    scenario             TEXT NOT NULL,
    run_number           INTEGER NOT NULL,
    status               TEXT NOT NULL,
    created_at           INTEGER NOT NULL,
    started_at           INTEGER,
    stopped_at           INTEGER,

    total_duration_ms    INTEGER,
    total_input_tokens   INTEGER,
    total_output_tokens  INTEGER,
    total_cached_tokens  INTEGER,
    total_iterations     INTEGER,
    total_tool_calls     INTEGER,

    rubric_movement      INTEGER,
    rubric_win           INTEGER,
    rubric_lose          INTEGER,
    rubric_no_crash      INTEGER,
    rubric_ui            INTEGER,
    rubric_camera        INTEGER,
    rubric_failure_mode  TEXT,
    rubric_notes         TEXT,
    graded_at            INTEGER,

    runtime_errors       INTEGER DEFAULT 0,

    UNIQUE(game, scenario, run_number)
);

CREATE TABLE IF NOT EXISTS iterations (
    run_id           TEXT NOT NULL,
    index_           INTEGER NOT NULL,
    kind             TEXT NOT NULL,
    prompt_text      TEXT NOT NULL,
    started_at       INTEGER NOT NULL,
    ended_at         INTEGER,
    duration_ms      INTEGER,
    input_tokens     INTEGER,
    output_tokens    INTEGER,
    cached_tokens    INTEGER,
    tool_call_count  INTEGER,
    PRIMARY KEY (run_id, index_),
    FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_game_scenario ON runs(game, scenario);
`

export interface RunRow {
    id: string
    game: GameId
    scenario: ScenarioId
    run_number: number
    status: RunStatus
    created_at: number
    started_at: number | null
    stopped_at: number | null
    total_duration_ms: number | null
    total_input_tokens: number | null
    total_output_tokens: number | null
    total_cached_tokens: number | null
    total_iterations: number | null
    total_tool_calls: number | null
    rubric_movement: RubricScore | null
    rubric_win: RubricScore | null
    rubric_lose: RubricScore | null
    rubric_no_crash: RubricScore | null
    rubric_ui: RubricScore | null
    rubric_camera: RubricScore | null
    rubric_failure_mode: FailureMode | null
    rubric_notes: string | null
    graded_at: number | null
    runtime_errors: number | null
}

export interface IterationRow {
    run_id: string
    index_: number
    kind: IterationKind
    prompt_text: string
    started_at: number
    ended_at: number | null
    duration_ms: number | null
    input_tokens: number | null
    output_tokens: number | null
    cached_tokens: number | null
    tool_call_count: number | null
}

let db: Database | null = null

export function getDb(): Database {
    if (db) return db
    db = new Database(DB_PATH, { create: true })
    db.exec('PRAGMA journal_mode = WAL')
    db.exec(SCHEMA)
    migrateAddColumn(db, 'runs', 'runtime_errors', 'INTEGER DEFAULT 0')
    migrateAddColumn(db, 'runs', 'rubric_ui', 'INTEGER')
    migrateAddColumn(db, 'runs', 'rubric_camera', 'INTEGER')
    return db
}

function migrateAddColumn(
    database: Database,
    table: string,
    column: string,
    defn: string
): void {
    try {
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${defn}`)
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!/duplicate column name/i.test(msg)) throw e
    }
}

export function insertRun(row: {
    id: string
    game: GameId
    scenario: ScenarioId
    runNumber: number
    createdAt: number
}): void {
    getDb().run(
        `INSERT INTO runs (id, game, scenario, run_number, status, created_at)
         VALUES (?, ?, ?, ?, 'created', ?)`,
        [row.id, row.game, row.scenario, row.runNumber, row.createdAt]
    )
}

type Binding = string | number | null

export function setRunStatus(
    runId: string,
    status: RunStatus,
    timestamps: { startedAt?: number; stoppedAt?: number } = {}
): void {
    const sets: string[] = ['status = ?']
    const params: Binding[] = [status]
    if (timestamps.startedAt !== undefined) {
        sets.push('started_at = ?')
        params.push(timestamps.startedAt)
    }
    if (timestamps.stoppedAt !== undefined) {
        sets.push('stopped_at = ?')
        params.push(timestamps.stoppedAt)
    }
    params.push(runId)
    getDb().run(`UPDATE runs SET ${sets.join(', ')} WHERE id = ?`, params)
}

export function updateRunSummary(runId: string, s: RunSummary): void {
    getDb().run(
        `UPDATE runs SET
            total_duration_ms = ?,
            total_input_tokens = ?,
            total_output_tokens = ?,
            total_cached_tokens = ?,
            total_iterations = ?,
            total_tool_calls = ?,
            runtime_errors = ?
         WHERE id = ?`,
        [
            s.totalDurationMs,
            s.totalInputTokens,
            s.totalOutputTokens,
            s.totalCachedTokens,
            s.totalIterations,
            s.totalToolCalls,
            s.runtimeErrors,
            runId,
        ]
    )
}

export function submitRubric(
    runId: string,
    r: RunRubric,
    gradedAt: number
): void {
    getDb().run(
        `UPDATE runs SET
            rubric_movement = ?,
            rubric_win = ?,
            rubric_lose = ?,
            rubric_no_crash = ?,
            rubric_ui = ?,
            rubric_camera = ?,
            rubric_failure_mode = ?,
            rubric_notes = ?,
            graded_at = ?,
            status = 'graded'
         WHERE id = ?`,
        [
            r.movement,
            r.win,
            r.lose,
            r.noCrash,
            r.ui,
            r.camera,
            r.failureMode,
            r.notes,
            gradedAt,
            runId,
        ]
    )
}

export function getRun(runId: string): RunRow | null {
    const row = getDb()
        .query('SELECT * FROM runs WHERE id = ?')
        .get(runId) as RunRow | null
    return row
}

export function listRuns(): RunRow[] {
    return getDb()
        .query('SELECT * FROM runs ORDER BY created_at DESC')
        .all() as RunRow[]
}

export function findRun(
    game: GameId,
    scenario: ScenarioId,
    runNumber: number
): RunRow | null {
    return (
        (getDb()
            .query(
                'SELECT * FROM runs WHERE game = ? AND scenario = ? AND run_number = ?'
            )
            .get(game, scenario, runNumber) as RunRow | null) ?? null
    )
}

export function insertIteration(row: {
    runId: string
    index: number
    kind: IterationKind
    promptText: string
    startedAt: number
}): void {
    getDb().run(
        `INSERT INTO iterations (run_id, index_, kind, prompt_text, started_at)
         VALUES (?, ?, ?, ?, ?)`,
        [row.runId, row.index, row.kind, row.promptText, row.startedAt]
    )
}

export function finalizeIteration(
    runId: string,
    index: number,
    data: {
        endedAt: number
        inputTokens: number
        outputTokens: number
        cachedTokens: number
        toolCallCount: number
    }
): void {
    getDb().run(
        `UPDATE iterations SET
            ended_at = ?,
            duration_ms = ? - started_at,
            input_tokens = ?,
            output_tokens = ?,
            cached_tokens = ?,
            tool_call_count = ?
         WHERE run_id = ? AND index_ = ?`,
        [
            data.endedAt,
            data.endedAt,
            data.inputTokens,
            data.outputTokens,
            data.cachedTokens,
            data.toolCallCount,
            runId,
            index,
        ]
    )
}

export function listIterations(runId: string): IterationRow[] {
    return getDb()
        .query('SELECT * FROM iterations WHERE run_id = ? ORDER BY index_ ASC')
        .all(runId) as IterationRow[]
}

/**
 * Highest iteration index currently stored for this run, or -1 if none.
 * Used to resume numbering after a server restart so we don't collide with
 * existing rows on the iterations primary key.
 */
export function maxIterationIndex(runId: string): number {
    const row = getDb()
        .query('SELECT MAX(index_) AS max_idx FROM iterations WHERE run_id = ?')
        .get(runId) as { max_idx: number | null } | null
    return row?.max_idx ?? -1
}

export function deleteRun(runId: string): void {
    const db = getDb()
    db.transaction(() => {
        db.run('DELETE FROM iterations WHERE run_id = ?', [runId])
        db.run('DELETE FROM runs WHERE id = ?', [runId])
    })()
}
