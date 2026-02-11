/**
 * Tracks keyboard and mouse state per-frame.
 *
 * Call `attach()` when play starts and `detach()` when play stops.
 * Call `tick()` once at the beginning of each frame so that
 * "pressed this frame" / "released this frame" work correctly.
 */
export class InputManager {
    // ----- Keyboard ----------------------------------------------------------

    /** Keys currently held down. */
    private readonly _keysDown = new Set<string>()
    /** Keys that went down this frame. */
    private readonly _keysPressed = new Set<string>()
    /** Keys that went up this frame. */
    private readonly _keysReleased = new Set<string>()

    // Buffered events between ticks
    private readonly _pendingDown: string[] = []
    private readonly _pendingUp: string[] = []

    // ----- Mouse -------------------------------------------------------------

    mouseX = 0
    mouseY = 0
    mouseDeltaX = 0
    mouseDeltaY = 0

    private readonly _mouseButtons = new Set<number>()

    private _pendingDeltaX = 0
    private _pendingDeltaY = 0

    // ----- Listener refs (for cleanup) ----------------------------------------

    private _onKeyDown: ((e: KeyboardEvent) => void) | null = null
    private _onKeyUp: ((e: KeyboardEvent) => void) | null = null
    private _onPointerMove: ((e: PointerEvent) => void) | null = null
    private _onPointerDown: ((e: PointerEvent) => void) | null = null
    private _onPointerUp: ((e: PointerEvent) => void) | null = null
    private _onBlur: (() => void) | null = null
    private _target: EventTarget | null = null

    // ----- Public API --------------------------------------------------------

    isKeyDown(code: string): boolean {
        return this._keysDown.has(code)
    }

    isKeyPressed(code: string): boolean {
        return this._keysPressed.has(code)
    }

    isKeyReleased(code: string): boolean {
        return this._keysReleased.has(code)
    }

    isMouseButtonDown(button: number): boolean {
        return this._mouseButtons.has(button)
    }

    // ----- Lifecycle ---------------------------------------------------------

    /** Begin listening for input events on the given element. */
    attach(target: HTMLElement): void {
        this._target = target

        this._onKeyDown = (e: KeyboardEvent) => {
            if (!this._keysDown.has(e.code)) {
                this._pendingDown.push(e.code)
            }
            this._keysDown.add(e.code)
        }
        this._onKeyUp = (e: KeyboardEvent) => {
            this._keysDown.delete(e.code)
            this._pendingUp.push(e.code)
        }
        this._onPointerMove = (e: PointerEvent) => {
            this.mouseX = e.clientX
            this.mouseY = e.clientY
            this._pendingDeltaX += e.movementX
            this._pendingDeltaY += e.movementY
        }
        this._onPointerDown = (e: PointerEvent) => {
            this._mouseButtons.add(e.button)
        }
        this._onPointerUp = (e: PointerEvent) => {
            this._mouseButtons.delete(e.button)
        }
        this._onBlur = () => {
            // Clear everything when the window loses focus
            this._keysDown.clear()
            this._mouseButtons.clear()
        }

        // Keyboard events need to be on globalThis/document to work
        // regardless of canvas focus state
        globalThis.addEventListener('keydown', this._onKeyDown)
        globalThis.addEventListener('keyup', this._onKeyUp)
        target.addEventListener('pointermove', this._onPointerMove as EventListener)
        target.addEventListener('pointerdown', this._onPointerDown as EventListener)
        target.addEventListener('pointerup', this._onPointerUp as EventListener)
        globalThis.addEventListener('blur', this._onBlur)
    }

    /** Stop listening and clear all state. */
    detach(): void {
        if (this._onKeyDown) globalThis.removeEventListener('keydown', this._onKeyDown)
        if (this._onKeyUp) globalThis.removeEventListener('keyup', this._onKeyUp)
        if (this._target && this._onPointerMove)
            this._target.removeEventListener('pointermove', this._onPointerMove as EventListener)
        if (this._target && this._onPointerDown)
            this._target.removeEventListener('pointerdown', this._onPointerDown as EventListener)
        if (this._target && this._onPointerUp)
            this._target.removeEventListener('pointerup', this._onPointerUp as EventListener)
        if (this._onBlur) globalThis.removeEventListener('blur', this._onBlur)

        this._onKeyDown = null
        this._onKeyUp = null
        this._onPointerMove = null
        this._onPointerDown = null
        this._onPointerUp = null
        this._onBlur = null
        this._target = null

        this._keysDown.clear()
        this._keysPressed.clear()
        this._keysReleased.clear()
        this._mouseButtons.clear()
        this._pendingDown.length = 0
        this._pendingUp.length = 0
        this.mouseX = 0
        this.mouseY = 0
        this.mouseDeltaX = 0
        this.mouseDeltaY = 0
        this._pendingDeltaX = 0
        this._pendingDeltaY = 0
    }

    /**
     * Call once at the start of each frame.
     * Rotates the pressed/released buffers so per-frame queries work.
     */
    tick(): void {
        this._keysPressed.clear()
        this._keysReleased.clear()

        for (const code of this._pendingDown) this._keysPressed.add(code)
        for (const code of this._pendingUp) this._keysReleased.add(code)

        this._pendingDown.length = 0
        this._pendingUp.length = 0

        this.mouseDeltaX = this._pendingDeltaX
        this.mouseDeltaY = this._pendingDeltaY
        this._pendingDeltaX = 0
        this._pendingDeltaY = 0
    }
}
