import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ItemDetail } from "../types";
import { collectionUrl } from "../lib/data";
import { getItemDetail, getQuestsUsingItem, getQuestsRewarding, type QuestChip } from "../lib/queries";
import { colorize, readableColor, stripColors } from "../lib/rotext";
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

// A linha "Usado na fabricação de:" vem do cliente do jogo (rótulo em ^EE8800) e, quando
// existe, ela e suas continuações (o cliente quebra em ~40 colunas) são sempre o fim da
// descrição — verificado nos 197 ingredientes da base.
const FAB_LABEL = "Usado na fabricação de:";
const FAB_RE = /^usado na fabrica[çc][ãa]o de:\s*/i;

// Acima disso, não listamos quest por quest: mantemos o texto do cliente como um link só
// para a página de quests (caso Aureum Coin, ingrediente de todas as 45).
const MANY_QUESTS = 10;

const questLabelStyle = { color: readableColor("EE8800") };

function questLinks(quests: QuestChip[]) {
  return quests.map((q, i) => (
    <Fragment key={q.id}>
      {i > 0 && ", "}
      <Link to={`/hat-quests?quest=${q.id}`}>{q.name}</Link>
    </Fragment>
  ));
}

export function ItemPage() {
  const { id } = useParams();
  const itemId = Number(id);
  const [item, setItem] = useState<ItemDetail | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [collFailed, setCollFailed] = useState(false);
  const [usedInQuests, setUsedInQuests] = useState<QuestChip[]>([]);
  const [rewardOfQuests, setRewardOfQuests] = useState<QuestChip[]>([]);

  useEffect(() => {
    setItem(undefined);
    setCollFailed(false);
    window.scrollTo(0, 0);
    getItemDetail(itemId).then(setItem).catch(() => setItem(null));
  }, [itemId]);

  // Nao bloqueia a pagina: se as queries de quest falharem, as secoes so nao aparecem.
  useEffect(() => {
    let alive = true;
    setUsedInQuests([]);
    setRewardOfQuests([]);
    getQuestsUsingItem(itemId).then((q) => alive && setUsedInQuests(q)).catch(() => {});
    getQuestsRewarding(itemId).then((q) => alive && setRewardOfQuests(q)).catch(() => {});
    return () => {
      alive = false;
    };
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
  const nameStyle = item.nameColor ? { color: readableColor(item.nameColor) } : undefined;
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

  // Substitui a linha de fabricação do cliente por uma versão com links (dados do banco).
  // Se as quests ainda não carregaram — ou a linha ficou órfã de quest — o texto original
  // permanece intacto dentro de bodyLines.
  const fabIdx = item.descriptionLines.findIndex((l) => FAB_RE.test(stripColors(l).trim()));
  const cutTail = fabIdx >= 0 && usedInQuests.length > 0;
  const bodyLines = cutTail ? item.descriptionLines.slice(0, fabIdx) : item.descriptionLines;
  const fabTailText =
    fabIdx >= 0
      ? item.descriptionLines.slice(fabIdx).map((l) => stripColors(l).trim()).join(" ").replace(FAB_RE, "")
      : "";

  const fabLine =
    usedInQuests.length >= MANY_QUESTS ? (
      <>
        <span style={questLabelStyle}>{FAB_LABEL}</span>{" "}
        <Link to="/hat-quests">{fabTailText || "quests de chapéu"}</Link>
      </>
    ) : usedInQuests.length > 0 ? (
      <>
        <span style={questLabelStyle}>{FAB_LABEL}</span> {questLinks(usedInQuests)}
      </>
    ) : null;

  const rewardLine =
    rewardOfQuests.length > 0 ? (
      <>
        <span style={questLabelStyle}>Obtido na quest de:</span> {questLinks(rewardOfQuests)}
      </>
    ) : null;

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
            <ItemIcon id={item.id} hasIcon={item.iconSource !== "none"} name={item.name} size={96} cdnFallback />
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

          {(bodyLines.length > 0 || fabLine || rewardLine) && (
            <>
              <h4 className="desc-head">Descrição no jogo</h4>
              <div className="detail-desc">
                {bodyLines.map((line, i) => (
                  <div key={i}>{colorize(line)}</div>
                ))}
                {fabLine && <div>{fabLine}</div>}
                {rewardLine && <div>{rewardLine}</div>}
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
