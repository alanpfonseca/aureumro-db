import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Header } from "../components/Header";
import { MapDetailView } from "../components/MapDetailView";

export function MapPage() {
  const { mapId } = useParams();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mapId]);

  if (!mapId) {
    return (
      <div className="app">
        <Header />
        <div className="center-note">Mapa não especificado.</div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header />
      <Link className="back-link" to="/mobs">← Voltar para monstros</Link>
      <MapDetailView mapId={mapId} />
    </div>
  );
}
