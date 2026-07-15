"""Infra compartilhada do banco SQLite servido ao site (web/public/data/aureumro.db).

O site consulta o .db DIRETO no navegador via sql.js-httpvfs (HTTP Range requests,
paginas sob demanda). Regras que NAO podem ser quebradas:
  - page_size = 4096 e igual ao requestChunkSize do front (web/src/lib/db.ts);
  - journal_mode = DELETE (httpvfs nao le WAL);
  - o wasm do httpvfs embute SQLite ~3.36: nada de STRICT tables, contentless_delete
    ou features mais novas que 3.36 no schema;
  - VACUUM ao final de todo script que escreve (compacta e reordena as paginas);
  - apos escrever, regravar db-info.json (o tamanho muda com o VACUUM e o front usa
    o version como cache-buster);
  - a extensao e .png de PROPOSITO: o CDN do GitHub Pages (Fastly) gzipa
    application/octet-stream, o que quebra os Range requests do httpvfs (os ranges
    passam a contar bytes do gzip) e some com o Content-Length real. image/png esta
    fora da lista de compressao. O arquivo continua sendo um SQLite normal — o DB
    Browser abre pelo seletor "todos os arquivos".
"""

import json
import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "web" / "public" / "data" / "aureumro.db.png"
DB_INFO_PATH = ROOT / "web" / "public" / "data" / "db-info.json"

PAGE_SIZE = 4096

SCHEMA = """
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

-- Tabela enxuta de listagem/filtros (~2,5 MB): um scan filtrado completo baixa
-- poucas centenas de paginas uma vez e fica no cache do worker.
CREATE TABLE items (
  id   INTEGER PRIMARY KEY,
  n    TEXT NOT NULL,
  sn   TEXT NOT NULL,
  t    TEXT NOT NULL,
  sl   INTEGER NOT NULL,
  c    INTEGER NOT NULL,
  u    INTEGER NOT NULL,
  ic   INTEGER NOT NULL,
  dr   INTEGER NOT NULL,
  pre  INTEGER NOT NULL,
  hq   INTEGER NOT NULL DEFAULT 0,
  rl   INTEGER, wl INTEGER, atk INTEGER, def INTEGER, matk INTEGER,
  el   TEXT, jb TEXT, col TEXT
);
-- Sem indices secundarios de proposito: os filtros combinam livremente e a tabela
-- e pequena; um indice forcaria seeks que buscam MAIS paginas via HTTP.

-- Payload pesado da pagina de detalhe: 1 probe de PK por item.
CREATE TABLE item_details (
  id   INTEGER PRIMARY KEY,
  json TEXT NOT NULL
);

CREATE TABLE hat_quests (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  hat_id    INTEGER,
  hat_name  TEXT NOT NULL,
  hat_slots INTEGER NOT NULL,
  hat_icon  INTEGER NOT NULL,
  sort      INTEGER NOT NULL
);
CREATE TABLE hat_quest_ingredients (
  quest_id TEXT    NOT NULL REFERENCES hat_quests(id),
  ord      INTEGER NOT NULL,
  amount   INTEGER NOT NULL,
  item_id  INTEGER,
  name     TEXT NOT NULL,
  icon     INTEGER NOT NULL,
  PRIMARY KEY (quest_id, ord)
);
CREATE INDEX idx_hqi_item ON hat_quest_ingredients(item_id);
CREATE INDEX idx_hq_hat   ON hat_quests(hat_id);

CREATE TABLE map_collections (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  city  TEXT NOT NULL,
  bonus TEXT NOT NULL,
  sort  INTEGER NOT NULL
);
CREATE TABLE map_collection_items (
  collection_id TEXT    NOT NULL REFERENCES map_collections(id),
  ord           INTEGER NOT NULL,
  amount        INTEGER NOT NULL,
  item_id       INTEGER,
  name          TEXT NOT NULL,
  icon          INTEGER NOT NULL,
  PRIMARY KEY (collection_id, ord)
);
CREATE INDEX idx_mci_item ON map_collection_items(item_id);
"""

# FTS5 STANDALONE (guarda sn/st): visivel/editavel no DB Browser e legivel pelo
# SQLite ~3.36 do wasm. rowid = id do item. Sincronizacao por rebuild total.
FTS_DDL = """
CREATE VIRTUAL TABLE items_fts USING fts5(
  sn, st,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);
"""


def open_db(path=DB_PATH, fresh=False):
    """Abre (ou recria, com fresh=True) o banco com os pragmas obrigatorios."""
    if fresh and path.exists():
        path.unlink()
    conn = sqlite3.connect(path)
    conn.execute(f"PRAGMA page_size = {PAGE_SIZE}")  # antes de qualquer escrita
    conn.execute("PRAGMA journal_mode = DELETE")
    if fresh:
        conn.executescript(SCHEMA)
        conn.executescript(FTS_DDL)
    return conn


def rebuild_fts(conn, st_by_id):
    """Reconstroi items_fts do zero a partir de items + textos de busca.

    st_by_id: dict id -> texto de descricao (minusculo, sem codigos de cor).
    Rebuild total e mais simples e idempotente que manter o indice em sync com
    comandos 'delete' — 20k docs levam segundos no Python.
    """
    conn.execute("DROP TABLE IF EXISTS items_fts")
    conn.executescript(FTS_DDL)
    rows = conn.execute("SELECT id, sn FROM items").fetchall()
    conn.executemany(
        "INSERT INTO items_fts(rowid, sn, st) VALUES (?, ?, ?)",
        [(iid, sn, st_by_id.get(iid, "")) for iid, sn in rows],
    )


def finish(conn):
    """ANALYZE + VACUUM (honra o page_size) e regrava db-info.json."""
    conn.commit()
    conn.execute("ANALYZE")
    conn.execute("VACUUM")
    conn.commit()
    conn.close()
    DB_INFO_PATH.write_text(
        json.dumps({"version": int(time.time()), "sizeBytes": DB_PATH.stat().st_size}),
        encoding="utf-8",
    )
