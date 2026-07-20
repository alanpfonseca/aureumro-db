"""Grava as colecoes de mapa no aureumro.db.png.

Fonte (transcrita de resource/Maps-Collection-Full.pdf):
  resource/map_collections.json -- 264 colecoes com cidade, bonus e itens

Patches (sobre web/public/data/aureumro.db.png, gerado pelo build_data.py):
  map_collections / map_collection_items -- colecoes com nomes resolvidos para IDs
  meta -- dbVersion (cache-buster do db-info.json)
  build/maps_report.md -- matches ambiguos e nao resolvidos

Itens que referenciam OUTRA colecao de mapa (ex.: "Torre de Thanatos (7)") nao
existem na database de itens e ficam sem item_id de proposito (o site exibe sem
link). Eles aparecem no relatorio como nao resolvidos esperados.

IMPORTANTE: build_data.py regenera o banco do zero e DESFAZ este patch.
Ordem do pipeline: ... -> build_data.py -> build_hats.py -> build_maps.py
(re-rode este sempre que os anteriores rodarem).
Standalone: nao precisa do cliente do jogo. Re-rodar e seguro (idempotente).
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from parse_facets import deaccent
from db_common import open_db, finish

ROOT = Path(__file__).parent.parent
RES = ROOT / "resource"
REPORT = ROOT / "build" / "maps_report.md"

# Itens cujo nome no PDF nao casa com a database (plural/typo/traducao).
# Preencher conforme o relatorio de nao resolvidos.
ITEM_ALIASES = {
    "cacao": 7182,  # DB: "Cacau" (Material)
}

# Nomes de mapa que aparecem como pseudo-item dentro de outra colecao. No export
# oficial os cards dessas colecoes vieram FUNDIDOS no card anterior (a lista pula
# Torre de Thanatos (7)/(8), por exemplo) — nao sao itens da database e ficam sem
# link de proposito, espelhando o site.
MAP_REF_NAMES = {
    "labirinto de tatames",
    "labirinto ancestral",
    "torre de thanatos (7)",
    "torre de thanatos (8)",
    "fonte de hvergelmir",
}

# Mesma regra de desempate do build_hats.py: material vence equipamento homonimo.
PREFERRED_TYPES = ["Material", "Diversos", "Consumível"]
EQUIP_TYPES = {"Arma", "Headgear", "Armadura", "Escudo", "Calçado",
               "Capa", "Acessório", "Traje", "Sombrio"}

# O schema do db_common.py ganhou estas tabelas depois que o banco foi gerado;
# em bancos antigos elas precisam ser criadas aqui.
TABLES = """
CREATE TABLE IF NOT EXISTS map_collections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  bonus       TEXT NOT NULL,
  bonus_type  TEXT NOT NULL DEFAULT 'outros',
  sort        INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS map_collection_items (
  collection_id TEXT    NOT NULL REFERENCES map_collections(id),
  ord           INTEGER NOT NULL,
  amount        INTEGER NOT NULL,
  item_id       INTEGER,
  name          TEXT NOT NULL,
  icon          INTEGER NOT NULL,
  PRIMARY KEY (collection_id, ord)
);
CREATE INDEX IF NOT EXISTS idx_mci_item ON map_collection_items(item_id);
"""


def norm(text):
    """Nome -> chave de comparacao: sem acento, minusculo, espacos colapsados."""
    return re.sub(r"\s+", " ", deaccent(text).strip())


# Ordem e labels PT das categorias de bonus de mapa (conforme TASKS.md).
# A primeira regex que casar vence; mais especifica deve vir antes de generica.
BONUS_CATEGORIES = [
    # Atributos (regexes flexiveis para texto com espacos e capitalizacao irregular)
    (r"\b(str|for)\s*\+?\s*\d+\b", "for"),
    (r"\bagi\s*\+?\s*\d+\b", "agi"),
    (r"\bvit\s*\+?\s*\d+\b", "vit"),
    (r"\bint\s*\+?\s*\d+\b", "int"),
    (r"\bdex\s*\+?\s*\d+\b", "des"),
    (r"\bluk\s*\+?\s*\d+\b", "sor"),
    ("todos os atributos", "todos-atributos"),
    # Cast / conjuracao
    ("cast fixo|-50ms no tempo de conjuracao", "cast-fixo"),
    ("reducao de tempo de conjuracao|tempo de conjuracao|velocidade de conjuracao|cast variavel|cast variável", "cast-variavel"),
    ("pos[ -]?conjuracao|pos[ -]?conjuração", "pos-conjuracao"),
    ("recarga|reuso de itens|reuso", "recarga"),
    # Dano
    ("^atq\\b|^ataque\\b", "atq"),
    ("^matq\\b|^ataque magico\\b", "matq"),
    ("dano critico|dano crítico|taxa critica|taxa crítica", "dano-critico"),
    ("^dano (com|do|da|de p|dos)|bomba acida|choque de escudo|aura espinhosa|reflexao magica|reflexão mágica", "dano-skill"),
    ("dano|ignorar def|a distancia|fisico|magico|danos", "dano"),
    # Sobrevivencia / defesa
    ("resistencia|defesa a raca|defesa à raça|defesa a propriedade|defesa à propriedade|contra tamanho|ao thanatos|a jogador|a distancia|a distância", "resistencias"),
    ("defesa verdadeira|hard def|soft def|defesa|defesa magica|mdef", "def-mdef"),
    (r"hp\s*\+\d|sp\s*\+\d|hp/sp|hp e sp|sp/hp|max hp|max sp|hp maximo|sp maximo|recuperacao de hp|recuperacao de sp|recuperação de hp|recuperação de sp", "hp-sp"),
    # Precisao / mobilidade / utilidade
    ("acerto|precisao", "acerto"),
    ("evasao|evasão|esquiva|flee", "esquiva"),
    ("aspd|velocidade de ataque", "aspd"),
    (r"velocidade de movimento|vel\. movimento|movimento", "vel-movimento"),
    ("drop", "drop"),
    ("exp", "exp"),
    ("cura|heal", "cura"),
    ("peso|municao|nao consumir munic|nao consumir muni|duracao de po|duracao de buff|custo de sp|refino|aprimorar armamento|refinar", "utilidade"),
]

BONUS_LABELS = {
    "for": "FOR",
    "agi": "AGI",
    "vit": "VIT",
    "int": "INT",
    "des": "DES",
    "sor": "SOR",
    "todos-atributos": "Todos os Atributos",
    "cast-fixo": "Cast Fixo",
    "cast-variavel": "Cast Variável",
    "pos-conjuracao": "Pós-conjuração",
    "recarga": "Recarga",
    "atq": "ATQ",
    "matq": "MATQ",
    "dano-critico": "Dano Crítico",
    "dano-skill": "Dano de Skill",
    "dano": "Dano",
    "hp-sp": "HP/SP",
    "def-mdef": "DEF/MDEF",
    "resistencias": "Resistências",
    "acerto": "Acerto",
    "esquiva": "Esquiva",
    "aspd": "ASPD",
    "vel-movimento": "Vel. Movimento",
    "drop": "Drop",
    "exp": "EXP",
    "cura": "Cura",
    "utilidade": "Utilidades",
    "outros": "Outros",
}


def categorize_bonus(text):
    """Classifica o texto de bonus de uma colecao de mapa."""
    flat = deaccent(text).lower()
    for pattern, slug in BONUS_CATEGORIES:
        if re.search(pattern, flat):
            return slug
    return "outros"


def main():
    src = json.loads((RES / "map_collections.json").read_text(encoding="utf-8"))
    collections = src["collections"]

    conn = open_db()
    conn.executescript(TABLES)

    # --- Lookup em memoria (mesmo formato do build_hats.py) -------------------------
    items = {}    # id -> dict(n, sn, t, sl, ic)
    by_sn = defaultdict(list)
    for iid, n, sn, t, sl, ic in conn.execute("SELECT id,n,sn,t,sl,ic FROM items"):
        rec = {"id": iid, "n": n, "sn": sn, "t": t, "sl": sl, "ic": ic}
        items[iid] = rec
        by_sn[norm(sn)].append(rec)

    # Nomes de colecao: item que referencia outra colecao e "nao resolvido esperado".
    collection_names = {norm(c["name"]) for c in collections}

    report = {"confirm": [], "unresolved": [], "map_refs": [], "stats": {}}

    def resolve_item(ing, ctx):
        key = norm(ing["name"])
        if key in ITEM_ALIASES:
            return ITEM_ALIASES[key]
        cands = list(by_sn.get(key, []))
        if not cands:
            if key in collection_names or key in MAP_REF_NAMES:
                report["map_refs"].append(f'{ctx}: "{ing["name"]}" referencia outro mapa')
            else:
                report["unresolved"].append(f'{ctx}: item "{ing["name"]}" não resolvido')
            return None
        if len(cands) > 1:
            def rank(r):
                pref = PREFERRED_TYPES.index(r["t"]) if r["t"] in PREFERRED_TYPES else \
                    (len(PREFERRED_TYPES) + (1 if r["t"] in EQUIP_TYPES else 0))
                return (pref, r["id"])
            cands.sort(key=rank)
            report["confirm"].append(
                f'{ctx}: "{ing["amount"]}x {ing["name"]}" ambíguo '
                f'({", ".join(str(r["id"]) for r in cands)}) — escolhido {cands[0]["id"]} '
                f'"{cands[0]["n"]}" ({cands[0]["t"]})')
        return cands[0]["id"]

    # --- Regravacao idempotente ------------------------------------------------------
    conn.execute("DELETE FROM map_collection_items")
    conn.execute("DELETE FROM map_collections")

    resolved_ids = set()
    total_items = 0
    bonus_counts = {}
    uncategorized = []
    for sort, col in enumerate(collections):
        bonus_type = categorize_bonus(col["bonus"])
        bonus_counts[bonus_type] = bonus_counts.get(bonus_type, 0) + 1
        if bonus_type == "outros":
            uncategorized.append(f'"{col["name"]}" — {col["bonus"]}')
        conn.execute(
            "INSERT INTO map_collections (id,name,city,bonus,bonus_type,sort) VALUES (?,?,?,?,?,?)",
            (col["id"], col["name"], col["city"], col["bonus"], bonus_type, sort))
        for ord_, ing in enumerate(col["items"]):
            iid = resolve_item(ing, f'"{col["name"]}"')
            rec = items.get(iid)
            conn.execute(
                "INSERT INTO map_collection_items (collection_id,ord,amount,item_id,name,icon)"
                " VALUES (?,?,?,?,?,?)",
                (col["id"], ord_, ing["amount"], iid,
                 rec["n"].strip() if rec else ing["name"],
                 rec["ic"] if rec else 0))
            total_items += 1
            if iid is not None:
                resolved_ids.add(iid)

    # --- meta + VACUUM (sem FTS: descricoes de itens nao mudam) -----------------------
    ver = conn.execute("SELECT value FROM meta WHERE key='dbVersion'").fetchone()
    bonus_types_meta = [
        {"id": slug, "label": BONUS_LABELS[slug]}
        for _, slug in BONUS_CATEGORIES
        if slug in bonus_counts
    ]
    if "outros" in bonus_counts and "outros" not in {b["id"] for b in bonus_types_meta}:
        bonus_types_meta.append({"id": "outros", "label": BONUS_LABELS["outros"]})
    conn.execute("INSERT OR REPLACE INTO meta (key,value) VALUES ('bonusTypes',?)",
                 (json.dumps(bonus_types_meta, ensure_ascii=False),))
    conn.execute("INSERT OR REPLACE INTO meta (key,value) VALUES ('dbVersion',?)",
                 (json.dumps((json.loads(ver[0]) if ver else 0) + 1),))
    finish(conn)

    # --- Relatorio ---------------------------------------------------------------------
    report["stats"] = {
        "coleções": len(collections),
        "itens (linhas)": total_items,
        "itens distintos resolvidos": len(resolved_ids),
        "referências a outras coleções": len(report["map_refs"]),
        "ambíguos (a confirmar)": len(report["confirm"]),
        "não resolvidos": len(report["unresolved"]),
    }
    lines = ["# Relatório — build_maps.py", ""]
    lines += ["## Categorias de bônus", ""]
    lines += [f"- {BONUS_LABELS[slug]}: {bonus_counts.get(slug, 0)}" for slug, _ in BONUS_CATEGORIES if slug in bonus_counts]
    if "outros" in bonus_counts:
        lines += [f"- {BONUS_LABELS['outros']}: {bonus_counts['outros']}"]
    lines += ["", "## Bônus não categorizados", ""]
    lines += [f"- {n}" for n in uncategorized] or ["- (nenhum)"]
    lines += ["", "## Referências a outras coleções (sem link, esperado)", ""]
    lines += [f"- {n}" for n in report["map_refs"]] or ["- (nenhuma)"]
    lines += ["", "## Correspondências para confirmar", ""]
    lines += [f"- {n}" for n in report["confirm"]] or ["- (nenhuma)"]
    lines += ["", "## Não resolvidos", ""]
    lines += [f"- {n}" for n in report["unresolved"]] or ["- (nenhum)"]
    lines += ["", "## Estatísticas", ""]
    lines += [f"- {k}: {v}" for k, v in report["stats"].items()]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"coleções gravadas       : {len(collections)}")
    print(f"itens gravados          : {total_items}")
    print(f"itens resolvidos        : {len(resolved_ids)} distintos")
    print(f"referências a coleções  : {len(report['map_refs'])}")
    print(f"a confirmar             : {len(report['confirm'])} (ver {REPORT})")
    print(f"não resolvidos          : {len(report['unresolved'])}")
    for n in report["unresolved"]:
        print(f"  ! {n}")
    print(f"categorias de bônus     : {len(bonus_counts)} (outros={bonus_counts.get('outros', 0)})")


if __name__ == "__main__":
    main()
