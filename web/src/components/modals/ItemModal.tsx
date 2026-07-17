import { useParams } from "react-router-dom";
import { Modal } from "../Modal";
import { ItemDetailView } from "../ItemDetailView";
import { useModalNav } from "../../lib/modalNav";

export function ItemModal() {
  const { id } = useParams();
  const { closeModal } = useModalNav();
  const itemId = Number(id);

  return (
    <Modal onClose={closeModal} label={`Item ${itemId}`}>
      <ItemDetailView itemId={itemId} />
    </Modal>
  );
}
