import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { HatQuest, HatQuestsFile } from "../types";
import { getHatQuests } from "../lib/queries";
import { deaccent } from "../lib/deaccent";
import { ItemIcon } from "../components/ItemIcon";
import { Header } from "../components/Header";

function fmtZeny(v: number) {
  return `${v.toLocaleString("pt-BR")} z`;
}

export function HatQuestsPage() {
  const [data, setData] = useState<HatQuestsFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const questParam = searchParams.get("quest");

  useEffect(() => {
    getHatQuests().then(setData).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    document.title = "Quests de Chapéu — AureumRO DB";
    return () => {
      document.title = "AureumRO — Database de Itens";
    };
  }, []);

  const quests = useMemo<HatQuest[]>(() => {
    if (!data) return [];
    if (questParam) return data.quests.filter((q) => q.id === questParam);
    const t = deaccent(text.trim());
    if (!t) return data.quests;
    // Busca simples por substring no nome da quest, do chapéu e dos ingredientes.
    return data.quests.filter(
      (q) =>
        deaccent(q.name).includes(t) ||
        deaccent(q.hatName).includes(t) ||
        q.ingredients.some((i) => deaccent(i.name).includes(t)),
    );
  }, [data, questParam, text]);

  if (error) {
    return (
      <div className="app">
        <Header />
        <div className="center-note">
          Erro ao carregar as quests: {error}
          <br />
          Rode <code>py tools/build_hats.py</code> para gravar as quests no banco.
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        tagline={
          data
            ? `${data.quests.length} quests — custo ${fmtZeny(data.zenyCost)} + ingredientes`
            : "Carregando…"
        }
      >
        {questParam ? (
          <button className="clear-btn" onClick={() => setSearchParams({})}>
            Mostrar todas as quests
          </button>
        ) : (
          <div className="searchbar">
            <input
              autoFocus
              placeholder="Buscar quest por chapéu ou ingrediente (ex.: antena, ferro)…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
        )}
      </Header>

      {!data ? (
        <div className="center-note">
          <span className="spinner" /> Carregando quests…
        </div>
      ) : quests.length === 0 ? (
        <div className="center-note">
          {questParam ? `Quest "${questParam}" não encontrada.` : "Nenhuma quest corresponde à busca."}
        </div>
      ) : (
        <div className="quest-grid">
          {quests.map((q) => (
            <article key={q.id} className="quest-card">
              <div className="quest-hat">
                {q.hatId != null ? (
                  <Link to={`/item/${q.hatId}`} className="quest-hat-link">
                    <ItemIcon id={q.hatId} hasIcon={q.hatIcon === 1} name={q.hatName} size={40} />
                    <span className="quest-hat-name">
                      {q.hatName}
                      {q.hatSlots > 0 ? ` [${q.hatSlots}]` : ""}
                    </span>
                  </Link>
                ) : (
                  <span className="quest-hat-name">{q.hatName}</span>
                )}
              </div>
              <div className="quest-cost dim">Custo: {fmtZeny(data.zenyCost)}</div>
              <ul className="quest-ings">
                {q.ingredients.map((ing, i) => (
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
          Ingredientes e custos transcritos da planilha oficial de quests do AureumRO. Clique no
          chapéu ou em um ingrediente para abrir a página do item.
        </p>
      </footer>
    </div>
  );
}
