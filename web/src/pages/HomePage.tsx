import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { IndexRecord, Meta } from "../types";
import { loadIndex, loadMeta } from "../lib/data";
import {
  buildSearch,
  applyFilters,
  emptyFilters,
  hasActiveFacets,
  type Filters,
} from "../lib/search";
import type MiniSearch from "minisearch";
import { ItemIcon } from "../components/ItemIcon";
import { FiltersPanel } from "../components/FiltersPanel";
import { Footer } from "../components/Footer";

export function HomePage() {
  const [records, setRecords] = useState<IndexRecord[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ms, setMs] = useState<MiniSearch<IndexRecord> | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([loadIndex(), loadMeta()])
      .then(([recs, m]) => {
        setRecords(recs);
        setMeta(m);
        // Construir o indice de 20k docs leva ~1s; fora do caminho critico do primeiro paint.
        setMs(buildSearch(recs));
      })
      .catch((e) => setError(String(e)));
  }, []);

  const byId = useMemo(() => {
    const map = new Map<number, IndexRecord>();
    records?.forEach((r) => map.set(r.id, r));
    return map;
  }, [records]);

  const results = useMemo<IndexRecord[]>(() => {
    if (!records) return [];
    const text = filters.text.trim();

    let base: IndexRecord[];
    if (text && ms) {
      // MiniSearch devolve ids ordenados por relevancia; preserva essa ordem.
      base = ms
        .search(text)
        .map((r) => byId.get(r.id as number))
        .filter((r): r is IndexRecord => !!r);
    } else {
      base = records;
    }

    if (!hasActiveFacets(filters)) return base;
    return base.filter((r) => applyFilters(r, filters));
  }, [records, ms, byId, filters]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 12,
  });

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
      <header className="header">
        <div className="header-row">
          <div className="logo">
            <span className="gold">Aureum</span>RO
          </div>
          <span className="tagline">
            Database de itens do servidor{meta ? ` — ${meta.total.toLocaleString("pt-BR")} itens` : ""}
          </span>
        </div>
        <div className="searchbar">
          <input
            autoFocus
            placeholder="Buscar por nome ou descrição (ex.: pocao, carta, espada)…"
            value={filters.text}
            onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))}
          />
        </div>
      </header>

      <div className="main">
        <FiltersPanel meta={meta} filters={filters} setFilters={setFilters} />

        <section>
          <div className="results-head">
            <span>
              {records ? `${results.length.toLocaleString("pt-BR")} resultado${results.length === 1 ? "" : "s"}` : "Carregando…"}
            </span>
            {!ms && records && <span>indexando busca…</span>}
          </div>

          {!records ? (
            <div className="center-note">
              <span className="spinner" /> Carregando database…
            </div>
          ) : results.length === 0 ? (
            <div className="center-note">Nenhum item corresponde aos filtros.</div>
          ) : (
            <div
              className="list"
              ref={parentRef}
              style={{ height: "calc(100vh - 210px)", overflow: "auto" }}
            >
              <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
                {rowVirtualizer.getVirtualItems().map((v) => {
                  const rec = results[v.index];
                  return (
                    <div
                      key={rec.id}
                      className="row"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: v.size,
                        transform: `translateY(${v.start}px)`,
                      }}
                      onClick={() => navigate(`/item/${rec.id}`)}
                    >
                      <ItemIcon id={rec.id} hasIcon={rec.ic === 1} name={rec.n} size={32} />
                      <div className="row-main">
                        <div className="row-name" style={rec.col ? { color: rec.col } : undefined}>
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
