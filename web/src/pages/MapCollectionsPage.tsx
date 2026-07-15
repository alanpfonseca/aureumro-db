import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { MapCollection, MapCollectionsFile } from "../types";
import { getMapCollections } from "../lib/queries";
import { deaccent } from "../lib/deaccent";
import { ItemIcon } from "../components/ItemIcon";
import { Header } from "../components/Header";

export function MapCollectionsPage() {
  const [data, setData] = useState<MapCollectionsFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    getMapCollections().then(setData).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    document.title = "Coleções de Mapa — AureumRO DB";
    return () => {
      document.title = "AureumRO — Database de Itens";
    };
  }, []);

  const cities = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.collections.map((c) => c.city))].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
  }, [data]);

  const collections = useMemo<MapCollection[]>(() => {
    if (!data) return [];
    let list = data.collections;
    if (city) list = list.filter((c) => c.city === city);
    const t = deaccent(text.trim());
    if (!t) return list;
    // Busca simples por substring no nome do mapa, cidade, bônus e itens.
    return list.filter(
      (c) =>
        deaccent(c.name).includes(t) ||
        deaccent(c.city).includes(t) ||
        deaccent(c.bonus).includes(t) ||
        c.items.some((i) => deaccent(i.name).includes(t)),
    );
  }, [data, city, text]);

  if (error) {
    return (
      <div className="app">
        <Header />
        <div className="center-note">
          Erro ao carregar as coleções: {error}
          <br />
          Rode <code>py tools/build_maps.py</code> para gravar as coleções no banco.
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header tagline={data ? `${data.collections.length} coleções de mapa` : "Carregando…"}>
        <div className="searchbar">
          <input
            autoFocus
            placeholder="Buscar coleção por mapa, bônus ou item (ex.: thanatos, crítico, ferro)…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <select
            className="city-select"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-label="Filtrar por cidade"
          >
            <option value="">Todas as cidades</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </Header>

      {!data ? (
        <div className="center-note">
          <span className="spinner" /> Carregando coleções…
        </div>
      ) : collections.length === 0 ? (
        <div className="center-note">Nenhuma coleção corresponde à busca.</div>
      ) : (
        <div className="quest-grid">
          {collections.map((c) => (
            <article key={c.id} className="quest-card">
              <div className="quest-hat">
                <span className="quest-hat-name">{c.name}</span>
              </div>
              <div className="mapcol-city dim">Cidade: {c.city}</div>
              <div className="mapcol-bonus">{c.bonus}</div>
              <ul className="quest-ings">
                {c.items.map((ing, i) => (
                  <li key={i}>
                    {ing.itemId != null ? (
                      <Link to={`/item/${ing.itemId}`} className="quest-ing">
                        <ItemIcon id={ing.itemId} hasIcon={ing.icon === 1} name={ing.name} size={24} />
                        <span className="quest-ing-amount">{ing.amount}x</span>
                        <span>{ing.name}</span>
                      </Link>
                    ) : (
                      <span className="quest-ing dim">
                        <span className="quest-ing-amount">{ing.amount}x</span>
                        <span>{ing.name}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      <footer className="footer">
        <p>
          Coleções transcritas da planilha oficial do AureumRO. Complete os itens da coleção para
          ganhar o bônus do mapa. Clique em um item para abrir a página dele.
        </p>
      </footer>
    </div>
  );
}
