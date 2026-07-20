import { query } from "./db";
import { deaccent } from "./deaccent";
import type { Filters } from "./filters";
import type {
  HatQuest,
  HatQuestsFile,
  ItemDetail,
  ListRow,
  MapCollection,
  MapCollectionsFile,
  Meta,
} from "../types";

// ---- Busca (FTS5) -------------------------------------------------------------------

// Mesma tokenizacao da busca antiga (MiniSearch). Cada token vira um prefixo
// ("tok"*) — tokens de 1 caractere ficam exatos, porque um prefix-scan de 1 char
// varre termos demais (= muitas paginas via HTTP). Aspas duplas neutralizam os
// operadores do FTS5 (OR, NEAR, -, parenteses) vindos do usuario.
export function ftsQuery(input: string): string | null {
  const tokens = deaccent(input)
    .split(/[\s,.:/()[\]{}+\-]+/)
    .filter(Boolean);
  if (!tokens.length) return null;
  return tokens
    .map((t) => {
      const quoted = `"${t.replace(/"/g, '""')}"`;
      return t.length >= 2 ? `${quoted}*` : quoted;
    })
    .join(" "); // espaco = AND implicito
}

// ---- WHERE dos filtros de faceta (mesma semantica do applyFilters antigo) -----------

const EQUIP_TYPES = new Set([
  "Arma", "Armadura", "Escudo", "Traje", "Headgear",
  "Capa", "Calçado", "Acessório", "Sombrio",
]);

function buildWhere(f: Filters, meta: Meta): { conds: string[]; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  const inList = (col: string, values: Iterable<string | number>) => {
    const arr = [...values];
    conds.push(`${col} IN (${arr.map(() => "?").join(",")})`);
    params.push(...arr);
  };

  // Tipos: subfiltro de arma restringe so a fatia Arma quando varios tipos estao
  // selecionados (OR escopado).
  if (f.types.size) {
    const types = [...f.types];
    const otherTypes = types.filter((t) => t !== "Arma");
    const armaSelected = types.includes("Arma");
    const hasSub = f.weaponSubTypes.size > 0;

    if (armaSelected && hasSub) {
      const parts: string[] = [];
      if (otherTypes.length) {
        parts.push(`i.t IN (${otherTypes.map(() => "?").join(",")})`);
        params.push(...otherTypes);
      }
      parts.push("(i.t = 'Arma' AND i.wt IN (" + [...f.weaponSubTypes].map(() => "?").join(",") + "))");
      params.push(...f.weaponSubTypes);
      conds.push(`(${parts.join(" OR ")})`);
    } else {
      inList("i.t", types);
    }
  }

  if (f.custom === "custom") conds.push("i.c = 1");
  if (f.custom === "vanilla") conds.push("i.c = 0");
  if (f.slots.size) inList("i.sl", f.slots);
  if (f.elements.size) inList("i.el", f.elements);
  if (f.onlyWithIcon) conds.push("i.ic = 1");
  if (f.onlyWithDrops) conds.push("i.dr = 1");
  if (f.onlyPreRenewal) conds.push("i.pre = 1");
  if (f.onlyHatQuestIngredient) conds.push("i.hq = 1");
  if (f.minReqLevel != null) {
    conds.push("COALESCE(i.rl, 0) >= ?");
    params.push(f.minReqLevel);
  }
  if (f.maxReqLevel != null) {
    conds.push("COALESCE(i.rl, 0) <= ?");
    params.push(f.maxReqLevel);
  }

  // Jobs: restringe so os equipamentos selecionados; itens fora de equipTypes passam.
  if (f.jobs.size > 0) {
    const mask = [...f.jobs].reduce((acc, j) => {
      const bit = meta.jobBits.indexOf(j);
      return bit >= 0 ? acc | (1 << bit) : acc;
    }, 0);
    const equipSelected = [...f.types].filter((t) => EQUIP_TYPES.has(t));
    const parts: string[] = [];
    if (equipSelected.length < f.types.size || f.types.size === 0) {
      // tipos nao-equipaveis selecionados (ou nenhum tipo) passam livremente
      const nonEquip = f.types.size ? [...f.types].filter((t) => !EQUIP_TYPES.has(t)) : [];
      if (nonEquip.length) {
        parts.push(`i.t IN (${nonEquip.map(() => "?").join(",")})`);
        params.push(...nonEquip);
      } else {
        parts.push("i.t NOT IN (" + equipSelected.map(() => "?").join(",") + ")");
        params.push(...equipSelected);
      }
    }
    parts.push("(i.jbm IS NOT NULL AND (i.jbm & ?) != 0)");
    params.push(mask);
    conds.push(`(${parts.join(" OR ")})`);
  }

  // Classes (trans/normal) — so afeta equips (itens nao-equipaveis selecionados passam).
  if (f.classes !== "all" && f.types.size > 0) {
    const equipSelected = [...f.types].filter((t) => EQUIP_TYPES.has(t));
    const nonEquip = [...f.types].filter((t) => !EQUIP_TYPES.has(t));
    const bit = f.classes === "trans" ? 2 : 1;
    const parts: string[] = [];
    if (nonEquip.length) {
      parts.push(`i.t IN (${nonEquip.map(() => "?").join(",")})`);
      params.push(...nonEquip);
    }
    parts.push("(i.t IN (" + equipSelected.map(() => "?").join(",") + ") AND (i.cls & ?) != 0)");
    params.push(...equipSelected, bit);
    conds.push(`(${parts.join(" OR ")})`);
  } else if (f.classes !== "all") {
    // sem tipo selecionado: aplica em todos os equips (qualquer item com cls not null)
    const bit = f.classes === "trans" ? 2 : 1;
    conds.push("(i.cls IS NOT NULL AND (i.cls & ?) != 0)");
    params.push(bit);
  }

  return { conds, params };
}

// Com texto: JOIN no FTS ordenado por bm25 (peso 3x no nome, como a busca antiga).
// Sem texto: SELECT simples na ordem escolhida; SEMPRE i.id como desempate.
function listQuery(f: Filters, select: string, meta: Meta): { sql: string; params: unknown[] } {
  const match = ftsQuery(f.text.trim());
  const { conds, params } = buildWhere(f, meta);
  const orderBy = orderClause(f.sort, !!match);
  if (match) {
    const where = ["items_fts MATCH ?", ...conds].join(" AND ");
    return {
      sql:
        `SELECT ${select} FROM items_fts JOIN items i ON i.id = items_fts.rowid ` +
        `WHERE ${where} ORDER BY ${orderBy}`,
      params: [match, ...params],
    };
  }
  const where = conds.length ? ` WHERE ${conds.join(" AND ")}` : "";
  return { sql: `SELECT ${select} FROM items i${where} ORDER BY ${orderBy}`, params };
}

function orderClause(sort: Filters["sort"], hasMatch: boolean): string {
  switch (sort) {
    case "id":
      return "i.id";
    case "name":
      return "i.sn, i.id";
    case "levelAsc":
      return "COALESCE(i.rl, 0), i.id";
    case "levelDesc":
      return "COALESCE(i.rl, 0) DESC, i.id";
    case "atkDesc":
      return "i.atk DESC, i.id";
    case "defDesc":
      return "i.def DESC, i.id";
    default:
      return hasMatch ? "bm25(items_fts, 3.0, 1.0)" : "i.id";
  }
}

const LIST_COLUMNS = "i.id, i.n, i.t, i.sl, i.c, i.u, i.ic, i.dr, i.rl, i.atk, i.def, i.col";

export async function countItems(f: Filters, meta: Meta): Promise<number> {
  const { sql, params } = listQuery(f, "count(*) AS total", meta);
  const rows = await query<{ total: number }>(sql.replace(/ ORDER BY .+$/, ""), params);
  return rows[0]?.total ?? 0;
}

export async function queryItemsWindow(
  f: Filters,
  meta: Meta,
  offset: number,
  limit: number,
): Promise<ListRow[]> {
  const { sql, params } = listQuery(f, LIST_COLUMNS, meta);
  return query<ListRow>(`${sql} LIMIT ? OFFSET ?`, [...params, limit, offset]);
}

// ---- Detalhe / meta / quests ----------------------------------------------------------

export async function getItemDetail(id: number): Promise<ItemDetail | null> {
  const rows = await query<{ json: string }>(
    "SELECT json FROM item_details WHERE id = ?",
    [id],
  );
  return rows.length ? (JSON.parse(rows[0].json) as ItemDetail) : null;
}

let metaPromise: Promise<Meta> | null = null;

export function getMeta(): Promise<Meta> {
  if (!metaPromise) {
    metaPromise = query<{ key: string; value: string }>(
      "SELECT key, value FROM meta",
    ).then((rows) => {
      const meta: Record<string, unknown> = {};
      for (const { key, value } of rows) meta[key] = JSON.parse(value);
      return meta as unknown as Meta;
    });
  }
  return metaPromise;
}

let hatQuestsPromise: Promise<HatQuestsFile> | null = null;

export function getHatQuests(): Promise<HatQuestsFile> {
  if (!hatQuestsPromise) {
    hatQuestsPromise = (async () => {
      const [meta, quests, ings] = await Promise.all([
        getMeta(),
        query<{
          id: string; name: string; hat_id: number | null; hat_name: string;
          hat_slots: number; hat_icon: 0 | 1;
        }>("SELECT id, name, hat_id, hat_name, hat_slots, hat_icon FROM hat_quests ORDER BY sort"),
        query<{
          quest_id: string; amount: number; item_id: number | null; name: string; icon: 0 | 1;
        }>("SELECT quest_id, amount, item_id, name, icon FROM hat_quest_ingredients ORDER BY quest_id, ord"),
      ]);
      const byQuest = new Map<string, HatQuest>();
      const result: HatQuest[] = [];
      for (const q of quests) {
        const quest: HatQuest = {
          id: q.id, name: q.name, hatId: q.hat_id, hatName: q.hat_name,
          hatSlots: q.hat_slots, hatIcon: q.hat_icon, ingredients: [],
        };
        byQuest.set(q.id, quest);
        result.push(quest);
      }
      for (const i of ings) {
        byQuest.get(i.quest_id)?.ingredients.push({
          amount: i.amount, itemId: i.item_id, name: i.name, icon: i.icon,
        });
      }
      return { zenyCost: meta.zenyCost ?? 0, quests: result };
    })();
  }
  return hatQuestsPromise;
}

let mapCollectionsPromise: Promise<MapCollectionsFile> | null = null;

export function getMapCollections(): Promise<MapCollectionsFile> {
  if (!mapCollectionsPromise) {
    mapCollectionsPromise = (async () => {
      const [cols, items] = await Promise.all([
        query<{ id: string; name: string; city: string; bonus: string; bonus_type: string }>(
          "SELECT id, name, city, bonus, bonus_type FROM map_collections ORDER BY sort",
        ),
        query<{
          collection_id: string; amount: number; item_id: number | null; name: string; icon: 0 | 1;
        }>("SELECT collection_id, amount, item_id, name, icon FROM map_collection_items ORDER BY collection_id, ord"),
      ]);
      const byId = new Map<string, MapCollection>();
      const result: MapCollection[] = [];
      for (const c of cols) {
        const col: MapCollection = {
          id: c.id, name: c.name, city: c.city, bonus: c.bonus, bonusType: c.bonus_type, items: [],
        };
        byId.set(c.id, col);
        result.push(col);
      }
      for (const i of items) {
        byId.get(i.collection_id)?.items.push({
          amount: i.amount, itemId: i.item_id, name: i.name, icon: i.icon,
        });
      }
      return { collections: result };
    })();
  }
  return mapCollectionsPromise;
}

export interface QuestChip {
  id: string;
  name: string;
  amount?: number;
}

// "Este item e ingrediente de quais quests?" — join direto, sem carregar tudo.
export function getQuestsUsingItem(itemId: number): Promise<QuestChip[]> {
  return query<QuestChip>(
    `SELECT q.id, q.name, i.amount FROM hat_quest_ingredients i
     JOIN hat_quests q ON q.id = i.quest_id
     WHERE i.item_id = ? ORDER BY q.sort`,
    [itemId],
  );
}

export function getQuestsRewarding(itemId: number): Promise<QuestChip[]> {
  return query<QuestChip>(
    "SELECT id, name FROM hat_quests WHERE hat_id = ? ORDER BY sort",
    [itemId],
  );
}
