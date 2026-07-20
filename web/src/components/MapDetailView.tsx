import { useEffect, useState } from "react";
import type { MapDetail } from "../types";
import { getMapDetail } from "../lib/queries";
import { mapImageUrl } from "../lib/data";
import { tElement, tRace } from "../lib/i18n";
import { useModalNav } from "../lib/modalNav";

export function MapDetailView({ mapId }: { mapId: string }) {
  const [detail, setDetail] = useState<MapDetail | null | undefined>(undefined);
  const { openModal } = useModalNav();

  useEffect(() => {
    setDetail(undefined);
    getMapDetail(mapId).then(setDetail).catch(() => setDetail(null));
  }, [mapId]);

  useEffect(() => {
    if (detail) document.title = `${detail.name} — AureumRO DB`;
    return () => {
      document.title = "AureumRO — Database de Itens";
    };
  }, [detail]);

  if (detail === undefined) {
    return (
      <div className="center-note">
        <span className="spinner" /> Carregando mapa…
      </div>
    );
  }

  if (detail === null) {
    return <div className="center-note">Mapa {mapId} não encontrado.</div>;
  }

  return (
    <>
      <h1>
        {detail.name}
        <span className="id-tag" style={{ marginLeft: 10 }}>{detail.id}</span>
      </h1>

      <div className="detail-media" style={{ marginTop: 12 }}>
        <img
          src={mapImageUrl(detail.id)}
          alt={detail.name}
          loading="lazy"
          style={{ maxWidth: "100%", imageRendering: "auto" }}
        />
        <p className="dim small" style={{ marginTop: 6 }}>imagem: divine-pride.net</p>
      </div>

      <section className="drops">
        <h2>Monstros deste mapa</h2>
        {detail.mobs.length === 0 ? (
          <p className="dim small">Nenhum spawn conhecido neste mapa.</p>
        ) : (
          <table className="drop-table">
            <thead>
              <tr>
                <th>Monstro</th>
                <th className="num">Nv.</th>
                <th className="num">Quantidade</th>
              </tr>
            </thead>
            <tbody>
              {detail.mobs.map((m) => (
                <tr key={m.mobId}>
                  <td>
                    <button
                      className="link-btn"
                      onClick={() => openModal(`/mob/${m.mobId}`)}
                    >
                      {m.name}
                      {m.mvp === 1 && <span className="badge mvp">MVP</span>}
                    </button>
                    <div className="mob-meta">
                      {tRace(m.race)} · {tElement(m.el)}
                    </div>
                  </td>
                  <td className="num">{m.level}</td>
                  <td className="num">{m.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
