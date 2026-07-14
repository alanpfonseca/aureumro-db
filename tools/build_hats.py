"""Aplica os efeitos dos chapeus e gera os dados das quests de chapeu.

Fontes (transcritas dos PDFs em resource/):
  resource/hats.json        -- efeito de cada chapeu (substitui a descricao) + notas de bug
  resource/hat_quests.json  -- as 45 quests com custo e ingredientes

Patches/saidas (sobre os artefatos ja construidos em web/public/data/):
  search-index.json   -- st recalculado dos chapeus patchados, flag hq nos ingredientes,
                         registros dos itens criados (IDs sinteticos 90001+)
  shards/<n>.json     -- descriptionLines substituidas; shard novo p/ itens criados
  meta.json           -- contagens total/custom ajustadas
  hat-quests.json     -- quests com IDs resolvidos, consumido pela pagina #/hat-quests
  build/hats_report.md-- notas internas dos PDFs, matches ambiguos e nomes nao resolvidos

IMPORTANTE: build_data.py regenera web/public/data/ do zero e DESFAZ este patch.
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

ROOT = Path(__file__).parent.parent
RES = ROOT / "resource"
DATA = ROOT / "web" / "public" / "data"
REPORT = ROOT / "build" / "hats_report.md"

SHARD_SIZE = 5000

# Chapeus cujo nome do PDF nao casa com nameEn/nome PT da database (typos, renomes do
# servidor). Verificados manualmente contra os shards.
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

FOOTER = "^777777Efeito atualizado — AureumRO^000000"


def norm(text):
    """Nome -> chave de comparacao: sem acento, minusculo, espacos colapsados."""
    return re.sub(r"\s+", " ", deaccent(text).strip())


def st_of(lines):
    """Mesma regra do build_data.py: descriptionText sem cor, minusculo."""
    return "\n".join(strip_colors(l) for l in lines).lower()


def effect_lines(effect):
    return [seg.strip() for seg in effect.split(" / ") if seg.strip()] + [FOOTER]


def main():
    hats_src = json.loads((RES / "hats.json").read_text(encoding="utf-8"))["hats"]
    quests_src = json.loads((RES / "hat_quests.json").read_text(encoding="utf-8"))

    index = json.loads((DATA / "search-index.json").read_text(encoding="utf-8"))
    meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))

    shard_dir = DATA / "shards"
    shards = {}
    for f in shard_dir.glob("*.json"):
        shards[int(f.stem)] = json.loads(f.read_text(encoding="utf-8"))

    # Re-execucao: remove os itens sinteticos de rodadas anteriores; serao recriados.
    synth_ids = set(NEW_ITEM_IDS.values())
    index = [r for r in index if r["id"] not in synth_ids]
    for data in shards.values():
        for iid in synth_ids:
            data.pop(str(iid), None)

    idx_by_id = {r["id"]: r for r in index}

    # --- Lookups de nome ---------------------------------------------------------
    by_en, by_pt, by_sn = defaultdict(list), defaultdict(list), defaultdict(list)
    for data in shards.values():
        for det in data.values():
            by_pt[norm(det["name"])].append(det)
            name_en = (det.get("official") or {}).get("nameEn")
            if name_en:
                by_en[norm(name_en)].append(det)
    for rec in index:
        by_sn[norm(rec["sn"])].append(rec)

    report = {"notes": [], "created": [], "confirm": [], "unresolved": [], "stats": {}}

    # --- Matching dos chapeus ------------------------------------------------------
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
            hg = [d for d in cands if idx_by_id.get(d["id"], {}).get("t") == "Headgear"]
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
        iid, how = match_hat(hat)
        if iid is None:
            report["unresolved"].append(f'Chapéu "{pdf_name}"[{slot}] sem correspondência na database')
            continue
        hat_ids[(pdf_name, slot)] = iid
        if pdf_name in ALIASES and pdf_name == "Blazing Sun":
            det = None
            for data in shards.values():
                det = data.get(str(iid)) or det
            report["confirm"].append(
                f'"Blazing Sun" mapeado por alias para {iid} "{det["name"] if det else "?"}" — confirmar')

        if hat.get("effect"):
            lines = effect_lines(hat["effect"])
            sid = iid // SHARD_SIZE
            det = shards[sid][str(iid)]
            det["descriptionLines"] = lines
            rec = idx_by_id[iid]
            rec["st"] = st_of(lines)
            patched += 1

    # --- Criacao dos itens sinteticos ---------------------------------------------
    for hat in hats_src:
        pdf_name = hat["pdfName"]
        if pdf_name not in NEW_ITEM_IDS:
            continue
        iid = NEW_ITEM_IDS[pdf_name]
        slot = hat.get("slot") or 0
        name = hat.get("ptName") or pdf_name
        lines = effect_lines(hat["effect"]) if hat.get("effect") else []
        sid = iid // SHARD_SIZE
        shards.setdefault(sid, {})[str(iid)] = {
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
        rec = {
            "id": iid, "n": name, "sn": deaccent(name), "st": st_of(lines),
            "t": "Headgear", "sl": slot, "c": 1, "u": 0, "ic": 0, "dr": 0, "pre": 0,
        }
        index.append(rec)
        idx_by_id[iid] = rec
        by_sn[norm(rec["sn"])].append(rec)
        hat_ids[(pdf_name, hat.get("slot"))] = iid
        report["created"].append(f'{iid} "{name}" (PDF: {pdf_name}[{hat.get("slot")}])')

    # --- Resolucao de ingredientes -------------------------------------------------
    equip_types = {"Arma", "Headgear", "Armadura", "Escudo", "Calçado",
                   "Capa", "Acessório", "Traje", "Sombrio"}

    def resolve_ingredient(ing, quest_name):
        if "itemId" in ing:
            if ing["itemId"] in idx_by_id:
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
                    (len(PREFERRED_TYPES) + (1 if r["t"] in equip_types else 0))
                return (pref, r["id"])
            cands.sort(key=rank)
            report["confirm"].append(
                f'{quest_name}: "{ing["amount"]}x {ing["name"]}" ambíguo '
                f'({", ".join(str(r["id"]) for r in cands)}) — escolhido {cands[0]["id"]} '
                f'"{cands[0]["n"]}" ({cands[0]["t"]})')
        return cands[0]["id"]

    out_quests = []
    ingredient_ids = set()
    for q in quests_src["quests"]:
        hat_id = hat_ids.get((q["hatPdfName"], q["hatSlot"]))
        if hat_id is None:
            report["unresolved"].append(
                f'Quest "{q["name"]}": chapéu "{q["hatPdfName"]}"[{q["hatSlot"]}] não resolvido')
        hat_rec = idx_by_id.get(hat_id)
        out_ings = []
        for ing in q["ingredients"]:
            iid = resolve_ingredient(ing, f'Quest "{q["name"]}"')
            rec = idx_by_id.get(iid)
            out_ings.append({
                "amount": ing["amount"],
                "itemId": iid,
                "name": rec["n"].strip() if rec else ing["name"],
                "icon": rec["ic"] if rec else 0,
            })
            if iid is not None:
                ingredient_ids.add(iid)
        out_quests.append({
            "id": q["id"],
            "name": q["name"],
            "hatId": hat_id,
            "hatName": hat_rec["n"].strip() if hat_rec else q["hatPdfName"],
            "hatSlots": hat_rec["sl"] if hat_rec else (q["hatSlot"] or 0),
            "hatIcon": hat_rec["ic"] if hat_rec else 0,
            "ingredients": out_ings,
        })

    # --- Flag hq (ingrediente de quest de chapeu) no indice -------------------------
    for rec in index:
        rec.pop("hq", None)
    for iid in ingredient_ids:
        idx_by_id[iid]["hq"] = 1

    # --- Escrita ---------------------------------------------------------------------
    index.sort(key=lambda r: r["id"])
    (DATA / "search-index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for sid, data in shards.items():
        (shard_dir / f"{sid}.json").write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    meta["total"] = len(index)
    meta["custom"] = sum(1 for r in index if r["c"] == 1)
    (DATA / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    (DATA / "hat-quests.json").write_text(
        json.dumps({"zenyCost": quests_src["zenyCost"], "quests": out_quests},
                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # --- Relatorio ---------------------------------------------------------------------
    report["stats"] = {
        "chapeus no PDF": len(hats_src),
        "descrições substituídas": patched,
        "itens criados": len(report["created"]),
        "quests": len(out_quests),
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
    print(f"quests geradas          : {len(out_quests)}")
    print(f"ingredientes resolvidos : {len(ingredient_ids)} distintos")
    print(f"a confirmar             : {len(report['confirm'])} (ver {REPORT})")
    print(f"não resolvidos          : {len(report['unresolved'])}")
    for n in report["unresolved"]:
        print(f"  ! {n}")


if __name__ == "__main__":
    main()
