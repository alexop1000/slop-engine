import type { Vector3 } from 'babylonjs'
import { For } from 'solid-js'
import { Input } from './Input'

const axes = ['x', 'y', 'z'] as const

export interface Vector3InputProps {
    value: () => Vector3 | undefined
    onChange: (axis: 'x' | 'y' | 'z', value: number) => void
}

export function Vector3Input(props: Vector3InputProps) {
    return (
        <div class="grid grid-cols-3 gap-2">
            <For each={axes}>
                {(axis) => (
                    <Input
                        label={axis.toUpperCase()}
                        value={props.value()?.[axis]?.toFixed(3)}
                        onChange={(e) => {
                            props.onChange(
                                axis,
                                Number.parseFloat(e.currentTarget.value)
                            )
                        }}
                    />
                )}
            </For>
        </div>
    )
}
