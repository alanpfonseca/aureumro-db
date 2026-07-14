# AureumRO — Database de Itens

Database web (estilo divine-pride) com os itens do servidor privado **AureumRO**, feita por
data mining dos arquivos do cliente, cruzada com a base **pré-renewal do rAthena**. Busca por
nome/descrição (sem acento), filtros, **"onde dropa"** (monstro + chance + mapas) e stats
pré-re por item.

## As duas fontes, e por que duas

| Fonte | Dá o quê |
|---|---|
| **Cliente do AureumRO** (`SystemEN/itemInfo`) | Nome, descrição, slots, ícone, itens **custom** |
| **rAthena pré-renewal** (open source) | Stats oficiais, **drops + taxas**, **spawns** (mapas) |

O servidor **não** faz parte do cliente, então drops e stats reais não existem nos arquivos
locais. Como o AureumRO é pré-re e roda rAthena, a base pré-re pública do rAthena é a
referência certa — melhor que a API do divine-pride, que exige chave e serve dados de renewal.

> ⚠️ A base do rAthena é uma **referência pré-re padrão, não um dump do AureumRO**. Eles podem
> ter ajustado taxas e drops. Use como estimativa — o site diz isso ao jogador.

### A descoberta que virou feature

O AureumRO roda um cliente **renewal** num servidor **pré-re**. Resultado: a descrição que o
jogador lê no jogo mostra números de *renewal* que **não valem** em jogo. Cruzando as duas
fontes, 392 itens divergem — ex.: a **Espada Solar** diz "Força de Ataque: 70" na descrição,
mas em pré-re o ATK é **85**. O site marca esses itens com um aviso e mostra os dois valores.

(Cuidado ao ler isso: divergência **não** é sinônimo de "o AureumRO customizou o item" — é,
quase sempre, o descompasso renewal-vs-pré-re do próprio jogo base.)

## Como funciona

```
cliente AureumRO                          web/ (React + Vite + TS)
  SystemEN/itemInfo*.lua  ──┐
  SystemEN/mapInfo.lub      │   tools/ (Python)          public/data/
  color_items.txt           ├─► parse_iteminfo.py  ──►    search-index.json  (busca + filtros)
                            │   parse_facets.py           shards/<n>.json    (detalhe, sob demanda)
rAthena pré-re (GitHub)  ───┼─► fetch_rathena.py          meta.json
  db/pre-re/item_db_*.yml   │   parse_rathena.py
  db/pre-re/mob_db.yml      │   build_data.py
  npc/pre-re/mobs/*.txt     │
divine-pride CDN  ──────────┴─► fetch_icons.py     ──►    public/icons/<id>.png
```

### Pipeline (`tools/`, Python 3)

Roda uma vez; regenera os dados que o site consome. Requer `pip install lupa pillow`.

1. **`parse_iteminfo.py`** — carrega os itens **executando os arquivos Lua do cliente** (via
   `lupa`), não parseando texto. É necessário porque `itemInfo_C.lua` não é uma tabela estática:
   é um programa que aplica patches imperativos sobre a tabela base (correção de slots vinda do
   servidor, reescrita de descrições de cartas, clonagem de itens da Caixa Mini-Boss). Replica a
   ordem de carga do próprio cliente e o merge `F_itemInfoMerge` (custom sobrescreve base).
   Decodifica cada string com o codec certo **por conteúdo** — o texto é `cp1252` (português),
   mas ~1.161 itens nunca traduzidos têm nome em `cp949` (coreano).
   → `build/items.raw.json`
2. **`parse_facets.py`** — extrai facetas do texto semiestruturado da descrição (tipo, ATK, DEF,
   peso, nível, elemento, profissões, slots), tolerando os rótulos em PT e EN e a bagunça de
   espaçamento. Toda faceta é opcional. Classifica o item em ~16 tipos.
3. **`fetch_icons.py`** — baixa os ícones do CDN público do divine-pride (ver "Ícones" abaixo).
   → `build/icon_manifest.json` + `web/public/icons/`
4. **`fetch_rathena.py`** — baixa a base pré-re do rAthena (item_db, mob_db, scripts de spawn).
   → `build/rathena/`
5. **`parse_rathena.py`** — monta o **índice reverso** `item → monstros que dropam → mapas onde
   nascem`, os stats oficiais pré-re, e detecta as divergências. Os nomes de mapa em PT-BR saem
   do próprio cliente (`SystemEN/mapInfo.lub`, que é texto puro).
   Duas pegadinhas de formato tratadas aqui: em `mob_db.yml` os drops referenciam o item por
   `AegisName` (não por ID), e `Rate` é em 1/10000 (7000 = 70%).
   → `build/rathena.json`
6. **`build_data.py`** — junta tudo: índice de busca enxuto, shards por bucket de ID, `meta.json`.
   → `web/public/data/`
7. **`build_hats.py`** — aplica os efeitos custom dos chapéus do servidor
   (`resource/hats.json`) sobre as descrições, cria os chapéus que não existem na database
   (IDs sintéticos 90001+) e gera `web/public/data/hat-quests.json` com as quests de chapéu
   (`resource/hat_quests.json`) de nomes já resolvidos para IDs. Standalone: só precisa dos
   JSONs do repo. Emite `build/hats_report.md` com as notas internas dos PDFs e os matches
   ambíguos. → patch em `web/public/data/`

Ordem: `parse_iteminfo` → `fetch_icons` → `fetch_rathena` → `parse_rathena` → `build_data`
→ `build_hats`. (`fetch_icons` e `fetch_rathena` são resumíveis e usam cache em `build/`.)

**Atenção:** `build_data.py` regenera `web/public/data/` do zero e desfaz o patch dos chapéus —
sempre re-rode `build_hats.py` depois dele.

### Site (`web/`)

```bash
cd web
npm install
npm run dev        # desenvolvimento
npm run build      # gera dist/ estático (publicável em GitHub Pages / Netlify / Vercel)
```

- Índice enxuto (~9 MB, ~2 MB gzip) carregado uma vez; busca com **MiniSearch** construída em
  memória (~0,9 s). Filtros aplicados em JS.
- Lista **virtualizada** (`@tanstack/react-virtual`) — 20 k itens sem travar.
- Detalhe carrega só o shard do item, sob demanda.
- Rotas por hash (`#/item/501`) — funciona em qualquer host estático, sem rewrite.

## Ícones

**Os GRFs do cliente estão criptografados e não são extraíveis:**

- `data.grf` — header `Event Horizon` (Gepard), tabela de arquivos criptografada.
- `aureumRO.grf` — o índice é legível, mas o **payload** de todas as 136 k entradas está
  criptografado (nem um `.txt` de livro descomprime). O `backupGrf/` tem o mesmo problema.

Por isso **100% dos ícones vêm do CDN do divine-pride**, por ID. Itens custom que compartilham
`resourceName` com um item oficial herdam o ícone desse oficial. Cobertura: **93,3%** (19.384 de
20.772). Os ~1.388 sem ícone são custom cujas texturas só existem nos GRFs trancados.

Cuidado embutido: um ID inexistente no CDN retorna `200` com um PNG placeholder (não 404) — o
fetcher descarta qualquer download cujo hash bata com o do placeholder.

A imagem grande (`collection`) da página de detalhe vem por hot-link do CDN em runtime, com
fallback para o ícone local.

## Números (última geração)

| | |
|---|---|
| Itens | 20.772 |
| Custom AureumRO | 1.078 |
| Sem tradução (nome coreano) | 1.161 |
| Com ícone | 19.384 (93,3%) |
| Com contraparte pré-renewal | 6.040 |
| Com fonte de drop conhecida | 1.808 |
| Monstros (53 MVPs) | 1.004 |
| Descrição divergente do pré-re | 392 |
