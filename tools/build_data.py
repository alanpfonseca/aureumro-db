"""Transforma items.raw.json nos artefatos que o site consome.

Saidas (em web/public/data/):
  search-index.json  -- UM registro enxuto por item, com tudo que a busca e os filtros
                        precisam (nome, texto sem acento, e as facetas). Carregado uma vez
                        no boot; e a lista-mestra em memoria. Campos com nome curto pra
                        cortar bytes em 20k itens.
  items-<shard>.json -- dados pesados (linhas de descricao com cor, resourceName) de cada
                        item, agrupados por shard = id // SHARD_SIZE. Carregado sob demanda
                        pela pagina de detalhe -- nunca tudo de uma vez.
  meta.json          -- listas de valores distintos por faceta (pros dropdowns) + contagens.

O manifesto de icones (build/icon_manifest.json) diz quais itens tem icone e a proveniencia.
Se ele ainda nao existe (fetch_icons nao rodou), assume "sem icone" e segue -- o build nao
depende dos downloads terem terminado.

ATENCAO: este script regenera web/public/data/ do zero -- rode tools/build_hats.py depois,
ele aplica as descricoes custom dos chapeus e gera o hat-quests.json.
"""

import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent.parent
ITEMS = ROOT / "build" / "items.raw.json"
ICON_MANIFEST = ROOT / "build" / "icon_manifest.json"
RATHENA = ROOT / "build" / "rathena.json"
OUT = ROOT / "web" / "public" / "data"

SHARD_SIZE = 5000  # id // 5000 -> shard. O front calcula igual.

MAX_DROPS_PER_ITEM = 40   # itens de lixo (Jellopy) sao dropados por dezenas de mobs
MAX_MAPS_PER_MOB = 8


def shard_of(iid):
    return iid // SHARD_SIZE


def main():
    items = json.loads(ITEMS.read_text(encoding="utf-8"))
    icons = {}
    if ICON_MANIFEST.exists():
        icons = {int(k): v for k, v in json.loads(ICON_MANIFEST.read_text(encoding="utf-8")).items()}
    else:
        print("AVISO: icon_manifest.json ausente -- gerando sem info de icone.")

    # Dados pre-re do rAthena (stats oficiais, drops, spawns). Opcional: se o pipeline
    # do rAthena nao rodou, o site funciona igual, so sem a secao "Onde dropa".
    official, dropped_by, mobs, divergences = {}, {}, {}, {}
    if RATHENA.exists():
        ra = json.loads(RATHENA.read_text(encoding="utf-8"))
        official = {int(k): v for k, v in ra["official"].items()}
        dropped_by = {int(k): v for k, v in ra["droppedBy"].items()}
        mobs = {int(k): v for k, v in ra["mobs"].items()}
        divergences = {int(k): v for k, v in ra["divergences"].items()}
    else:
        print("AVISO: rathena.json ausente -- sem drops/stats pre-re.")

    OUT.mkdir(parents=True, exist_ok=True)

    index = []
    shards = defaultdict(dict)

    for it in items:
        iid = it["id"]
        icon = icons.get(iid, "none")
        off = official.get(iid)
        drops = dropped_by.get(iid, [])

        # Registro enxuto (chaves curtas). Presenca de faceta > None so quando existe.
        rec = {
            "id": iid,
            "n": it["name"],
            "sn": it["searchName"],           # nome sem acento, minusculo
            "st": it["descriptionText"].lower(),  # texto p/ busca (ja sem codigo de cor)
            "t": it["type"],
            "sl": it["slotCount"],
            "c": 1 if it["isCustom"] else 0,
            "u": 1 if it.get("untranslated") else 0,
            "ic": 1 if icon != "none" else 0,
            "dr": 1 if drops else 0,          # tem fonte de drop conhecida
            "pre": 1 if off else 0,           # existe no pre-renewal oficial
        }
        # Prefere os stats OFICIAIS pre-re nos filtros (sao os que valem num servidor
        # pre-re); cai no valor lido da descricao do cliente so quando o pre-re nao tem.
        for dst, off_key, cli_key in [
            ("rl", "requiredLevel", "requiredLevel"),
            ("wl", "weaponLevel", "weaponLevel"),
            ("atk", "attack", "attack"),
            ("def", "defense", "defense"),
            ("matk", "magicAttack", "magicAttack"),
        ]:
            v = (off or {}).get(off_key)
            if v is None:
                v = it.get(cli_key)
            if v is not None:
                rec[dst] = v
        for src, dst in [("element", "el"), ("jobs", "jb")]:
            if it.get(src) is not None:
                rec[dst] = it[src]
        if it.get("nameColor"):
            rec["col"] = it["nameColor"]
        index.append(rec)

        # "Onde dropa": cada fonte de drop ja vem com os mapas onde aquele mob nasce.
        # Cortamos as listas: Jellopy tem 16 fontes, e mob de campo aparece em dezenas de
        # mapas -- despejar tudo incharia o shard sem ajudar ninguem.
        drop_list = []
        for d in drops[:MAX_DROPS_PER_ITEM]:
            mob = mobs.get(d["mob"], {})
            spawns = mob.get("spawns", [])
            drop_list.append({
                "mob": d["mob"],
                "name": d["name"],
                "level": d["level"],
                "rate": round(d["rate"], 4),
                "mvp": d["mvp"],
                "mvpMob": d.get("mvpMob", False),
                "race": mob.get("race"),
                "element": mob.get("element"),
                "maps": spawns[:MAX_MAPS_PER_MOB],
                "moreMaps": max(0, len(spawns) - MAX_MAPS_PER_MOB),
            })

        # Dados pesados -> shard
        shards[shard_of(iid)][str(iid)] = {
            "id": iid,
            "name": it["name"],
            "unidentifiedName": it.get("unidentifiedName"),
            "descriptionLines": it["descriptionLines"],
            "resourceName": it["resourceName"],
            "slotCount": it["slotCount"],
            "classNum": it["classNum"],
            "costume": it["costume"],
            "isCustom": it["isCustom"],
            "untranslated": it.get("untranslated", False),
            "iconSource": icon,
            "nameColor": it.get("nameColor"),
            # Facetas lidas da DESCRICAO DO CLIENTE (o que o jogador ve no jogo).
            "facets": {k: it.get(k) for k in [
                "weight", "attack", "magicAttack", "defense", "magicDefense",
                "weaponLevel", "requiredLevel", "itemClass", "equipSlot",
                "element", "jobs", "compoundOn", "refineable", "indestructible",
            ] if it.get(k) is not None},
            # Stats OFICIAIS pre-renewal (rAthena). Ausente => item nao existe no pre-re.
            "official": off,
            # Campos em que a descricao do cliente (renewal) diverge do pre-re.
            # NAO significa "customizado pelo AureumRO" -- ver parse_rathena.find_divergences.
            "divergences": divergences.get(iid),
            "droppedBy": drop_list,
            "dropSourcesTotal": len(drops),
        }

    (OUT / "search-index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    shard_dir = OUT / "shards"
    shard_dir.mkdir(exist_ok=True)
    for sid, data in shards.items():
        (shard_dir / f"{sid}.json").write_text(
            json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    meta = {
        "total": len(items),
        "custom": sum(1 for it in items if it["isCustom"]),
        "untranslated": sum(1 for it in items if it.get("untranslated")),
        "withIcon": sum(1 for v in icons.values() if v != "none"),
        "withDrops": sum(1 for it in items if dropped_by.get(it["id"])),
        "preRenewal": sum(1 for it in items if it["id"] in official),
        "divergent": len(divergences),
        "mobs": len(mobs),
        "shardSize": SHARD_SIZE,
        "types": [t for t, _ in Counter(it["type"] for it in items).most_common()],
        "elements": sorted({it["element"] for it in items if it.get("element")}),
        "maxSlots": max((it["slotCount"] for it in items), default=0),
        "generatedFrom": "SystemEN/itemInfo (cliente AureumRO) + rAthena pre-renewal",
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    idx_mb = (OUT / "search-index.json").stat().st_size / 1e6
    print(f"search-index.json : {len(index)} itens, {idx_mb:.1f} MB")
    print(f"shards            : {len(shards)} arquivos em {shard_dir}")
    print(f"meta.json         : {meta['total']} itens, {meta['withIcon']} com icone, "
          f"{len(meta['types'])} tipos")
    print(f"pre-renewal       : {meta['preRenewal']} itens oficiais, "
          f"{meta['withDrops']} com drop conhecido, {meta['divergent']} divergentes")


if __name__ == "__main__":
    main()
