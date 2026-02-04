import { Icon } from 'solid-heroicons'
import { plus } from 'solid-heroicons/solid'

export default function ScenePanel() {
    return (
        <>
            <h1>Scene</h1>
            <p>This is the scene window. You can use it to view the scene.</p>
            <Icon path={plus} class="size-4" />
        </>
    )
}
