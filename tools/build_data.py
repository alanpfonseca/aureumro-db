"""Transforma items.raw.json no banco SQLite que o site consome.

Saida: web/public/data/aureumro.db.png (+ db-info.json), consultado DIRETO no navegador
via sql.js-httpvfs (HTTP Range requests — so as paginas necessarias sao baixadas).
Tabelas (schema em db_common.py):
  items         -- registro enxuto por item (listagem + filtros)
  item_details  -- JSON pesado por item (descricao com cor, facetas, stats oficiais,
                   drops com mapas) -- 1 probe de PK por pagina de detalhe
  items_fts     -- FTS5 sobre nome (sn) + texto da descricao (st) p/ busca
  meta          -- chave/valor (contagens, listas de facetas)

O manifesto de icones (build/icon_manifest.json) diz quais itens tem icone e a
proveniencia. Se ele ainda nao existe (fetch_icons nao rodou), assume "sem icone"
e segue -- o build nao depende dos downloads terem terminado.

ATENCAO: este script regenera o banco do zero -- rode tools/build_hats.py depois,
ele aplica as descricoes custom dos chapeus e grava as quests de chapeu.
O banco pode ser aberto/editado no DB Browser for SQLite; depois de editar na mao,
regrave o db-info.json (ou rode build_hats.py, que ja faz isso).
"""

import json
import shutil
import sys
from collections import Counter
from pathlib import Path

from db_common import (
    DB_PATH, CLASS_ALL, CLASS_BITS, JOB_BITS, job_mask, open_db, rebuild_fts, finish,
)

sys.path.insert(0, str(Path(__file__).parent))
from parse_facets import deaccent

ROOT = Path(__file__).parent.parent
ITEMS = ROOT / "build" / "items.raw.json"

EQUIP_TYPES = {"Arma", "Armadura", "Escudo", "Traje", "Headgear",
               "Capa", "Calçado", "Acessório", "Sombrio"}

# Ordem dos subtipos de arma no front (web/src/lib/i18n.ts).
_WEAPON_SUBTYPE_ORDER = [
    "Fist", "Dagger", "1hSword", "2hSword", "1hSpear", "2hSpear",
    "1hAxe", "2hAxe", "Mace", "2hMace", "1hStaff", "2hStaff", "Staff",
    "Bow", "Knuckle", "Musical", "Whip", "Book", "Katar", "Revolver",
    "Rifle", "Gatling", "Shotgun", "Grenade", "Huuma", "Shuriken", "Kunai",
    "Arrow", "Bullet",
]

ICON_MANIFEST = ROOT / "build" / "icon_manifest.json"
RATHENA = ROOT / "build" / "rathena.json"
OUT = ROOT / "web" / "public" / "data"

MAX_DROPS_PER_ITEM = 40   # itens de lixo (Jellopy) sao dropados por dezenas de mobs
MAX_MAPS_PER_MOB = 8

# Saidas do formato antigo (JSON) -- removidas se ainda existirem.
LEGACY_OUTPUTS = ["search-index.json", "meta.json", "hat-quests.json", "shards"]


def main():
    items = json.loads(ITEMS.read_text(encoding="utf-8"))
    icons = {}
    if ICON_MANIFEST.exists():
        icons = {int(k): v for k, v in json.loads(ICON_MANIFEST.read_text(encoding="utf-8")).items()}
    else:
        print("AVISO: icon_manifest.json ausente -- gerando sem info de icone.")

    # Dados pre-re do rAthena (stats oficiais, drops, spawns, mapas). Opcional.
    official, dropped_by, mobs, divergences, map_names = {}, {}, {}, {}, {}
    if RATHENA.exists():
        ra = json.loads(RATHENA.read_text(encoding="utf-8"))
        official = {int(k): v for k, v in ra["official"].items()}
        dropped_by = {int(k): v for k, v in ra["droppedBy"].items()}
        mobs = {int(k): v for k, v in ra["mobs"].items()}
        divergences = {int(k): v for k, v in ra["divergences"].items()}
        map_names = ra.get("mapNames", {})
    else:
        print("AVISO: rathena.json ausente -- sem drops/stats pre-re.")

    OUT.mkdir(parents=True, exist_ok=True)
    conn = open_db(fresh=True)

    item_rows, detail_rows, st_by_id = [], [], {}

    for it in items:
        iid = it["id"]
        icon = icons.get(iid, "none")
        off = official.get(iid)
        drops = dropped_by.get(iid, [])

        # Prefere os stats OFICIAIS pre-re nos filtros (sao os que valem num servidor
        # pre-re); cai no valor lido da descricao do cliente so quando o pre-re nao tem.
        def stat(off_key, cli_key):
            v = (off or {}).get(off_key)
            return it.get(cli_key) if v is None else v

        # Subfiltros de arma/classe: wt/jbm/cls so preenchidos quando ha official pre-re.
        wt = None
        jbm = None
        cls = None
        if off:
            if off.get("type") == "Weapon":
                wt = off.get("subType") or "Fist"
            jbm = job_mask(off.get("jobs", []))
            classes = off.get("classes")
            if classes:
                cls = sum(CLASS_BITS.get(c, 0) for c in classes)
            else:
                cls = CLASS_ALL

        item_rows.append((
            iid,
            it["name"],
            it["searchName"],                   # nome sem acento, minusculo
            it["type"],
            it["slotCount"],
            1 if it["isCustom"] else 0,
            1 if it.get("untranslated") else 0,
            1 if icon != "none" else 0,
            1 if drops else 0,                  # tem fonte de drop conhecida
            1 if off else 0,                    # existe no pre-renewal oficial
            stat("requiredLevel", "requiredLevel"),
            stat("weaponLevel", "weaponLevel"),
            stat("attack", "attack"),
            stat("defense", "defense"),
            stat("magicAttack", "magicAttack"),
            it.get("element"),
            it.get("jobs"),
            it.get("nameColor"),
            wt,
            jbm,
            cls,
        ))
        st_by_id[iid] = it["descriptionText"].lower()  # texto p/ busca (ja sem cor)

        # "Onde dropa": cada fonte de drop ja vem com os mapas onde aquele mob nasce.
        # Cortamos as listas: Jellopy tem 16 fontes, e mob de campo aparece em dezenas
        # de mapas -- despejar tudo incharia o payload sem ajudar ninguem.
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

        detail = {
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
            "divergences": divergences.get(iid),
            "droppedBy": drop_list,
            "dropSourcesTotal": len(drops),
        }
        detail_rows.append((iid, json.dumps(detail, ensure_ascii=False, separators=(",", ":"))))

    conn.executemany(
        "INSERT INTO items (id,n,sn,t,sl,c,u,ic,dr,pre,rl,wl,atk,def,matk,el,jb,col,wt,jbm,cls)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", item_rows)
    conn.executemany("INSERT INTO item_details (id,json) VALUES (?,?)", detail_rows)
    rebuild_fts(conn, st_by_id)

    # --- Tabelas de monstros ---------------------------------------------------------
    # Construir lookups de nome/icon dos itens do cliente para resolver drops.
    client_by_id = {it["id"]: it for it in items}
    for mid, m in mobs.items():
        sn = deaccent(m["name"]).lower() if m.get("name") else ""
        spawns = m.get("spawns", [])
        conn.execute(
            "INSERT INTO mobs (id,n,sn,lv,hp,sp,atk1,atk2,def,mdef,"
            "s_str,s_agi,s_vit,s_int,s_dex,s_luk,rng,spd,race,el,elv,sz,"
            "bexp,jexp,mexp,mvp,spn) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                mid, m.get("name"), sn, m.get("level", 1), m.get("hp", 1), m.get("sp", 1),
                m.get("attack", 0), m.get("attack2", 0), m.get("defense", 0), m.get("magicDefense", 0),
                m.get("str", 1), m.get("agi", 1), m.get("vit", 1), m.get("int", 1),
                m.get("dex", 1), m.get("luk", 1), m.get("attackRange", 0), m.get("walkSpeed", 0),
                m.get("race"), m.get("element"), m.get("elementLevel", 1), m.get("size"),
                m.get("baseExp", 0), m.get("jobExp", 0), m.get("mvpExp", 0),
                1 if m.get("mvp") else 0, 1 if spawns else 0,
            ),
        )
        # Drops ordenados por rate desc (mesma regra do dropped_by).
        drops = sorted(m.get("drops", []), key=lambda d: -d["rate"])
        for ord_, d in enumerate(drops):
            iid = d.get("item")
            cit = client_by_id.get(iid)
            # Sem correspondencia no cliente: usa nome EN do rAthena e icon 0.
            # Como o aegis_to_id e irreversivel, guardamos o AegisName no proprio drop.
            # O rathena nao exporta AegisName do drop, entao fallback simples.
            name = cit["name"] if cit else ""
            icon = 1 if cit and icons.get(iid, "none") != "none" else 0
            conn.execute(
                "INSERT INTO mob_drops (mob_id,ord,item_id,name,icon,rate,mvp) VALUES (?,?,?,?,?,?,?)",
                (mid, ord_, iid if cit else None, name, icon, d["rate"], 1 if d.get("mvp") else 0),
            )
        # Spawns agregados por mapa.
        for s in spawns:
            conn.execute(
                "INSERT INTO mob_spawns (mob_id,map,amount) VALUES (?,?,?)",
                (mid, s["map"], s["amount"]),
            )

    # --- Tabela de mapas -----------------------------------------------------------
    all_maps = {mapid: mapname for mapid, mapname in map_names.items()}
    for m in mobs.values():
        for s in m.get("spawns", []):
            mapid = s["map"]
            if mapid not in all_maps:
                all_maps[mapid] = mapid
    for mapid, mapname in sorted(all_maps.items()):
        conn.execute(
            "INSERT INTO maps (id,name) VALUES (?,?)",
            (mapid, mapname),
        )

    # Subtipos de arma na ordem do dict SUBTYPE do front (i18n.ts).
    weapon_subtypes = []
    seen_wt = set()
    present_wt = {row[18] for row in item_rows if row[18]}
    for st in _WEAPON_SUBTYPE_ORDER:
        if st in present_wt and st not in seen_wt:
            weapon_subtypes.append(st)
            seen_wt.add(st)
    for st in sorted(present_wt - seen_wt):
        weapon_subtypes.append(st)

    meta = {
        "total": len(items),
        "custom": sum(1 for it in items if it["isCustom"]),
        "untranslated": sum(1 for it in items if it.get("untranslated")),
        "withIcon": sum(1 for v in icons.values() if v != "none"),
        "withDrops": sum(1 for it in items if dropped_by.get(it["id"])),
        "preRenewal": sum(1 for it in items if it["id"] in official),
        "divergent": len(divergences),
        "mobs": len(mobs),
        "types": [t for t, _ in Counter(it["type"] for it in items).most_common()],
        "elements": sorted({it["element"] for it in items if it.get("element")}),
        "maxSlots": max((it["slotCount"] for it in items), default=0),
        "jobBits": JOB_BITS,
        "weaponSubTypes": weapon_subtypes,
        "equipTypes": ["Arma", "Armadura", "Escudo", "Traje", "Headgear",
                       "Capa", "Calçado", "Acessório", "Sombrio"],
        "mobRaces": sorted({m.get("race") for m in mobs.values() if m.get("race")}),
        "mobElements": sorted({m.get("element") for m in mobs.values() if m.get("element")}),
        "mobSizes": sorted({m.get("size") for m in mobs.values() if m.get("size")}),
        "mobMaxLevel": max((m.get("level", 1) for m in mobs.values()), default=1),
        "mobsWithSpawn": sum(1 for m in mobs.values() if m.get("spawns")),
        "generatedFrom": "SystemEN/itemInfo (cliente AureumRO) + rAthena pre-renewal",
        "dbVersion": 1,
    }
    conn.executemany(
        "INSERT INTO meta (key, value) VALUES (?, ?)",
        [(k, json.dumps(v, ensure_ascii=False)) for k, v in meta.items()])

    finish(conn)

    # Limpa as saidas do formato JSON antigo.
    for name in LEGACY_OUTPUTS:
        p = OUT / name
        if p.is_dir():
            shutil.rmtree(p)
        elif p.exists():
            p.unlink()

    db_mb = DB_PATH.stat().st_size / 1e6
    print(f"aureumro.db.png : {len(item_rows)} itens, {db_mb:.1f} MB (page_size 4096)")
    print(f"meta        : {meta['total']} itens, {meta['withIcon']} com icone, "
          f"{len(meta['types'])} tipos")
    print(f"pre-renewal : {meta['preRenewal']} itens oficiais, "
          f"{meta['withDrops']} com drop conhecido, {meta['divergent']} divergentes")
    print("Lembrete: rode tools/build_hats.py agora (chapeus + quests).")


if __name__ == "__main__":
    main()
