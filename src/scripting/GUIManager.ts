import { Scene } from 'babylonjs'
import {
    AdvancedDynamicTexture,
    Button,
    TextBlock,
    Control,
    Rectangle,
} from '@babylonjs/gui'

/** Options shared by all GUI controls. */
export interface GuiControlOptions {
    /** Horizontal position. CSS-style string ("20px", "50%") or pixel number. Default: "0px". */
    left?: string | number
    /** Vertical position. CSS-style string ("20px", "50%") or pixel number. Default: "0px". */
    top?: string | number
    /** Width. CSS-style string ("200px", "20%") or pixel number. Default: "200px". */
    width?: string | number
    /** Height. CSS-style string ("40px") or pixel number. Default: "40px". */
    height?: string | number
    /** Horizontal alignment: "left" | "center" | "right". Default: "center". */
    horizontalAlignment?: 'left' | 'center' | 'right'
    /** Vertical alignment: "top" | "center" | "bottom". Default: "center". */
    verticalAlignment?: 'top' | 'center' | 'bottom'
}

/** Options for creating a GUI button. */
export interface GuiButtonOptions extends GuiControlOptions {
    /** Background color (CSS string, e.g. "#336699" or "rgba(0,0,0,0.5)"). Default: "#2a6496". */
    color?: string
    /** Text color. Default: "white". */
    textColor?: string
    /** Font size in pixels. Default: 16. */
    fontSize?: number
    /** Corner radius in pixels. Default: 4. */
    cornerRadius?: number
}

/** Options for creating a GUI text label. */
export interface GuiLabelOptions extends GuiControlOptions {
    /** Text color. Default: "white". */
    color?: string
    /** Font size in pixels. Default: 16. */
    fontSize?: number
    /** Text alignment: "left" | "center" | "right". Default: "center". */
    textAlignment?: 'left' | 'center' | 'right'
    /** Whether to enable text wrapping. Default: true. */
    wordWrap?: boolean
}

/** Options for creating a GUI panel (a background rectangle). */
export interface GuiPanelOptions extends GuiControlOptions {
    /** Fill color for the panel background. Default: "rgba(0,0,0,0.5)". */
    color?: string
    /** Border color. Default: "transparent". */
    borderColor?: string
    /** Border thickness in pixels. Default: 0. */
    borderThickness?: number
    /** Corner radius in pixels. Default: 0. */
    cornerRadius?: number
    /** Overall opacity from 0 to 1. Default: 1. */
    alpha?: number
}

const H_ALIGN_MAP = {
    left: Control.HORIZONTAL_ALIGNMENT_LEFT,
    center: Control.HORIZONTAL_ALIGNMENT_CENTER,
    right: Control.HORIZONTAL_ALIGNMENT_RIGHT,
} as const

const V_ALIGN_MAP = {
    top: Control.VERTICAL_ALIGNMENT_TOP,
    center: Control.VERTICAL_ALIGNMENT_CENTER,
    bottom: Control.VERTICAL_ALIGNMENT_BOTTOM,
} as const

function toPx(value: string | number | undefined, fallback: string): string {
    if (value === undefined) return fallback
    if (typeof value === 'number') return `${value}px`
    return value
}

/**
 * BabylonJS GUI uses left/top as offsets from the alignment anchor.
 * With center alignment, 0 = centered. So left: '50%' + top: '50%' (intended
 * as "center" in CSS terms) actually places the control in the bottom-right.
 * Convert this common pattern to proper centering: left: 0, top: 0.
 */
function normalizePosition(
    left: string | number | undefined,
    top: string | number | undefined,
    hAlign: 'left' | 'center' | 'right' | undefined,
    vAlign: 'top' | 'center' | 'bottom' | undefined
): { left: string; top: string } {
    const wantCenter =
        (hAlign === undefined || hAlign === 'center') &&
        (vAlign === undefined || vAlign === 'center')
    const leftStr = typeof left === 'string' ? left.trim() : ''
    const topStr = typeof top === 'string' ? top.trim() : ''
    const isCenterPattern = leftStr === '50%' && topStr === '50%'

    if (wantCenter && isCenterPattern) {
        return { left: '0px', top: '0px' }
    }
    return {
        left: toPx(left, '0px'),
        top: toPx(top, '0px'),
    }
}

/** Handle returned by `createButton`. Use it to respond to clicks and update the button. */
export class GuiButtonHandle {
    private readonly _button: Button
    private readonly _manager: GUIManager

    /** @internal */
    constructor(button: Button, manager: GUIManager) {
        this._button = button
        this._manager = manager
    }

    /** Register a callback that fires when the button is clicked. Returns `this` for chaining. */
    onClick(callback: () => void): this {
        this._button.onPointerClickObservable.add(callback)
        return this
    }

    /** Change the button's label text. */
    setText(text: string): this {
        if (this._button.textBlock) {
            this._button.textBlock.text = text
        }
        return this
    }

    /** Show or hide the button. */
    setVisible(visible: boolean): this {
        this._button.isVisible = visible
        return this
    }

    /** Set button background color (CSS string). */
    setColor(color: string): this {
        this._button.background = color
        return this
    }

    /** Remove this button from the GUI. */
    remove(): void {
        this._manager._removeControl(this._button)
    }
}

/** Handle returned by `createLabel`. Use it to update the label text at runtime. */
export class GuiLabelHandle {
    private readonly _text: TextBlock
    private readonly _manager: GUIManager

    /** @internal */
    constructor(text: TextBlock, manager: GUIManager) {
        this._text = text
        this._manager = manager
    }

    /** Change the displayed text. */
    setText(text: string): this {
        this._text.text = text
        return this
    }

    /** Show or hide the label. */
    setVisible(visible: boolean): this {
        this._text.isVisible = visible
        return this
    }

    /** Set the text color (CSS string). */
    setColor(color: string): this {
        this._text.color = color
        return this
    }

    /** Remove this label from the GUI. */
    remove(): void {
        this._manager._removeControl(this._text)
    }
}

/** Handle returned by `createPanel`. Use it to update the panel at runtime. */
export class GuiPanelHandle {
    private readonly _panel: Rectangle
    private readonly _manager: GUIManager

    /** @internal */
    constructor(panel: Rectangle, manager: GUIManager) {
        this._panel = panel
        this._manager = manager
    }

    /** Show or hide the panel. */
    setVisible(visible: boolean): this {
        this._panel.isVisible = visible
        return this
    }

    /** Set panel background color (CSS string). */
    setColor(color: string): this {
        this._panel.background = color
        return this
    }

    /** Set panel border color (CSS string). */
    setBorderColor(color: string): this {
        this._panel.color = color
        return this
    }

    /** Set panel opacity from 0 to 1. */
    setAlpha(alpha: number): this {
        this._panel.alpha = alpha
        return this
    }

    /** Remove this panel from the GUI. */
    remove(): void {
        this._manager._removeControl(this._panel)
    }
}

/**
 * Manages a fullscreen BabylonJS GUI overlay for use during play mode.
 *
 * Accessed via `this.gui` inside scripts. All controls are automatically
 * disposed when play mode stops.
 */
export class GUIManager {
    private readonly _texture: AdvancedDynamicTexture
    private _controls: Control[] = []

    constructor(scene: Scene) {
        // @babylonjs/gui expects @babylonjs/core types; cast to bridge the legacy bundle mismatch.
        this._texture = AdvancedDynamicTexture.CreateFullscreenUI(
            '__slopEngineGui__',
            true,
            scene as any
        )
    }

    private _createRectangle(
        name: string,
        options: GuiControlOptions | undefined,
        defaults: {
            width: string
            height: string
            color: string
            borderColor: string
            borderThickness: number
            cornerRadius: number
            alpha: number
        }
    ): Rectangle {
        const rect = new Rectangle(name)
        const hAlign =
            options?.horizontalAlignment ??
            (options?.left === undefined ? 'center' : 'left')
        const vAlign =
            options?.verticalAlignment ??
            (options?.top === undefined ? 'center' : 'top')
        const pos = normalizePosition(
            options?.left,
            options?.top,
            hAlign,
            vAlign
        )

        rect.width = toPx(options?.width, defaults.width)
        rect.height = toPx(options?.height, defaults.height)
        rect.left = pos.left
        rect.top = pos.top
        rect.horizontalAlignment = H_ALIGN_MAP[hAlign]
        rect.verticalAlignment = V_ALIGN_MAP[vAlign]

        return rect
    }

    /**
     * Create a clickable button on the screen.
     *
     * @param name     Internal name for the control.
     * @param text     Label text on the button.
     * @param options  Position, size, color, etc.
     * @returns A {@link GuiButtonHandle} for reacting to clicks and updating the button.
     *
     * @example
     * start() {
     *     const btn = this.gui.createButton('jumpBtn', 'Jump', {
     *         left: '20px', top: '-60px',
     *         horizontalAlignment: 'left',
     *         verticalAlignment: 'bottom',
     *     })
     *     btn.onClick(() => this.log('Jumped!'))
     * }
     */
    createButton(
        name: string,
        text: string,
        options?: GuiButtonOptions
    ): GuiButtonHandle {
        const btn = Button.CreateSimpleButton(name, text)
        const hAlign =
            options?.horizontalAlignment ??
            (options?.left === undefined ? 'center' : 'left')
        const vAlign =
            options?.verticalAlignment ??
            (options?.top === undefined ? 'center' : 'top')
        const pos = normalizePosition(
            options?.left,
            options?.top,
            hAlign,
            vAlign
        )

        btn.width = toPx(options?.width, '200px')
        btn.height = toPx(options?.height, '40px')
        btn.left = pos.left
        btn.top = pos.top
        btn.background = options?.color ?? '#2a6496'
        btn.cornerRadius = options?.cornerRadius ?? 4
        btn.horizontalAlignment = H_ALIGN_MAP[hAlign]
        btn.verticalAlignment = V_ALIGN_MAP[vAlign]

        if (btn.textBlock) {
            btn.textBlock.color = options?.textColor ?? 'white'
            btn.textBlock.fontSize = options?.fontSize ?? 16
        }

        this._texture.addControl(btn)
        this._controls.push(btn)

        return new GuiButtonHandle(btn, this)
    }

    /**
     * Create a text label on the screen.
     *
     * @param name     Internal name for the control.
     * @param text     Initial text to display.
     * @param options  Position, size, color, etc.
     * @returns A {@link GuiLabelHandle} for updating the text at runtime.
     *
     * @example
     * start() {
     *     this._scoreLabel = this.gui.createLabel('score', 'Score: 0', {
     *         top: '20px',
     *         verticalAlignment: 'top',
     *         color: 'yellow',
     *         fontSize: 24,
     *     })
     * }
     *
     * update() {
     *     this._scoreLabel.setText('Score: ' + this._score)
     * }
     */
    createLabel(
        name: string,
        text: string,
        options?: GuiLabelOptions
    ): GuiLabelHandle {
        const label = new TextBlock(name, text)
        const hAlign =
            options?.horizontalAlignment ??
            (options?.left === undefined ? 'center' : 'left')
        const vAlign =
            options?.verticalAlignment ??
            (options?.top === undefined ? 'center' : 'top')
        const pos = normalizePosition(
            options?.left,
            options?.top,
            hAlign,
            vAlign
        )

        const hasExplicitWidth = options?.width !== undefined
        const hasExplicitHeight = options?.height !== undefined
        label.width = toPx(options?.width, '200px')
        label.height = toPx(options?.height, '40px')
        label.left = pos.left
        label.top = pos.top
        label.color = options?.color ?? 'white'
        label.fontSize = options?.fontSize ?? 16
        label.textWrapping = hasExplicitWidth
            ? options?.wordWrap ?? true
            : false
        label.horizontalAlignment = H_ALIGN_MAP[hAlign]
        label.verticalAlignment = V_ALIGN_MAP[vAlign]
        if (!hasExplicitWidth && !hasExplicitHeight) {
            label.resizeToFit = true
        }

        const textHAlign =
            options?.textAlignment ??
            (hAlign === 'left'
                ? 'left'
                : hAlign === 'right'
                ? 'right'
                : 'center')
        const textVAlign =
            vAlign === 'top'
                ? Control.VERTICAL_ALIGNMENT_TOP
                : vAlign === 'bottom'
                ? Control.VERTICAL_ALIGNMENT_BOTTOM
                : Control.VERTICAL_ALIGNMENT_CENTER
        switch (textHAlign) {
            case 'left':
                label.textHorizontalAlignment =
                    Control.HORIZONTAL_ALIGNMENT_LEFT
                break
            case 'right':
                label.textHorizontalAlignment =
                    Control.HORIZONTAL_ALIGNMENT_RIGHT
                break
            default:
                label.textHorizontalAlignment =
                    Control.HORIZONTAL_ALIGNMENT_CENTER
                break
        }
        label.textVerticalAlignment = textVAlign

        this._texture.addControl(label)
        this._controls.push(label)

        return new GuiLabelHandle(label, this)
    }

    /**
     * Create a panel (background rectangle) on the screen.
     * Useful for HUD/menu backgrounds behind labels and buttons.
     */
    createPanel(name: string, options?: GuiPanelOptions): GuiPanelHandle {
        const panel = this._createRectangle(name, options, {
            width: '260px',
            height: '140px',
            color: 'rgba(0,0,0,0.5)',
            borderColor: 'transparent',
            borderThickness: 0,
            cornerRadius: 0,
            alpha: 1,
        })

        panel.background = options?.color ?? 'rgba(0,0,0,0.5)'
        panel.color = options?.borderColor ?? 'transparent'
        panel.thickness = options?.borderThickness ?? 0
        panel.cornerRadius = options?.cornerRadius ?? 0
        panel.alpha = options?.alpha ?? 1

        this._texture.addControl(panel)
        this._controls.push(panel)

        return new GuiPanelHandle(panel, this)
    }

    /** @internal Remove a single control from the texture. */
    _removeControl(control: Control): void {
        this._texture.removeControl(control)
        control.dispose()
        const idx = this._controls.indexOf(control)
        if (idx !== -1) this._controls.splice(idx, 1)
    }

    /** Dispose the entire GUI overlay. Called by RuntimeWorld on stop. */
    dispose(): void {
        this._texture.dispose()
        this._controls = []
    }
}
