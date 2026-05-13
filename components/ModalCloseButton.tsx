import ModalIconButton from "./ModalIconButton"

export default function ModalCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <ModalIconButton onClick={onClick} label="Close">
      ×
    </ModalIconButton>
  )
}
