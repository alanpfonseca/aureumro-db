import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ListRow, Meta } from "../types";
import { countItems, getMeta, queryItemsWindow } from "../lib/queries";
import { emptyFilters, type Filters } from "../lib/filters";
import { saveHomeSession, takeHomeSession } from "../lib/homeSession";
import { readableColor } from "../lib/rotext";
import { ItemIcon } from "../components/ItemIcon";
import { FiltersPanel } from "../components/FiltersPanel";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";

// A listagem e paginada por SQL: COUNT(*) + janelas de CHUNK linhas sob demanda do
// virtualizer. Nada e carregado em massa -- o worker do SQLite baixa so as paginas
// do banco que essas queries tocam.
const CHUNK = 200;

export function HomePage() {
  // Sessao anterior (voltar do item): filtros + scroll restaurados.
  const restored = useRef(takeHomeSession());
  const [filters, setFilters] = useState<Filters>(
    () => restored.current?.filters ?? emptyFilters(),
  );
  // Filtros efetivos das queries: texto e debounced (200 ms), facetas aplicam direto.
  const [queryFilters, setQueryFilters] = useState<Filters>(filters);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setRowsVersion] = useState(0); // re-render quando uma janela chega
  const navigate = useNavigate();

  const rowCache = useRef(new Map<number, ListRow>()); // indice -> linha
  const inflight = useRef(new Set<number>()); // offsets de chunk em voo
  const gen = useRef(0); // geracao da query: resultado obsoleto e descartado

  useEffect(() => {
    getMeta().then(setMeta).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (filters === queryFilters) return;
    if (filters.text !== queryFilters.text) {
      const t = setTimeout(() => setQueryFilters(filters), 200);
      return () => clearTimeout(t);
    }
    setQueryFilters(filters); // so facetas mudaram: aplica imediato
  }, [filters, queryFilters]);

  // Nova consulta: invalida cache/janelas e busca a contagem.
  useEffect(() => {
    const g = ++gen.current;
    rowCache.current.clear();
    inflight.current.clear();
    setCount(null);
    countItems(queryFilters)
      .then((total) => {
        if (gen.current === g) setCount(total);
      })
      .catch((e) => setError(String(e)));
  }, [queryFilters]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: count ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 12,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const firstIdx = virtualItems[0]?.index ?? 0;
  const lastIdx = virtualItems[virtualItems.length - 1]?.index ?? 0;

  // Busca as janelas visiveis que ainda nao estao no cache.
  useEffect(() => {
    if (count == null || count === 0) return;
    const g = gen.current;
    const start = Math.floor(firstIdx / CHUNK) * CHUNK;
    const end = Math.min(lastIdx, count - 1);
    for (let cs = start; cs <= end; cs += CHUNK) {
      if (rowCache.current.has(cs) || inflight.current.has(cs)) continue;
      inflight.current.add(cs);
      queryItemsWindow(queryFilters, cs, CHUNK)
        .then((rows) => {
          if (gen.current !== g) return;
          rows.forEach((r, i) => rowCache.current.set(cs + i, r));
          setRowsVersion((v) => v + 1);
        })
        .catch((e) => setError(String(e)))
        .finally(() => {
          if (gen.current === g) inflight.current.delete(cs);
        });
    }
  }, [firstIdx, lastIdx, count, queryFilters]);

  // Restaura o scroll da sessao anterior assim que a contagem chega.
  const didRestoreScroll = useRef(false);
  useEffect(() => {
    if (didRestoreScroll.current || count == null) return;
    didRestoreScroll.current = true;
    const offset = restored.current?.scrollOffset;
    if (offset) rowVirtualizer.scrollToOffset(offset);
  }, [count, rowVirtualizer]);

  // Salva a sessao ao sair da pagina. O scroll e rastreado via onScroll num ref:
  // no unmount o React ja desanexou parentRef antes do cleanup do useEffect rodar,
  // entao ler scrollTop direto do elemento aqui devolveria sempre 0.
  const scrollOffsetRef = useRef(restored.current?.scrollOffset ?? 0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  useEffect(() => {
    return () => {
      saveHomeSession({
        filters: filtersRef.current,
        scrollOffset: scrollOffsetRef.current,
      });
    };
  }, []);

  if (error) {
    return (
      <div className="app">
        <div className="center-note">
          Erro ao carregar os dados: {error}
          <br />
          Rode o pipeline (tools/) e depois <code>npm run dev</code>.
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        tagline={
          <>Database de itens do servidor{meta ? ` — ${meta.total.toLocaleString("pt-BR")} itens` : ""}</>
        }
      >
        <div className="searchbar">
          <input
            autoFocus
            placeholder="Buscar por nome ou descrição (ex.: pocao, carta, espada)…"
            value={filters.text}
            onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))}
          />
        </div>
      </Header>

      <div className="main">
        <FiltersPanel meta={meta} filters={filters} setFilters={setFilters} />

        <section>
          <div className="results-head">
            <span>
              {count != null
                ? `${count.toLocaleString("pt-BR")} resultado${count === 1 ? "" : "s"}`
                : "Carregando…"}
            </span>
          </div>

          {count == null ? (
            <div className="center-note">
              <span className="spinner" /> Consultando database…
            </div>
          ) : count === 0 ? (
            <div className="center-note">Nenhum item corresponde aos filtros.</div>
          ) : (
            <div
              className="list"
              ref={parentRef}
              style={{ height: "calc(100vh - 256px)", overflow: "auto" }}
              onScroll={(e) => (scrollOffsetRef.current = e.currentTarget.scrollTop)}
            >
              <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
                {virtualItems.map((v) => {
                  const rec = rowCache.current.get(v.index);
                  const style: React.CSSProperties = {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: v.size,
                    transform: `translateY(${v.start}px)`,
                  };
                  if (!rec) {
                    // Janela ainda carregando: placeholder do mesmo tamanho da linha.
                    return (
                      <div key={`p${v.index}`} className="row" style={style}>
                        <span className="row-skeleton" />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={rec.id}
                      className="row"
                      style={style}
                      onClick={() => navigate(`/item/${rec.id}`)}
                    >
                      <ItemIcon id={rec.id} hasIcon={rec.ic === 1} name={rec.n} size={32} />
                      <div className="row-main">
                        <div
                          className="row-name"
                          style={rec.col ? { color: readableColor(rec.col) } : undefined}
                        >
                          {rec.n}
                          {rec.sl > 0 ? ` [${rec.sl}]` : ""}
                        </div>
                        <div className="row-sub">
                          <span>{rec.t}</span>
                          {rec.rl ? <span>Nv. {rec.rl}</span> : null}
                          {rec.atk ? <span>ATQ {rec.atk}</span> : null}
                          {rec.def ? <span>DEF {rec.def}</span> : null}
                          {rec.dr === 1 && <span title="algum monstro dropa">▾ dropa</span>}
                        </div>
                      </div>
                      {rec.c === 1 && <span className="badge custom">Custom</span>}
                      {rec.u === 1 && <span className="badge kr">KR</span>}
                      <span className="id-tag">#{rec.id}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <Footer meta={meta} />
    </div>
  );
}
