import { useParams } from "react-router-dom";
import { Modal } from "../Modal";
import { MapDetailView } from "../MapDetailView";
import { useModalNav } from "../../lib/modalNav";

export function MapModal() {
  const { mapId } = useParams();
  const { closeModal } = useModalNav();
  if (!mapId) return null;

  return (
    <Modal onClose={closeModal} label={`Mapa ${mapId}`}>
      <MapDetailView mapId={mapId} />
    </Modal>
  );
}
