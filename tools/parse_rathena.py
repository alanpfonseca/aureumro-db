"""Cruza a base pre-re do rAthena com o dataset do cliente e produz:

  build/rathena.json
    official   : stats pre-re oficiais por ID de item (ATK, DEF, peso, slots, jobs, ...)
    droppedBy  : ID de item -> [ {mob, nome, nivel, taxa%, mvp} ]  (indice REVERSO)
    mobs       : ID de mob -> { nome, nivel, hp, raca, elemento, tamanho, mvp, spawns[] }
    divergences: itens cuja DESCRICAO NO CLIENTE (renewal) diverge do valor pre-re
                 -- ver find_divergences(), isso NAO quer dizer "customizado pelo AureumRO"

Duas notas de formato que sao facil de errar:
  - Em mob_db.yml os drops referenciam o item por AegisName ("Jellopy", "Poring_Card"),
    NAO por ID. A ponte e o item_db (que tem AegisName e Id).
  - `Rate` e em 1/10000: Rate 7000 = 70%, Rate 1 = 0,01%.
  - `Weight` no item_db e em 1/10: Weight 500 = 50 de peso (o que o cliente mostra).
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import yaml
try:
    from yaml import CSafeLoader as Loader  # ~5x mais rapido nos 800 KB de YAML
except ImportError:
    from yaml import SafeLoader as Loader

from lupa import LuaRuntime

ROOT = Path(__file__).parent.parent
RA = ROOT / "build" / "rathena"
CLIENT_ITEMS = ROOT / "build" / "items.raw.json"
MAPINFO = Path(r"d:\Programas Lixosos\AureumRO 2\SystemEN\mapInfo.lub")
OUT = ROOT / "build" / "rathena.json"

ITEM_DBS = ["item_db_equip.yml", "item_db_usable.yml", "item_db_etc.yml"]

# Linha de spawn:  <map>,<x>,<y>[,<xs>,<ys>]\tmonster\t<Nome>\t<mobId>,<qtd>[,delay,delay]
# Ignoramos boss_monster/monster com evento; queremos o spawn permanente comum.
SPAWN_RE = re.compile(
    r"^(?P<map>[\w@]+),\d+,\d+(?:,\d+,\d+)?\t(?P<kind>monster|boss_monster)\t"
    r"(?P<name>[^\t]+)\t(?P<mob>\d+),(?P<amount>\d+)",
    re.MULTILINE,
)


def load_map_names():
    """displayName PT-BR de cada mapa, do proprio cliente (mapInfo.lub e texto puro).

    A tabela global chama-se `mapTbl` e e chaveada por "<mapa>.rsw". O arquivo termina
    fazendo dofile de um "mapinfo_C.lub" (mapas custom do servidor) -- rodamos do diretorio
    do cliente para que esse dofile resolva, e seguimos em frente se ele nao existir.
    """
    client_dir = MAPINFO.parent.parent  # ...\AureumRO 2
    lua = LuaRuntime(encoding=None, unpack_returned_tuples=True)
    src = MAPINFO.read_bytes()
    cwd = Path.cwd()
    try:
        import os
        os.chdir(client_dir)
        lua.execute(src)
    except Exception as e:
        print(f"  aviso ao executar mapInfo.lub: {e}")
    finally:
        import os
        os.chdir(cwd)

    tbl = lua.globals()[b"mapTbl"]
    names = {}
    if tbl is None:
        return names
    for key, val in tbl.items():
        k = key.decode("cp1252", "replace") if isinstance(key, bytes) else str(key)
        mapid = k[:-4] if k.endswith(".rsw") else k
        dn = val[b"displayName"]
        if dn:
            names[mapid] = dn.decode("cp1252", "replace")
    return names


def load_item_db():
    """id -> stats oficiais pre-re; e AegisName -> id (a ponte para os drops)."""
    official, aegis_to_id = {}, {}
    for fname in ITEM_DBS:
        doc = yaml.load((RA / "db" / "pre-re" / fname).read_text(encoding="utf-8"), Loader=Loader)
        for e in doc.get("Body", []):
            iid = e["Id"]
            aegis_to_id[e["AegisName"]] = iid
            rec = {
                "aegisName": e["AegisName"],
                "nameEn": e.get("Name"),
                "type": e.get("Type"),
                "subType": e.get("SubType"),
                "buy": e.get("Buy"),
                "sell": e.get("Sell"),
                # Weight vem em 1/10 -- 500 significa peso 50, que e o que o cliente exibe.
                "weight": (e["Weight"] / 10) if e.get("Weight") else None,
                "attack": e.get("Attack"),
                "magicAttack": e.get("MagicAttack"),
                "defense": e.get("Defense"),
                "range": e.get("Range"),
                "slots": e.get("Slots", 0),
                "weaponLevel": e.get("WeaponLevel"),
                "requiredLevel": e.get("EquipLevelMin"),
                "refineable": e.get("Refineable", False),
                "jobs": sorted(k for k, v in (e.get("Jobs") or {}).items() if v),
                "locations": sorted(k for k, v in (e.get("Locations") or {}).items() if v),
            }
            official[iid] = {k: v for k, v in rec.items() if v not in (None, [], {})}
    return official, aegis_to_id


def load_mobs(aegis_to_id):
    doc = yaml.load((RA / "db" / "pre-re" / "mob_db.yml").read_text(encoding="utf-8"), Loader=Loader)
    mobs = {}
    dropped_by = defaultdict(list)

    for e in doc.get("Body", []):
        mid = e["Id"]
        modes = e.get("Modes") or {}
        is_mvp = bool(modes.get("Mvp"))
        mobs[mid] = {
            "id": mid,
            "name": e.get("Name"),
            "level": e.get("Level"),
            "hp": e.get("Hp"),
            "race": e.get("Race"),
            "element": e.get("Element"),
            "elementLevel": e.get("ElementLevel"),
            "size": e.get("Size"),
            "baseExp": e.get("BaseExp"),
            "jobExp": e.get("JobExp"),
            "mvp": is_mvp,
            "spawns": [],
        }

        for key, mvp_flag in (("Drops", False), ("MvpDrops", True)):
            for d in e.get(key) or []:
                iid = aegis_to_id.get(d["Item"])
                if iid is None:
                    continue  # item que nao existe no item_db pre-re
                dropped_by[iid].append({
                    "mob": mid,
                    "name": e.get("Name"),
                    "level": e.get("Level"),
                    "rate": d.get("Rate", 0) / 100.0,  # 1/10000 -> porcentagem
                    "mvp": mvp_flag,
                    "mvpMob": is_mvp,
                })
    return mobs, dropped_by


def load_spawns(mobs, map_names):
    total = 0
    for path in (RA / "npc" / "pre-re" / "mobs").rglob("*.txt"):
        text = path.read_text(encoding="utf-8", errors="replace")
        for m in SPAWN_RE.finditer(text):
            mid = int(m.group("mob"))
            mob = mobs.get(mid)
            if not mob:
                continue
            mapid = m.group("map")
            mob["spawns"].append({
                "map": mapid,
                "mapName": map_names.get(mapid, mapid),
                "amount": int(m.group("amount")),
            })
            total += 1

    # Um mesmo mapa aparece varias vezes (blocos de spawn diferentes) -- soma as quantidades.
    for mob in mobs.values():
        agg = defaultdict(int)
        names = {}
        for s in mob["spawns"]:
            agg[s["map"]] += s["amount"]
            names[s["map"]] = s["mapName"]
        mob["spawns"] = sorted(
            ({"map": k, "mapName": names[k], "amount": v} for k, v in agg.items()),
            key=lambda s: -s["amount"],
        )
    return total


def find_divergences(client_items, official):
    """Onde a DESCRICAO DO CLIENTE discorda da referencia pre-renewal.

    Cuidado com a leitura disso -- e facil concluir errado. O AureumRO roda um cliente
    RENEWAL (kRO) num servidor que quer ser PRE-RENEWAL. Entao a descricao que o jogador
    le no jogo carrega valores de renewal, enquanto o servidor (sendo pre-re) usa os
    valores pre-re. A analise dos 392 casos mostra exatamente isso:

        attack : Espada Solar 70 (cliente) x 85 (pre-re), Mysteltain 160 x 170
        weight : 316 casos, quase todos diferenca renewal/pre-re do jogo base
        slots  : 1 caso

    Ou seja, a esmagadora maioria NAO e "o AureumRO customizou o item" -- e o descompasso
    renewal-vs-pre-re do proprio jogo. Rotular como customizacao seria falso. O que isto
    de fato significa, e o que a UI deve dizer, e: "nao confie nesse numero da descricao,
    porque num servidor pre-re vale o valor pre-re".

    So compara campos que os DOIS lados tem -- faceta ausente no cliente e silencio, nao
    divergencia. Itens custom sao pulados: nao tem contraparte oficial, comparar seria ruido.
    """
    divs = {}
    for it in client_items:
        iid = it["id"]
        off = official.get(iid)
        if not off or it["isCustom"]:
            continue  # item custom nao tem contraparte oficial; comparar seria ruido
        diff = {}
        pairs = [
            ("slotCount", "slots"),
            ("attack", "attack"),
            ("defense", "defense"),
            ("weight", "weight"),
            ("weaponLevel", "weaponLevel"),
            ("requiredLevel", "requiredLevel"),
        ]
        for cli_key, off_key in pairs:
            cv, ov = it.get(cli_key), off.get(off_key)
            if cv is None or ov is None:
                continue
            if float(cv) != float(ov):
                diff[off_key] = {"cliente": cv, "oficial": ov}
        if diff:
            divs[iid] = diff
    return divs


def main():
    print("Nomes de mapa (do cliente)...")
    map_names = load_map_names()
    print(f"  {len(map_names)} mapas")

    print("item_db pre-re...")
    official, aegis_to_id = load_item_db()
    print(f"  {len(official)} itens oficiais, {len(aegis_to_id)} AegisNames")

    print("mob_db pre-re...")
    mobs, dropped_by = load_mobs(aegis_to_id)
    print(f"  {len(mobs)} monstros")
    print(f"  itens com pelo menos um drop: {len(dropped_by)}")
    print(f"  MVPs: {sum(1 for m in mobs.values() if m['mvp'])}")

    print("spawns pre-re...")
    n = load_spawns(mobs, map_names)
    with_spawn = sum(1 for m in mobs.values() if m["spawns"])
    print(f"  {n} linhas de spawn; {with_spawn} monstros com mapa conhecido")

    print("cruzando com o cliente...")
    client_items = json.loads(CLIENT_ITEMS.read_text(encoding="utf-8"))
    divs = find_divergences(client_items, official)
    print(f"  itens no cliente : {len(client_items)}")
    matched = sum(1 for it in client_items if it["id"] in official)
    print(f"  com contraparte pre-re oficial: {matched}")
    print(f"  descricao do cliente diverge do pre-re: {len(divs)}")

    # Ordena os drops por taxa desc, para a UI mostrar o mais provavel primeiro.
    for iid in dropped_by:
        dropped_by[iid].sort(key=lambda d: -d["rate"])

    OUT.write_text(json.dumps({
        "official": official,
        "droppedBy": dropped_by,
        "mobs": mobs,
        "divergences": divs,
    }, ensure_ascii=False), encoding="utf-8")
    print(f"\nEscrito: {OUT}  ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    sys.exit(main())
