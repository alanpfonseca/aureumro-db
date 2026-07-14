import type { HatQuestsFile, IndexRecord, ItemDetail, Meta } from "../types";

// import.meta.env.BASE_URL respeita o `base` do vite.config (funciona em subcaminho).
const BASE = import.meta.env.BASE_URL;

let indexPromise: Promise<IndexRecord[]> | null = null;
let metaPromise: Promise<Meta> | null = null;
const shardCache = new Map<number, Promise<Record<string, ItemDetail>>>();

export function loadIndex(): Promise<IndexRecord[]> {
  if (!indexPromise) {
    indexPromise = fetch(`${BASE}data/search-index.json`).then((r) => {
      if (!r.ok) throw new Error(`search-index: ${r.status}`);
      return r.json();
    });
  }
  return indexPromise;
}

export function loadMeta(): Promise<Meta> {
  if (!metaPromise) {
    metaPromise = fetch(`${BASE}data/meta.json`).then((r) => r.json());
  }
  return metaPromise;
}

let hatQuestsPromise: Promise<HatQuestsFile> | null = null;

export function loadHatQuests(): Promise<HatQuestsFile> {
  if (!hatQuestsPromise) {
    hatQuestsPromise = fetch(`${BASE}data/hat-quests.json`).then((r) => {
      if (!r.ok) throw new Error(`hat-quests: ${r.status}`);
      return r.json();
    });
  }
  return hatQuestsPromise;
}

let shardSize = 5000;
loadMeta().then((m) => (shardSize = m.shardSize)).catch(() => {});

export async function loadItem(id: number): Promise<ItemDetail | null> {
  const meta = await loadMeta();
  const sid = Math.floor(id / meta.shardSize);
  if (!shardCache.has(sid)) {
    shardCache.set(
      sid,
      fetch(`${BASE}data/shards/${sid}.json`).then((r) => (r.ok ? r.json() : {})),
    );
  }
  const shard = await shardCache.get(sid)!;
  return shard[String(id)] ?? null;
}

// --- Icones -------------------------------------------------------------------
// Baixamos localmente todos os icones que existem (web/public/icons/<id>.png).
// A imagem grande "collection" NAO foi baixada: e secundaria e so aparece no detalhe,
// entao vem por hot-link do CDN em runtime, com fallback pro proprio icone.
const CDN_ITEM = "https://static.divine-pride.net/images/items/item/";
const CDN_COLL = "https://static.divine-pride.net/images/items/collection/";

export function iconUrl(rec: Pick<IndexRecord, "id" | "ic">): string | null {
  return rec.ic ? `${BASE}icons/${rec.id}.png` : null;
}

// Para o detalhe: tenta a collection do CDN; o componente cai pro icone local se falhar.
export function collectionUrl(id: number): string {
  return `${CDN_COLL}${id}.png`;
}

export function cdnItemUrl(id: number): string {
  return `${CDN_ITEM}${id}.png`;
}

export { shardSize };
