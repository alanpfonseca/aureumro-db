import type { DropSource } from "../types";
import { tRace, tElement } from "../lib/i18n";
import { useModalNav } from "../lib/modalNav";

// Taxa de drop com escala de cor: quanto mais raro, mais "quente" o rotulo.
// As faixas seguem como o jogador realmente pensa (>10% comum, <0,1% carta/raro).
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

interface Props {
  drops: DropSource[];
  total: number;
}

export function DropTable({ drops, total }: Props) {
  const { openModal } = useModalNav();

  if (!drops.length) return null;

  return (
    <section className="drops">
      <h2>
        Onde dropa
        <span className="drops-count">
          {total} {total === 1 ? "fonte" : "fontes"}
        </span>
      </h2>

      <table className="drop-table">
        <thead>
          <tr>
            <th>Monstro</th>
            <th className="num">Nv.</th>
            <th className="num">Chance</th>
            <th>Mapas onde aparece</th>
          </tr>
        </thead>
        <tbody>
          {drops.map((d, i) => (
            <tr key={`${d.mob}-${i}`}>
              <td>
                <button
                  className="link-btn mob-name"
                  onClick={() => openModal(`/mob/${d.mob}`)}
                >
                  {d.name}
                </button>
                {d.mvpMob && <span className="badge mvp">MVP</span>}
                {d.mvp && <span className="badge mvp-drop">drop de MVP</span>}
                {d.race && (
                  <div className="mob-meta">
                    {tRace(d.race)}
                    {d.element ? ` · ${tElement(d.element)}` : ""}
                  </div>
                )}
              </td>
              <td className="num">{d.level ?? "—"}</td>
              <td className="num">
                <span className={`rate ${rateClass(d.rate)}`}>{fmtRate(d.rate)}</span>
              </td>
              <td>
                {d.maps.length === 0 ? (
                  <span className="dim">sem spawn fixo (invocado / evento)</span>
                ) : (
                  <span className="maps">
                    {d.maps.map((m) => (
                      <button
                        key={m.map}
                        className="map-chip link-btn"
                        title={m.map}
                        onClick={() => openModal(`/map/${m.map}`)}
                      >
                        {m.mapName} <em>×{m.amount}</em>
                      </button>
                    ))}
                    {d.moreMaps > 0 && <span className="dim">+{d.moreMaps} mapas</span>}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {total > drops.length && (
        <p className="dim small">
          Mostrando as {drops.length} fontes de maior chance, de {total}.
        </p>
      )}
    </section>
  );
}
