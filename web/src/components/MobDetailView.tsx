import { useEffect, useState } from "react";
import type { MobDetail } from "../types";
import { getMobDetail } from "../lib/queries";
import { mobSpriteUrl } from "../lib/data";
import { tElement, tRace, tSize } from "../lib/i18n";
import { ItemIcon } from "./ItemIcon";
import { useModalNav } from "../lib/modalNav";

function rateClass(rate: number): string {
  if (rate >= 10) return "rate-common";
  if (rate >= 1) return "rate-uncommon";
  if (rate >= 0.1) return "rate-rare";
  return "rate-veryrare";
}

function fmtRate(rate: number): string {
  if (rate >= 1) return `${rate.toFixed(2).replace(/\.?0+$/, "")}%`;
  return `${rate.toFixed(2)}%`.replace(".", ",");
}

export function MobDetailView({ mobId }: { mobId: number }) {
  const [detail, setDetail] = useState<MobDetail | null | undefined>(undefined);
  const { openModal } = useModalNav();

  useEffect(() => {
    setDetail(undefined);
    getMobDetail(mobId).then(setDetail).catch(() => setDetail(null));
  }, [mobId]);

  useEffect(() => {
    if (detail) document.title = `${detail.mob.n} — AureumRO DB`;
    return () => {
      document.title = "AureumRO — Database de Itens";
    };
  }, [detail]);

  if (detail === undefined) {
    return (
      <div className="center-note">
        <span className="spinner" /> Carregando monstro…
      </div>
    );
  }

  if (detail === null) {
    return <div className="center-note">Monstro #{mobId} não encontrado.</div>;
  }

  const m = detail.mob;

  const stats: Array<[string, React.ReactNode]> = [
    ["HP", m.hp.toLocaleString("pt-BR")],
    ["SP", m.sp.toLocaleString("pt-BR")],
    ["Nível", m.lv],
    ["ATQ", m.atk2 ? `${m.atk1}~${m.atk2}` : m.atk1],
    ["DEF", m.def],
    ["MDEF", m.mdef],
    ["FOR", m.s_str],
    ["AGI", m.s_agi],
    ["VIT", m.s_vit],
    ["INT", m.s_int],
    ["DES", m.s_dex],
    ["SOR", m.s_luk],
    ["Alcance", m.rng],
    ["Vel. Movimento", m.spd],
    ["EXP Base", m.bexp.toLocaleString("pt-BR")],
    ["EXP Job", m.jexp.toLocaleString("pt-BR")],
  ];
  if (m.mvp) stats.push(["EXP MVP", m.mexp.toLocaleString("pt-BR")]);

  return (
    <>
      <div className="detail">
        <div className="detail-media">
          <img
            src={mobSpriteUrl(m.id)}
            alt={m.n}
            width={96}
            height={96}
            loading="lazy"
            className="item-icon"
            style={{ imageRendering: "auto" }}
          />
        </div>

        <div>
          <h1>
            {m.n}
            {m.mvp === 1 && <span className="badge mvp">MVP</span>}
          </h1>
          <div className="row-sub" style={{ marginBottom: 10 }}>
            <span className="id-tag">ID #{m.id}</span>
            <span>
              {tRace(m.race)} · {tElement(m.el)} {m.elv} · {tSize(m.sz)}
            </span>
          </div>

          <table className="facet-table">
            <tbody>
              {stats.map(([label, v]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="drops">
        <h2>Drops</h2>
        {detail.drops.length === 0 ? (
          <p className="dim small">Nenhum drop conhecido.</p>
        ) : (
          <table className="drop-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Chance</th>
              </tr>
            </thead>
            <tbody>
              {detail.drops.map((d, i) => (
                <tr key={`${d.itemId ?? "x"}-${i}`}>
                  <td>
                    {d.itemId != null ? (
                      <button
                        className="link-btn"
                        onClick={() => openModal(`/item/${d.itemId}`)}
                      >
                        <ItemIcon
                          id={d.itemId}
                          hasIcon={d.icon === 1}
                          name={d.name}
                          size={24}
                          cdnFallback
                        />
                        <span style={{ marginLeft: 8 }}>{d.name}</span>
                      </button>
                    ) : (
                      <span>{d.name}</span>
                    )}
                    {d.mvp === 1 && <span className="badge mvp-drop">drop de MVP</span>}
                  </td>
                  <td className="num">
                    <span className={`rate ${rateClass(d.rate)}`}>{fmtRate(d.rate)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="drops">
        <h2>Onde encontrar</h2>
        {detail.spawns.length === 0 ? (
          <p className="dim small">Sem spawn fixo (invocado/evento).</p>
        ) : (
          <div className="maps">
            {detail.spawns.map((s) => (
              <button
                key={s.map}
                className="map-chip link-btn"
                onClick={() => openModal(`/map/${s.map}`)}
              >
                {s.mapName} <em>×{s.amount}</em>
              </button>
            ))}
          </div>
        )}
      </section>

      <footer className="footer">
        <p>
          Stats e drops vêm da base <strong>pré-renewal do rAthena</strong>. Spawns vêm dos
          arquivos <code>npc/pre-re/mobs</code> do rAthena.
        </p>
      </footer>
    </>
  );
}
