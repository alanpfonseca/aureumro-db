// Helpers de URL de imagem. Os DADOS agora vem do aureumro.db (lib/db.ts +
// lib/queries.ts); aqui ficaram so os icones, que continuam como arquivos PNG.
const BASE = import.meta.env.BASE_URL;

// Baixamos localmente todos os icones que existem (web/public/icons/<id>.png).
// A imagem grande "collection" NAO foi baixada: e secundaria e so aparece no detalhe,
// entao vem por hot-link do CDN em runtime, com fallback pro proprio icone.
const CDN_ITEM = "https://static.divine-pride.net/images/items/item/";
const CDN_COLL = "https://static.divine-pride.net/images/items/collection/";
const CDN_MOB = "https://static.divine-pride.net/images/mobs/png/";
const CDN_MAP = "https://www.divine-pride.net/img/map/original/";

export function localIconUrl(id: number): string {
  return `${BASE}icons/${id}.png`;
}

// Para o detalhe: tenta a collection do CDN; o componente cai pro icone local se falhar.
export function collectionUrl(id: number): string {
  return `${CDN_COLL}${id}.png`;
}

export function cdnItemUrl(id: number): string {
  return `${CDN_ITEM}${id}.png`;
}

export function mobSpriteUrl(id: number): string {
  return `${CDN_MOB}${id}.png`;
}

export function mapImageUrl(map: string): string {
  return `${CDN_MAP}${map}`;
}
