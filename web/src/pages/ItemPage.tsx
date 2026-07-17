import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Header } from "../components/Header";
import { ItemDetailView } from "../components/ItemDetailView";

export function ItemPage() {
  const { id } = useParams();
  const itemId = Number(id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [itemId]);

  return (
    <div className="app">
      <Header />
      <Link className="back-link" to="/">← Voltar para a busca</Link>
      <ItemDetailView itemId={itemId} />
    </div>
  );
}
