// Estado dos filtros de faceta da listagem. A aplicacao virou SQL (lib/queries.ts);
// aqui fica so o tipo e os helpers de estado.
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
