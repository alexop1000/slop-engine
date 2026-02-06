import { Color3 } from 'babylonjs'

export interface Color3InputProps {
    label?: string
    value: () => Color3 | undefined
    onChange: (color: Color3) => void
}

function color3ToHex(color: Color3): string {
    const r = Math.round(color.r * 255)
        .toString(16)
        .padStart(2, '0')
    const g = Math.round(color.g * 255)
        .toString(16)
        .padStart(2, '0')
    const b = Math.round(color.b * 255)
        .toString(16)
        .padStart(2, '0')
    return `#${r}${g}${b}`
}

function hexToColor3(hex: string): Color3 {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    return new Color3(r, g, b)
}

export function Color3Input(props: Color3InputProps) {
    return (
        <div class="flex items-center gap-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-200 min-w-0 shrink-0">
                {props.label}
            </label>
            <input
                type="color"
                value={props.value() ? color3ToHex(props.value()!) : '#000000'}
                onInput={(e) => {
                    props.onChange(hexToColor3(e.currentTarget.value))
                }}
                class="
                    h-8 w-12 rounded cursor-pointer border
                    border-gray-300 dark:border-gray-600
                    bg-white dark:bg-gray-900
                "
            />
            <span class="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {props.value() ? color3ToHex(props.value()!) : '#000000'}
            </span>
        </div>
    )
}
