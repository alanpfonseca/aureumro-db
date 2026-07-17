# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Database web (estilo divine-pride) dos itens do servidor privado **AureumRO**: pipeline Python
(`tools/`) gera um SQLite consultado direto no navegador por um SPA React (`web/`). Detalhes de
arquitetura e das fontes de dados estão no `README.md`; o plano de trabalho ativo está em
`TASKS.md` (executar fases na ordem, com verificação por fase).

## Comandos

- **Site**: `cd web` → `npm run dev` (Vite) / `npm run build` (tsc -b + vite build). Sem testes/lint configurados — `npm run build` é a verificação mínima de TS.
- **Pipeline Python**: rodar com `py` (Python 3.14; `lupa`, `pillow`, `yaml` instalados). O cliente do jogo fica em `d:\Programas Lixosos\AureumRO 2`.

## Pipeline — ordem obrigatória

`parse_iteminfo.py` → `parse_facets.py` → `fetch_icons.py` → `fetch_rathena.py` →
`parse_rathena.py` → `build_data.py` → `build_hats.py` → `build_maps.py`

- **`build_data.py` recria o banco DO ZERO** e desfaz os patches dos chapéus e mapas — sempre re-rodar `build_hats.py` e `build_maps.py` depois dele.
- `fetch_*` são resumíveis e usam cache em `build/` (não versionado, não apagar à toa).
- Se o banco for editado à mão (DB Browser), re-rodar `build_hats.py` ou regravar `db-info.json` para atualizar a versão vista pelo front.

## Invariantes do banco (não quebrar)

- O banco é `web/public/data/aureumro.db.png` — a extensão `.png` é **deliberada** (evita gzip do CDN do GitHub Pages, que quebra os HTTP Range requests). Nunca renomear.
- `REQUEST_CHUNK_SIZE` em `web/src/lib/db.ts` deve ser **sempre igual** ao `PAGE_SIZE` em `tools/db_common.py` (hoje 4096).
- Evitar criar índices novos no SQLite — scan é barato via sql.js-httpvfs e índice piora o volume de Range requests.

## Regras do front (transversais)

- **Tema calibrado para daltônico** (referência: `resource/cores.png`): usar somente as variáveis CSS de `:root` em `web/src/index.css` — nunca hex soltos. Cores vindas de dados passam por `readableColor()` de `web/src/lib/rotext.tsx`.
- **Mobile-first** (uso principal é celular); o botão voltar do Android deve fechar popups, não navegar.
- Rotas por **hash** (`#/item/501`) — sem rewrite de servidor; manter assim (GitHub Pages).
- Voltar para a Home restaura busca/filtros/scroll via `web/src/lib/homeSession.ts` — novas telas devem preservar esse contexto.

## Pegadinhas de dados

- `itemInfo_C.lua` é um **programa**, não uma tabela: `parse_iteminfo.py` o executa via `lupa`, replicando a ordem de carga do cliente. Strings decodificadas por conteúdo: `cp1252` (PT) ou `cp949` (itens não traduzidos, ~1.161).
- rAthena `mob_db.yml`: drops referenciam item por `AegisName` (não ID); `Rate` é em 1/10000 (7000 = 70%).
- CDN do divine-pride devolve `200` com PNG placeholder para IDs inexistentes (nunca 404); imagens de mapa idem (200/302 — `onError` NÃO dispara). Comparar hash com o placeholder.
- Divergência de descrição ≠ customização do servidor — é quase sempre renewal (cliente) vs pré-re (servidor).
- Os GRFs do cliente são criptografados (Gepard) — ícones/sprites vêm 100% do CDN do divine-pride.

## Agentes

- `agents/CLAUDE.dev.md` — persona de dev sênior do projeto; carregar com `@agents/CLAUDE.dev.md` ao executar tarefas de implementação (ex.: fases do `TASKS.md`).
