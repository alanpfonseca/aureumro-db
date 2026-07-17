// Linha da listagem, como sai do SELECT em queries.ts (colunas da tabela `items`
// do aureumro.db; SQL devolve null onde a coluna e opcional).
export interface ListRow {
  id: number;
  n: string; // nome
  t: string; // tipo
  sl: number; // slots
  c: 0 | 1; // custom
  u: 0 | 1; // sem traducao (nome coreano)
  ic: 0 | 1; // tem icone
  dr: 0 | 1; // tem fonte de drop conhecida
  rl: number | null; // nivel necessario
  atk: number | null;
  def: number | null;
  col: string | null; // cor do nome
}

// --- Quests de chapeu (hat-quests.json, gerado pelo tools/build_hats.py) ---------

export interface HatQuestIngredient {
  amount: number;
  itemId: number | null; // null = nome nao resolvido para um item da database
  name: string;
  icon: 0 | 1;
}

export interface HatQuest {
  id: string; // slug estavel, usado em #/hat-quests?quest=<id>
  name: string;
  hatId: number | null;
  hatName: string;
  hatSlots: number;
  hatIcon: 0 | 1;
  ingredients: HatQuestIngredient[];
}

export interface HatQuestsFile {
  zenyCost: number;
  quests: HatQuest[];
}

// --- Colecoes de mapa (map_collections.json, gerado pelo tools/build_maps.py) ----

export interface MapCollectionItem {
  amount: number;
  itemId: number | null; // null = nome nao resolvido (ex.: referencia a outro mapa)
  name: string;
  icon: 0 | 1;
}

export interface MapCollection {
  id: string; // slug estavel
  name: string;
  city: string;
  bonus: string;
  bonusType: string;
  items: MapCollectionItem[];
}

export interface MapCollectionsFile {
  collections: MapCollection[];
  bonusTypes?: { id: string; label: string }[];
}

// Stats oficiais pre-renewal (rAthena). Sao os que valem num servidor pre-re.
export interface OfficialStats {
  aegisName: string;
  nameEn?: string;
  type?: string;
  subType?: string;
  buy?: number;
  sell?: number;
  weight?: number;
  attack?: number;
  magicAttack?: number;
  defense?: number;
  range?: number;
  slots?: number;
  weaponLevel?: number;
  requiredLevel?: number;
  refineable?: boolean;
  jobs?: string[];
  locations?: string[];
}

export interface SpawnMap {
  map: string;
  mapName: string;
  amount: number;
}

export interface DropSource {
  mob: number;
  name: string;
  level: number;
  rate: number; // porcentagem (0-100)
  mvp: boolean; // veio da lista de MvpDrops
  mvpMob: boolean; // o monstro e um MVP
  race?: string;
  element?: string;
  maps: SpawnMap[];
  moreMaps: number;
}

// Campo onde a descricao do cliente (renewal) diverge do valor pre-renewal.
export type Divergences = Record<string, { cliente: number; oficial: number }>;

// Dados completos de um item (dos shards), usados na pagina de detalhe.
export interface ItemDetail {
  id: number;
  name: string;
  unidentifiedName?: string;
  descriptionLines: string[];
  resourceName: string;
  slotCount: number;
  classNum: number;
  costume: boolean;
  isCustom: boolean;
  untranslated: boolean;
  iconSource: "cdn" | "inherited" | "none";
  nameColor?: string;
  facets: {
    weight?: number;
    attack?: number;
    magicAttack?: number;
    defense?: number;
    magicDefense?: number;
    weaponLevel?: number;
    requiredLevel?: number;
    itemClass?: string;
    equipSlot?: string;
    element?: string;
    jobs?: string;
    compoundOn?: string;
    refineable?: boolean;
    indestructible?: boolean;
  };
  official?: OfficialStats | null;
  divergences?: Divergences | null;
  droppedBy: DropSource[];
  dropSourcesTotal: number;
}

export interface Meta {
  total: number;
  custom: number;
  untranslated: number;
  withIcon: number;
  withDrops: number;
  preRenewal: number;
  divergent: number;
  mobs: number;
  types: string[];
  elements: string[];
  maxSlots: number;
  generatedFrom: string;
  dbVersion?: number;
  zenyCost?: number; // custo das quests de chapeu (gravado pelo build_hats.py)
  jobBits: string[];
  weaponSubTypes: string[];
  equipTypes: string[];
  mobRaces?: string[];
  mobElements?: string[];
  mobSizes?: string[];
  mobMaxLevel?: number;
  mobsWithSpawn?: number;
  bonusTypes?: { id: string; label: string }[];
}
