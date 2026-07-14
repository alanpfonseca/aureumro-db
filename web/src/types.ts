// Registro enxuto do search-index.json (chaves curtas p/ economizar bytes em 20k itens).
export interface IndexRecord {
  id: number;
  n: string; // nome
  sn: string; // nome sem acento (busca)
  st: string; // texto da descricao em minusculo (busca)
  t: string; // tipo
  sl: number; // slots
  c: 0 | 1; // custom
  u: 0 | 1; // sem traducao (nome coreano)
  ic: 0 | 1; // tem icone
  rl?: number; // nivel necessario
  wl?: number; // nivel da arma
  atk?: number;
  def?: number;
  matk?: number;
  el?: string; // elemento
  jb?: string; // profissoes
  col?: string; // cor do nome
  dr: 0 | 1; // tem fonte de drop conhecida
  pre: 0 | 1; // existe no pre-renewal oficial
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
  shardSize: number;
  types: string[];
  elements: string[];
  maxSlots: number;
  generatedFrom: string;
}
