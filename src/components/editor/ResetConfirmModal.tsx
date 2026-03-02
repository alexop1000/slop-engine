import {
    Button,
    Modal,
    ModalHeader,
    ModalBody,
    ModalFooter,
} from '../ui'

interface ResetConfirmModalProps {
    open: boolean
    onClose: () => void
    onConfirm: () => void | Promise<void>
}

export function ResetConfirmModal(
    props: Readonly<ResetConfirmModalProps>
) {
    return (
        <Modal open={props.open} onClose={props.onClose}>
            <ModalHeader>Reset Scene</ModalHeader>
            <ModalBody>
                <p class="text-sm text-gray-300">
                    This will clear the scene, all assets, and chat history. This
                    cannot be undone.
                </p>
            </ModalBody>
            <ModalFooter>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => props.onClose()}
                >
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={async () => {
                        props.onClose()
                        await props.onConfirm()
                    }}
                >
                    Reset
                </Button>
            </ModalFooter>
        </Modal>
    )
}
