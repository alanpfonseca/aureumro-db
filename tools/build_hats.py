"""Aplica os efeitos dos chapeus e grava as quests de chapeu no aureumro.db.

Fontes (transcritas dos PDFs em resource/):
  resource/hats.json        -- efeito de cada chapeu (substitui a descricao) + notas de bug
  resource/hat_quests.json  -- as 45 quests com custo e ingredientes

Patches (sobre web/public/data/aureumro.db, gerado pelo build_data.py):
  item_details  -- descriptionLines substituidas pelos efeitos
  items         -- flag hq nos ingredientes; itens sinteticos criados (IDs 90001+)
  hat_quests / hat_quest_ingredients -- quests com nomes resolvidos para IDs
  items_fts     -- reconstruido (a busca precisa ver as descricoes novas)
  meta          -- total/custom/zenyCost/dbVersion
  build/hats_report.md -- notas internas dos PDFs, matches ambiguos e nao resolvidos

IMPORTANTE: build_data.py regenera o banco do zero e DESFAZ este patch.
Ordem do pipeline: ... -> build_data.py -> build_hats.py (re-rode este sempre).
Standalone: nao precisa do cliente do jogo nem de lupa. Re-rodar e seguro (idempotente).
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from parse_facets import strip_colors, deaccent
from db_common import open_db, rebuild_fts, finish

ROOT = Path(__file__).parent.parent
RES = ROOT / "resource"
REPORT = ROOT / "build" / "hats_report.md"

# Chapeus cujo nome do PDF nao casa com nameEn/nome PT da database (typos, renomes do
# servidor). Verificados manualmente.
ALIASES = {
    "Blazing Sun": 5776,        # "Sol Radiante" -- confirmar (relatorio)
    "Blue Arara Hat": 5778,
    "Chapeu capitao": 5359,
    "Evil Wings Ears": 5068,
    "Evil Wings": 2255,
    "Geographer hat": 5455,
    "Maestic Goat": 5160,       # typo de Majestic Goat [1]
    "Remover Hat": 5777,
    "Sloth Hat": 5761,
    "Snake Head": 5388,
    "WhikebainEars": 5360,
}

# Chapeus que nao existem na database -> criados com ID sintetico fixo (faixa 90001+
# verificada livre; fixar aqui evita que os IDs mudem entre execucoes).
NEW_ITEM_IDS = {
    "Eye of dark": 90001,
    "Nipper Crab Hairpin": 90002,
}

# Ingredientes cujo nome no PDF nao casa com a database (plural/typo/traducao).
INGREDIENT_ALIASES = {
    "garra de toupeira": 1018,          # DB: "Garras de Toupeira"
    "festival mask": 7187,              # DB: "Mascara do Festival"
    "grande asas de borboleta": 7168,
    "grandes asas de borboleta": 7168,
    "pelugem incandecente": 7122,
    "jubilleu": 7312,
}

# Tipos preferidos ao desempatar ingredientes com nome duplicado (material vence
# equipamento homonimo).
PREFERRED_TYPES = ["Material", "Diversos", "Consumível"]
EQUIP_TYPES = {"Arma", "Headgear", "Armadura", "Escudo", "Calçado",
               "Capa", "Acessório", "Traje", "Sombrio"}

FOOTER = "^777777Efeito atualizado — AureumRO^000000"


def norm(text):
    """Nome -> chave de comparacao: sem acento, minusculo, espacos colapsados."""
    return re.sub(r"\s+", " ", deaccent(text).strip())


def st_of(lines):
    """Mesma regra do texto de busca do build_data: sem cor, minusculo."""
    return "\n".join(strip_colors(l) for l in lines).lower()


def effect_lines(effect):
    return [seg.strip() for seg in effect.split(" / ") if seg.strip()] + [FOOTER]


def main():
    hats_src = json.loads((RES / "hats.json").read_text(encoding="utf-8"))["hats"]
    quests_src = json.loads((RES / "hat_quests.json").read_text(encoding="utf-8"))

    conn = open_db()

    # Re-execucao: remove os itens sinteticos de rodadas anteriores; serao recriados.
    synth_ids = tuple(NEW_ITEM_IDS.values())
    ph = ",".join("?" * len(synth_ids))
    conn.execute(f"DELETE FROM items WHERE id IN ({ph})", synth_ids)
    conn.execute(f"DELETE FROM item_details WHERE id IN ({ph})", synth_ids)

    # --- Lookups em memoria ---------------------------------------------------------
    items = {}    # id -> dict(n, sn, t, sl, ic)
    for iid, n, sn, t, sl, ic in conn.execute("SELECT id,n,sn,t,sl,ic FROM items"):
        items[iid] = {"id": iid, "n": n, "sn": sn, "t": t, "sl": sl, "ic": ic}

    details = {}  # id -> ItemDetail dict (parseado; regrava so os patchados)
    for iid, js in conn.execute("SELECT id, json FROM item_details"):
        details[iid] = json.loads(js)

    by_en, by_pt, by_sn = defaultdict(list), defaultdict(list), defaultdict(list)
    for det in details.values():
        by_pt[norm(det["name"])].append(det)
        name_en = (det.get("official") or {}).get("nameEn")
        if name_en:
            by_en[norm(name_en)].append(det)
    for rec in items.values():
        by_sn[norm(rec["sn"])].append(rec)

    report = {"notes": [], "created": [], "confirm": [], "unresolved": [], "stats": {}}

    # --- Matching dos chapeus ---------------------------------------------------------
    def match_hat(hat):
        """Retorna (item_id, como_casou) ou (None, None)."""
        pdf_name, slot = hat["pdfName"], hat.get("slot")
        if pdf_name in ALIASES:
            return ALIASES[pdf_name], "alias"
        key = norm(pdf_name)
        for src, cands in (("nameEn", by_en.get(key, [])), ("nome PT", by_pt.get(key, []))):
            if not cands:
                continue
            # So chapeus: evita colidir com arma/carta homonimas.
            hg = [d for d in cands if items.get(d["id"], {}).get("t") == "Headgear"]
            cands = hg or cands
            if slot is not None:
                by_slot = [d for d in cands if d["slotCount"] == slot]
                cands = by_slot or cands
            if len(cands) > 1:
                # Prefere o item base, sem marcador de variante no nome PT.
                base = [d for d in cands
                        if not re.search(r"\[A\]|\[Visual\]|2\.0", d["name"], re.I)]
                cands = base or cands
                cands.sort(key=lambda d: d["id"])
                report["confirm"].append(
                    f'"{pdf_name}"[{slot}] ambíguo ({", ".join(str(d["id"]) for d in cands)}) '
                    f'— escolhido {cands[0]["id"]} "{cands[0]["name"]}" ({src})')
            return cands[0]["id"], src
        return None, None

    hat_ids = {}       # (pdfName, slot) -> item id
    patched = 0
    for hat in hats_src:
        pdf_name, slot = hat["pdfName"], hat.get("slot")
        if hat.get("notes"):
            report["notes"].append(f'**{pdf_name}[{slot}]**: ' + " / ".join(hat["notes"]))

        if pdf_name in NEW_ITEM_IDS:
            continue  # criados depois, com efeito
        iid, _how = match_hat(hat)
        if iid is None:
            report["unresolved"].append(f'Chapéu "{pdf_name}"[{slot}] sem correspondência na database')
            continue
        hat_ids[(pdf_name, slot)] = iid
        if pdf_name == "Blazing Sun":
            report["confirm"].append(
                f'"Blazing Sun" mapeado por alias para {iid} "{details[iid]["name"]}" — confirmar')

        if hat.get("effect"):
            det = details[iid]
            det["descriptionLines"] = effect_lines(hat["effect"])
            conn.execute(
                "UPDATE item_details SET json=? WHERE id=?",
                (json.dumps(det, ensure_ascii=False, separators=(",", ":")), iid))
            patched += 1

    # --- Criacao dos itens sinteticos --------------------------------------------------
    for hat in hats_src:
        pdf_name = hat["pdfName"]
        if pdf_name not in NEW_ITEM_IDS:
            continue
        iid = NEW_ITEM_IDS[pdf_name]
        slot = hat.get("slot") or 0
        name = hat.get("ptName") or pdf_name
        lines = effect_lines(hat["effect"]) if hat.get("effect") else []
        detail = {
            "id": iid,
            "name": name,
            "unidentifiedName": None,
            "descriptionLines": lines,
            "resourceName": "",
            "slotCount": slot,
            "classNum": 0,
            "costume": False,
            "isCustom": True,
            "untranslated": False,
            "iconSource": "none",
            "nameColor": None,
            "facets": {"itemClass": "Equipamento para Cabeça", "equipSlot": "Topo"},
            "official": None,
            "divergences": None,
            "droppedBy": [],
            "dropSourcesTotal": 0,
        }
        conn.execute(
            "INSERT INTO items (id,n,sn,t,sl,c,u,ic,dr,pre) VALUES (?,?,?,?,?,1,0,0,0,0)",
            (iid, name, deaccent(name), "Headgear", slot))
        conn.execute(
            "INSERT INTO item_details (id,json) VALUES (?,?)",
            (iid, json.dumps(detail, ensure_ascii=False, separators=(",", ":"))))
        items[iid] = {"id": iid, "n": name, "sn": deaccent(name), "t": "Headgear",
                      "sl": slot, "ic": 0}
        details[iid] = detail
        by_sn[norm(deaccent(name))].append(items[iid])
        hat_ids[(pdf_name, hat.get("slot"))] = iid
        report["created"].append(f'{iid} "{name}" (PDF: {pdf_name}[{hat.get("slot")}])')

    # --- Resolucao de ingredientes ------------------------------------------------------
    def resolve_ingredient(ing, quest_name):
        if "itemId" in ing:
            if ing["itemId"] in items:
                return ing["itemId"]
            report["unresolved"].append(
                f'{quest_name}: ID explícito {ing["itemId"]} ("{ing["name"]}") não existe na database')
            return None
        key = norm(ing["name"])
        if key in INGREDIENT_ALIASES:
            return INGREDIENT_ALIASES[key]
        cands = list(by_sn.get(key, []))
        if not cands:
            report["unresolved"].append(f'{quest_name}: ingrediente "{ing["name"]}" não resolvido')
            return None
        if len(cands) > 1 and ing.get("slot") is not None:
            by_slot = [r for r in cands if r["sl"] == ing["slot"]]
            cands = by_slot or cands
        if len(cands) > 1:
            def rank(r):
                pref = PREFERRED_TYPES.index(r["t"]) if r["t"] in PREFERRED_TYPES else \
                    (len(PREFERRED_TYPES) + (1 if r["t"] in EQUIP_TYPES else 0))
                return (pref, r["id"])
            cands.sort(key=rank)
            report["confirm"].append(
                f'{quest_name}: "{ing["amount"]}x {ing["name"]}" ambíguo '
                f'({", ".join(str(r["id"]) for r in cands)}) — escolhido {cands[0]["id"]} '
                f'"{cands[0]["n"]}" ({cands[0]["t"]})')
        return cands[0]["id"]

    conn.execute("DELETE FROM hat_quest_ingredients")
    conn.execute("DELETE FROM hat_quests")

    ingredient_ids = set()
    for sort, q in enumerate(quests_src["quests"]):
        hat_id = hat_ids.get((q["hatPdfName"], q["hatSlot"]))
        if hat_id is None:
            report["unresolved"].append(
                f'Quest "{q["name"]}": chapéu "{q["hatPdfName"]}"[{q["hatSlot"]}] não resolvido')
        hat_rec = items.get(hat_id)
        conn.execute(
            "INSERT INTO hat_quests (id,name,hat_id,hat_name,hat_slots,hat_icon,sort)"
            " VALUES (?,?,?,?,?,?,?)",
            (q["id"], q["name"], hat_id,
             hat_rec["n"].strip() if hat_rec else q["hatPdfName"],
             hat_rec["sl"] if hat_rec else (q["hatSlot"] or 0),
             hat_rec["ic"] if hat_rec else 0,
             sort))
        for ord_, ing in enumerate(q["ingredients"]):
            iid = resolve_ingredient(ing, f'Quest "{q["name"]}"')
            rec = items.get(iid)
            conn.execute(
                "INSERT INTO hat_quest_ingredients (quest_id,ord,amount,item_id,name,icon)"
                " VALUES (?,?,?,?,?,?)",
                (q["id"], ord_, ing["amount"], iid,
                 rec["n"].strip() if rec else ing["name"],
                 rec["ic"] if rec else 0))
            if iid is not None:
                ingredient_ids.add(iid)

    # --- Flag hq (ingrediente de quest de chapeu) ---------------------------------------
    conn.execute("UPDATE items SET hq=0")
    ph = ",".join("?" * len(ingredient_ids))
    conn.execute(f"UPDATE items SET hq=1 WHERE id IN ({ph})", tuple(ingredient_ids))

    # --- meta + FTS + VACUUM -------------------------------------------------------------
    total = conn.execute("SELECT count(*) FROM items").fetchone()[0]
    custom = conn.execute("SELECT count(*) FROM items WHERE c=1").fetchone()[0]
    conn.execute("INSERT OR REPLACE INTO meta (key,value) VALUES ('total',?)", (json.dumps(total),))
    conn.execute("INSERT OR REPLACE INTO meta (key,value) VALUES ('custom',?)", (json.dumps(custom),))
    conn.execute("INSERT OR REPLACE INTO meta (key,value) VALUES ('zenyCost',?)",
                 (json.dumps(quests_src["zenyCost"]),))
    ver = conn.execute("SELECT value FROM meta WHERE key='dbVersion'").fetchone()
    conn.execute("INSERT OR REPLACE INTO meta (key,value) VALUES ('dbVersion',?)",
                 (json.dumps((json.loads(ver[0]) if ver else 0) + 1),))

    # A busca precisa ver as descricoes novas -> recomputa st de TODOS os itens.
    st_by_id = {iid: st_of(det["descriptionLines"]) for iid, det in details.items()}
    rebuild_fts(conn, st_by_id)
    finish(conn)

    # --- Relatorio -----------------------------------------------------------------------
    quests_n = len(quests_src["quests"])
    report["stats"] = {
        "chapeus no PDF": len(hats_src),
        "descrições substituídas": patched,
        "itens criados": len(report["created"]),
        "quests": quests_n,
        "ingredientes distintos resolvidos": len(ingredient_ids),
        "não resolvidos": len(report["unresolved"]),
    }
    lines = ["# Relatório — build_hats.py", ""]
    lines += ["## Notas internas do PDF (omitidas das descrições)", ""]
    lines += [f"- {n}" for n in report["notes"]] or ["- (nenhuma)"]
    lines += ["", "## Itens criados (sem correspondência na database)", ""]
    lines += [f"- {n}" for n in report["created"]] or ["- (nenhum)"]
    lines += ["", "## Correspondências para confirmar", ""]
    lines += [f"- {n}" for n in report["confirm"]] or ["- (nenhuma)"]
    lines += ["", "## Não resolvidos", ""]
    lines += [f"- {n}" for n in report["unresolved"]] or ["- (nenhum)"]
    lines += ["", "## Estatísticas", ""]
    lines += [f"- {k}: {v}" for k, v in report["stats"].items()]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"descrições substituídas : {patched}")
    print(f"itens criados           : {len(report['created'])}")
    print(f"quests gravadas         : {quests_n}")
    print(f"ingredientes resolvidos : {len(ingredient_ids)} distintos")
    print(f"a confirmar             : {len(report['confirm'])} (ver {REPORT})")
    print(f"não resolvidos          : {len(report['unresolved'])}")
    for n in report["unresolved"]:
        print(f"  ! {n}")


if __name__ == "__main__":
    main()
