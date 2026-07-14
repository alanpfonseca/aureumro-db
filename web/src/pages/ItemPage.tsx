import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ItemDetail } from "../types";
import { loadItem, collectionUrl } from "../lib/data";
import { colorize } from "../lib/rotext";
import { ItemIcon } from "../components/ItemIcon";
import { DropTable } from "../components/DropTable";
import { tSubType, tJob } from "../lib/i18n";

const DIV_LABELS: Record<string, string> = {
  attack: "Ataque",
  defense: "Defesa",
  weight: "Peso",
  slots: "Slots",
  weaponLevel: "Nível da arma",
  requiredLevel: "Nível necessário",
};

// Traduz as chaves cruas do rAthena para algo legível.
const LOCATION_PT: Record<string, string> = {
  Head_Top: "Topo", Head_Mid: "Meio", Head_Low: "Baixo",
  Armor: "Armadura", Right_Hand: "Mão direita", Left_Hand: "Mão esquerda",
  Both_Hand: "Duas mãos", Garment: "Capa", Shoes: "Calçado",
  Right_Accessory: "Acessório (dir.)", Left_Accessory: "Acessório (esq.)",
  Both_Accessory: "Acessório", Ammo: "Munição",
};

function loc(l: string) {
  return LOCATION_PT[l] ?? l.replace(/_/g, " ");
}

export function ItemPage() {
  const { id } = useParams();
  const itemId = Number(id);
  const [item, setItem] = useState<ItemDetail | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [collFailed, setCollFailed] = useState(false);

  useEffect(() => {
    setItem(undefined);
    setCollFailed(false);
    window.scrollTo(0, 0);
    loadItem(itemId).then(setItem).catch(() => setItem(null));
  }, [itemId]);

  useEffect(() => {
    if (item) document.title = `${item.name} — AureumRO DB`;
    return () => {
      document.title = "AureumRO — Database de Itens";
    };
  }, [item]);

  if (item === undefined) {
    return (
      <div className="app">
        <Link className="back-link" to="/">← Voltar</Link>
        <div className="center-note"><span className="spinner" /> Carregando item…</div>
      </div>
    );
  }

  if (item === null) {
    return (
      <div className="app">
        <Link className="back-link" to="/">← Voltar</Link>
        <div className="center-note">Item #{itemId} não encontrado.</div>
      </div>
    );
  }

  const off = item.official;
  const f = item.facets;
  const divs = item.divergences;
  const nameStyle = item.nameColor ? { color: item.nameColor } : undefined;
  const showCollection = item.iconSource !== "none" && !collFailed;

  // A tabela principal usa os valores PRE-RENEWAL quando existem: o servidor é pré-re,
  // então é esse número que vale em jogo. Cai na descrição do cliente quando não há
  // contraparte oficial (itens custom e itens só-de-renewal).
  const rows: Array<[string, React.ReactNode]> = [];
  const add = (label: string, v: React.ReactNode) => {
    if (v !== undefined && v !== null && v !== "") rows.push([label, v]);
  };

  add("Tipo", off ? tSubType(off.subType ?? off.type) : f.itemClass);
  add("Ataque", off?.attack ?? f.attack);
  add("Ataque mágico", off?.magicAttack ?? f.magicAttack);
  add("Defesa", off?.defense ?? f.defense);
  add("Nível da arma", off?.weaponLevel ?? f.weaponLevel);
  add("Nível necessário", off?.requiredLevel ?? f.requiredLevel);
  add("Peso", off?.weight ?? f.weight);
  add("Slots", off?.slots ?? item.slotCount);
  add("Equipa em", off?.locations?.map(loc).join(", ") ?? f.equipSlot);
  add("Propriedade", f.element);
  add("Refinável", off ? (off.refineable ? "Sim" : "Não") : f.refineable === false ? "Não" : undefined);
  add("Compõe em", f.compoundOn);
  add("Preço de compra", off?.buy ? `${off.buy.toLocaleString("pt-BR")} z` : undefined);
  add("Nome interno", off?.aegisName);

  return (
    <div className="app">
      <Link className="back-link" to="/">← Voltar para a busca</Link>

      <div className="detail">
        <div className="detail-media">
          {showCollection ? (
            <img
              className="detail-collection"
              src={collectionUrl(item.id)}
              alt={item.name}
              onError={() => setCollFailed(true)}
            />
          ) : (
            <ItemIcon id={item.id} hasIcon={item.iconSource !== "none"} name={item.name} size={96} />
          )}
        </div>

        <div>
          <h1 style={nameStyle}>
            {item.name}
            {item.slotCount > 0 ? ` [${item.slotCount}]` : ""}
          </h1>
          <div className="row-sub" style={{ marginBottom: 10 }}>
            <span className="id-tag">ID #{item.id}</span>
            <button
              className="copy-id"
              onClick={() => {
                navigator.clipboard?.writeText(String(item.id));
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? "copiado!" : "copiar ID"}
            </button>
            {item.isCustom && <span className="badge custom">Custom AureumRO</span>}
            {item.untranslated && <span className="badge kr">Nome original (KR)</span>}
            {!off && !item.isCustom && <span className="badge warn">Fora do pré-renewal</span>}
          </div>

          {/* O ponto mais importante da página: o cliente é renewal, o servidor é pré-re.
              Onde os dois discordam, a descrição no jogo está enganando o jogador. */}
          {divs && Object.keys(divs).length > 0 && (
            <div className="divergence">
              <strong>⚠ A descrição no jogo não bate com o pré-renewal.</strong>
              <p>
                O AureumRO usa um cliente <em>renewal</em>, então a descrição mostra números de
                renewal. Sendo o servidor pré-re, o valor que provavelmente vale em jogo é o da
                coluna <b>pré-RE</b>.
              </p>
              <table className="div-table">
                <thead>
                  <tr><th></th><th>Descrição no jogo</th><th>Pré-RE (referência)</th></tr>
                </thead>
                <tbody>
                  {Object.entries(divs).map(([k, v]) => (
                    <tr key={k}>
                      <td>{DIV_LABELS[k] ?? k}</td>
                      <td className="div-client">{v.cliente}</td>
                      <td className="div-official">{v.oficial}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <table className="facet-table">
            <tbody>
              {rows.map(([label, v]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {off?.jobs?.length ? (
            <div className="jobs">
              <h4>Profissões</h4>
              <div className="chip-row">
                {off.jobs.map((j) => (
                  <span key={j} className="chip static">{tJob(j)}</span>
                ))}
              </div>
            </div>
          ) : f.jobs ? (
            <div className="jobs">
              <h4>Profissões</h4>
              <p className="dim">{f.jobs}</p>
            </div>
          ) : null}

          {item.descriptionLines.length > 0 && (
            <>
              <h4 className="desc-head">Descrição no jogo</h4>
              <div className="detail-desc">
                {item.descriptionLines.map((line, i) => (
                  <div key={i}>{colorize(line)}</div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <DropTable drops={item.droppedBy} total={item.dropSourcesTotal} />

      {item.droppedBy.length === 0 && (
        <p className="dim small" style={{ marginTop: 20 }}>
          Nenhum monstro conhecido dropa este item no pré-renewal
          {item.isCustom ? " (item custom do AureumRO — provavelmente vem de NPC, evento ou loja)" : ""}.
        </p>
      )}

      <footer className="footer">
        <p>
          Descrição e nome vêm do cliente do AureumRO. Stats, drops e mapas vêm da base
          <strong> pré-renewal do rAthena</strong> — é uma <em>referência</em> pré-re padrão, não um
          dump do servidor: o AureumRO pode ter ajustado taxas e drops.
        </p>
      </footer>
    </div>
  );
}
