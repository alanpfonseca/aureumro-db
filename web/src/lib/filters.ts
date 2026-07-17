// Estado dos filtros de faceta da listagem. A aplicacao virou SQL (lib/queries.ts);
// aqui fica so o tipo e os helpers de estado.

export type ItemSort = "auto" | "id" | "name" | "levelAsc" | "levelDesc" | "atkDesc" | "defDesc";

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
  weaponSubTypes: Set<string>;
  jobs: Set<string>;
  classes: "all" | "trans" | "nontrans";
  sort: ItemSort;
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
    weaponSubTypes: new Set(),
    jobs: new Set(),
    classes: "all",
    sort: "auto",
  };
}

const EQUIP_TYPES = new Set([
  "Arma",
  "Armadura",
  "Escudo",
  "Traje",
  "Headgear",
  "Capa",
  "Calçado",
  "Acessório",
  "Sombrio",
]);

/** Garante coerencia dos subfiltros escopados: limpa weaponSubTypes se nao houver
 *  Arma, e limpa jobs/classes se nao houver tipo equipavel. Usado antes de aplicar
 *  ou persistir filtros (sessao antiga pode nao ter os campos novos).
 */
export function normalizeFilters(f: Filters): Filters {
  const hasArma = f.types.has("Arma");
  const hasEquip = [...f.types].some((t) => EQUIP_TYPES.has(t));
  return {
    ...f,
    weaponSubTypes: hasArma ? f.weaponSubTypes : new Set<string>(),
    jobs: hasEquip ? f.jobs : new Set<string>(),
    classes: hasEquip ? f.classes : "all",
  };
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
    f.onlyHatQuestIngredient ||
    f.weaponSubTypes.size > 0 ||
    f.jobs.size > 0 ||
    f.classes !== "all"
  );
}
