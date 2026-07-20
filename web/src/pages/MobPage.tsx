import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Header } from "../components/Header";
import { MobDetailView } from "../components/MobDetailView";

export function MobPage() {
  const { id } = useParams();
  const mobId = Number(id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mobId]);

  return (
    <div className="app">
      <Header />
      <Link className="back-link" to="/mobs">← Voltar para monstros</Link>
      <MobDetailView mobId={mobId} />
    </div>
  );
}
