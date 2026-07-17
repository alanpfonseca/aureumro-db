import { useParams } from "react-router-dom";
import { Modal } from "../Modal";
import { MobDetailView } from "../MobDetailView";
import { useModalNav } from "../../lib/modalNav";

export function MobModal() {
  const { id } = useParams();
  const { closeModal } = useModalNav();
  const mobId = Number(id);

  return (
    <Modal onClose={closeModal} label={`Monstro ${mobId}`}>
      <MobDetailView mobId={mobId} />
    </Modal>
  );
}
