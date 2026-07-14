import MiniSearch from "minisearch";
import type { IndexRecord } from "../types";
import { deaccent } from "./deaccent";

// MiniSearch cobre a busca "difusa"/por prefixo em nome + descricao. Os filtros de faceta
// sao aplicados depois, em JS puro, sobre o resultado (ou sobre a lista toda quando nao ha texto).
export function buildSearch(records: IndexRecord[]): MiniSearch<IndexRecord> {
  const ms = new MiniSearch<IndexRecord>({
    fields: ["sn", "st"], // nome sem acento + texto da descricao
    storeFields: ["id"],
    idField: "id",
    searchOptions: {
      boost: { sn: 3 }, // nome pesa mais que descricao
      prefix: true,
      fuzzy: 0.15,
      combineWith: "AND",
    },
    // O usuario digita sem acento; o indice ja esta sem acento. Normaliza a query igual.
    processTerm: (term) => deaccent(term),
    tokenize: (text) => text.split(/[\s,.:/()[\]{}+\-]+/).filter(Boolean),
  });
  ms.addAll(records);
  return ms;
}

export interface Filters {
  text: string;
  types: Set<string>;
  custom: "all" | "custom" | "vanilla";
  slots: Set<number>;
  minReqLevel: number | null;
  maxReqLevel: number | null;
  elements: Set<string>;
  onlyWithIcon: boolean;
  onlyWithDrops: boolean; // só itens que algum monstro dropa
  onlyPreRenewal: boolean; // só itens que existem no pré-renewal
  onlyHatQuestIngredient: boolean; // só ingredientes de quests de chapéu
}

export function emptyFilters(): Filters {
  return {
    text: "",
    types: new Set(),
    custom: "all",
    slots: new Set(),
    minReqLevel: null,
    maxReqLevel: null,
    elements: new Set(),
    onlyWithIcon: false,
    onlyWithDrops: false,
    onlyPreRenewal: false,
    onlyHatQuestIngredient: false,
  };
}

export function applyFilters(rec: IndexRecord, f: Filters): boolean {
  if (f.types.size && !f.types.has(rec.t)) return false;
  if (f.custom === "custom" && rec.c !== 1) return false;
  if (f.custom === "vanilla" && rec.c !== 0) return false;
  if (f.slots.size && !f.slots.has(rec.sl)) return false;
  if (f.onlyWithIcon && rec.ic !== 1) return false;
  if (f.onlyWithDrops && rec.dr !== 1) return false;
  if (f.onlyPreRenewal && rec.pre !== 1) return false;
  if (f.onlyHatQuestIngredient && rec.hq !== 1) return false;
  if (f.elements.size && (!rec.el || !f.elements.has(rec.el))) return false;
  if (f.minReqLevel != null && (rec.rl ?? 0) < f.minReqLevel) return false;
  if (f.maxReqLevel != null && (rec.rl ?? 0) > f.maxReqLevel) return false;
  return true;
}

export function hasActiveFacets(f: Filters): boolean {
  return (
    f.types.size > 0 ||
    f.custom !== "all" ||
    f.slots.size > 0 ||
    f.elements.size > 0 ||
    f.minReqLevel != null ||
    f.maxReqLevel != null ||
    f.onlyWithIcon ||
    f.onlyWithDrops ||
    f.onlyPreRenewal ||
    f.onlyHatQuestIngredient
  );
}
