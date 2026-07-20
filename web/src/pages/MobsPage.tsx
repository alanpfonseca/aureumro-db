import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Meta, MobRow } from "../types";
import { getMeta, listMobs } from "../lib/queries";
import { emptyMobFilters, type MobFilters } from "../lib/mobFilters";
import { saveMobSession, takeMobSession } from "../lib/mobSession";
import { mobSpriteUrl } from "../lib/data";
import { tElement, tRace, tSize } from "../lib/i18n";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { MobFiltersPanel } from "../components/MobFiltersPanel";
import { useModalNav } from "../lib/modalNav";

const ROW_HEIGHT = 56;

export function MobsPage() {
  const restored = useRef(takeMobSession());
  const [filters, setFilters] = useState<MobFilters>(
    () => restored.current?.filters ?? emptyMobFilters(),
  );
  const [queryFilters, setQueryFilters] = useState<MobFilters>(filters);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [mobs, setMobs] = useState<MobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { openModal } = useModalNav();

  useEffect(() => {
    getMeta().then(setMeta).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQueryFilters(filters), 200);
    return () => clearTimeout(t);
  }, [filters]);

  useEffect(() => {
    document.title = "Monstros — AureumRO DB";
    return () => {
      document.title = "AureumRO — Database de Itens";
    };
  }, []);

  useEffect(() => {
    listMobs(queryFilters)
      .then(setMobs)
      .catch((e) => setError(String(e)));
  }, [queryFilters]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: mobs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Salva sessao ao sair.
  const scrollOffsetRef = useRef(restored.current?.scrollOffset ?? 0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  useEffect(() => {
    return () => {
      saveMobSession({
        filters: filtersRef.current,
        scrollOffset: scrollOffsetRef.current,
      });
    };
  }, []);

  // Restaura scroll quando a lista chega.
  const didRestoreScroll = useRef(false);
  useEffect(() => {
    if (didRestoreScroll.current || mobs.length === 0) return;
    didRestoreScroll.current = true;
    const offset = restored.current?.scrollOffset;
    if (offset) rowVirtualizer.scrollToOffset(offset);
  }, [mobs.length, rowVirtualizer]);

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
          meta ? `${meta.mobs.toLocaleString("pt-BR")} monstros` : "Carregando…"
        }
      >
        <div className="searchbar">
          <input
            autoFocus
            placeholder="Buscar monstro por nome (ex.: poring, pharaoh)…"
            value={filters.text}
            onChange={(e) => setFilters((f) => ({ ...f, text: e.target.value }))}
          />
        </div>
      </Header>

      <div className="main">
        <MobFiltersPanel meta={meta} filters={filters} setFilters={setFilters} />

        <section style={{ minWidth: 0 }}>
          <div className="results-head">
            <span>
              {mobs.length.toLocaleString("pt-BR")} resultado
              {mobs.length === 1 ? "" : "s"}
            </span>
          </div>

          {mobs.length === 0 ? (
            <div className="center-note">Nenhum monstro corresponde aos filtros.</div>
          ) : (
            <div
              className="list"
              ref={parentRef}
              style={{ height: "calc(100vh - 256px)", overflow: "auto" }}
              onScroll={(e) => (scrollOffsetRef.current = e.currentTarget.scrollTop)}
            >
              <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
                {rowVirtualizer.getVirtualItems().map((v) => {
                  const m = mobs[v.index];
                  return (
                    <div
                      key={m.id}
                      className="row"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: v.size,
                        transform: `translateY(${v.start}px)`,
                      }}
                      onClick={() => openModal(`/mob/${m.id}`)}
                    >
                      <img
                        src={mobSpriteUrl(m.id)}
                        alt={m.n}
                        width={40}
                        height={40}
                        loading="lazy"
                        className="item-icon"
                        style={{ imageRendering: "auto" }}
                      />
                      <div className="row-main">
                        <div className="row-name">
                          {m.n}
                          {m.mvp === 1 && <span className="badge mvp">MVP</span>}
                        </div>
                        <div className="row-sub">
                          <span>Nv. {m.lv}</span>
                          <span>HP {m.hp.toLocaleString("pt-BR")}</span>
                          <span>{tRace(m.race)}</span>
                          <span>{tElement(m.el)} {m.elv}</span>
                          <span>{tSize(m.sz)}</span>
                        </div>
                      </div>
                      <span className="id-tag">#{m.id}</span>
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
