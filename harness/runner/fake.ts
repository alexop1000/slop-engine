import type { EmitEvent, NudgePayload, RunContext, ScenarioRunner } from './types'

/**
 * Temporary runner used while real scenario runners are being implemented.
 * Emits plausible-looking events on a timer so the dashboard can be exercised
 * end-to-end without LM Studio or opencode.
 */
export class FakeRunner implements ScenarioRunner {
    private emit: EmitEvent | null = null
    private ctx: RunContext | null = null
    private iteration = -1
    private turnTimer: ReturnType<typeof setTimeout> | null = null
    private aborted = false

    async start(ctx: RunContext, emit: EmitEvent): Promise<void> {
        this.ctx = ctx
        this.emit = emit
        // run_started is emitted by the route handler before start() is called.
        this.beginIteration('initial', ctx.initialPrompt)
    }

    async nudge(payload: NudgePayload): Promise<void> {
        const kindMap = {
            free_text: 'nudge',
            clarification_cards: 'clarification',
            plan_approval: 'plan_approval',
        } as const
        this.beginIteration(
            kindMap[payload.kind],
            payload.cardChoice ?? payload.text
        )
    }

    async stop(): Promise<void> {
        this.cleanup()
        this.emit?.({ t: Date.now(), type: 'run_stopped', reason: 'user' })
    }

    async abort(): Promise<void> {
        this.aborted = true
        this.cleanup()
        this.emit?.({
            t: Date.now(),
            type: 'run_stopped',
            reason: 'error',
            error: 'aborted',
        })
    }

    private cleanup(): void {
        if (this.turnTimer) {
            clearTimeout(this.turnTimer)
            this.turnTimer = null
        }
    }

    private beginIteration(
        kind: 'initial' | 'nudge' | 'clarification' | 'plan_approval',
        prompt: string
    ): void {
        if (!this.emit || !this.ctx) return
        this.iteration += 1
        const index = this.iteration
        const emit = this.emit
        const model =
            this.ctx.config.provider === 'azure'
                ? this.ctx.config.azure?.deployment ?? 'azure'
                : this.ctx.config.lmstudio?.modelId ?? 'model'

        emit({
            t: Date.now(),
            type: 'iteration_started',
            index,
            kind,
            prompt,
        })

        const schedule = (ms: number, fn: () => void) => {
            if (this.aborted) return
            this.turnTimer = setTimeout(fn, ms)
        }

        schedule(400, () => {
            emit({
                t: Date.now(),
                type: 'llm_call',
                iteration: index,
                inputTokens: 512,
                outputTokens: 128,
                cachedTokens: 0,
                durationMs: 380,
                model,
                finishReason: 'tool-calls',
            })
            schedule(200, () => {
                emit({
                    t: Date.now(),
                    type: 'tool_call',
                    iteration: index,
                    toolName: 'fake_tool',
                    inputPreview: '{ "demo": true }',
                    outputPreview: 'ok',
                })
                schedule(300, () => {
                    emit({
                        t: Date.now(),
                        type: 'text_chunk',
                        iteration: index,
                        text: 'Fake runner completed iteration.',
                    })
                    emit({
                        t: Date.now(),
                        type: 'iteration_ended',
                        index,
                    })
                    emit({
                        t: Date.now(),
                        type: 'awaiting_input',
                        iteration: index,
                        kind: 'free_text',
                    })
                })
            })
        })
    }
}
