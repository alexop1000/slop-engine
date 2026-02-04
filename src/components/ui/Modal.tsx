import { JSX, splitProps, Show, createEffect, onCleanup } from 'solid-js'
import { Portal } from 'solid-js/web'

export interface ModalProps {
    open: boolean
    onClose: () => void
    children: JSX.Element
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
    closeOnOverlayClick?: boolean
    closeOnEscape?: boolean
    class?: string
}

export interface ModalHeaderProps extends JSX.HTMLAttributes<HTMLDivElement> {}
export interface ModalBodyProps extends JSX.HTMLAttributes<HTMLDivElement> {}
export interface ModalFooterProps extends JSX.HTMLAttributes<HTMLDivElement> {}

const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl',
}

export function Modal(props: ModalProps) {
    const [local] = splitProps(props, [
        'open',
        'onClose',
        'children',
        'size',
        'closeOnOverlayClick',
        'closeOnEscape',
        'class',
    ])

    const size = () => local.size ?? 'md'
    const closeOnOverlay = () => local.closeOnOverlayClick ?? true
    const closeOnEsc = () => local.closeOnEscape ?? true

    createEffect(() => {
        if (!local.open) return

        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && closeOnEsc()) {
                local.onClose()
            }
        }

        document.addEventListener('keydown', handleKeydown)
        document.body.style.overflow = 'hidden'

        onCleanup(() => {
            document.removeEventListener('keydown', handleKeydown)
            document.body.style.overflow = ''
        })
    })

    return (
        <Show when={local.open}>
            <Portal>
                <div class="fixed inset-0 z-50 overflow-y-auto">
                    {/* Overlay */}
                    <div
                        class="fixed inset-0 bg-black/50 transition-opacity"
                        onClick={() => closeOnOverlay() && local.onClose()}
                    />
                    {/* Modal */}
                    <div class="flex min-h-full items-center justify-center p-4">
                        <div
                            class={`
                                relative w-full transform rounded-lg
                                bg-white dark:bg-gray-800
                                text-left shadow-xl transition-all
                                ${sizeClasses[size()]}
                                ${local.class ?? ''}
                            `}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {local.children}
                        </div>
                    </div>
                </div>
            </Portal>
        </Show>
    )
}

export function ModalHeader(props: ModalHeaderProps) {
    const [local, rest] = splitProps(props, ['class', 'children'])

    return (
        <div
            class={`
                px-6 py-4 border-b border-gray-200 dark:border-gray-700
                ${local.class ?? ''}
            `}
            {...rest}
        >
            <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {local.children}
            </h3>
        </div>
    )
}

export function ModalBody(props: ModalBodyProps) {
    const [local, rest] = splitProps(props, ['class', 'children'])

    return (
        <div class={`px-6 py-4 ${local.class ?? ''}`} {...rest}>
            {local.children}
        </div>
    )
}

export function ModalFooter(props: ModalFooterProps) {
    const [local, rest] = splitProps(props, ['class', 'children'])

    return (
        <div
            class={`
                px-6 py-4 border-t border-gray-200 dark:border-gray-700
                flex items-center justify-end space-x-3
                ${local.class ?? ''}
            `}
            {...rest}
        >
            {local.children}
        </div>
    )
}
