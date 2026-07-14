"""Carrega os dados de item EXECUTANDO os arquivos Lua do cliente, e escreve items.raw.json.

Por que executar em vez de parsear:
  itemInfo_C.lua NAO e uma tabela estatica -- e um programa. Alem de `tbl_custom`, ele roda
  patches imperativos sobre a tabela base ja carregada:
    - ARO_slotfix   : corrige slotCount de 34 itens ("o servidor que manda", diz o comentario)
    - ARO_carddesc  : reescreve a descricao de cartas (GTB/Mistress) alteradas no servidor
    - ARO_mbg_copy  : CLONA o itemInfo de outros itens para os 24 itens da Caixa Mini-Boss
    - ARO_race99 / ARO_battlepass : injetam itens direto em tbl_custom
  Um parser estatico de `tbl_custom` perde tudo isso em silencio -- mostraria ao jogador o
  numero de slots errado, exatamente o bug que o servidor ja tinha corrigido.

Replica a sequencia de carga do cliente (SystemEN/itemInfo.lua:90-105):
    rotp_f.lua  ->  LuaFiles514/itemInfo.lua (tbl)  ->  itemInfo_C.lua (tbl_custom, patches)
    ->  F_itemInfoMerge(tbl_custom, true)  ->  F_itemInfoMerge(tbl_override, true)
"""

import json
import sys
from collections import Counter
from pathlib import Path

from lupa import LuaRuntime

sys.path.insert(0, str(Path(__file__).parent))
from parse_facets import parse_description, classify, strip_colors, deaccent

CLIENT = Path(r"d:\Programas Lixosos\AureumRO 2")
SYSTEM_EN = CLIENT / "SystemEN"
ROTP_F = SYSTEM_EN / "LuaFiles514" / "rotp_f.lua"
BASE_LUA = SYSTEM_EN / "LuaFiles514" / "itemInfo.lua"
CUSTOM_LUA = SYSTEM_EN / "itemInfo_C.lua"
COLOR_TXT = CLIENT / "color_items.txt"

OUT = Path(__file__).parent.parent / "build" / "items.raw.json"


def looks_korean(b):
    """A codificacao do texto varia POR STRING dentro do mesmo arquivo.

    O itemInfo.lua e uma traducao PT-BR incompleta: 1.161 itens (5,6%) nunca foram
    traduzidos e mantiveram o nome original em coreano (cp949), lado a lado com o texto
    portugues (cp1252). Decodificar o arquivo inteiro com um so codec transforma um dos
    dois em lixo -- foi como '롱로드 셀레브레이트카드' virou '���ε� ������Ʈī��'.

    Discriminador: portugues e ASCII com alguns acentos; coreano e quase todo byte alto
    e sem nenhuma letra ASCII.
    """
    if not b:
        return False
    if any(0x41 <= x <= 0x5A or 0x61 <= x <= 0x7A for x in b):
        return False  # tem letra ASCII => nao e coreano puro
    high = sum(1 for x in b if x >= 0x80)
    return high >= 2 and high / len(b) > 0.5


def dec_text(b):
    """Decodifica uma string de texto escolhendo o codec por conteudo (cp949 vs cp1252)."""
    if b is None:
        return ""
    if isinstance(b, str):
        return b
    if looks_korean(b):
        try:
            return b.decode("cp949")
        except UnicodeDecodeError:
            pass
    return b.decode("cp1252", errors="replace")


def dec_resource(b):
    """Nome de recurso: bytes cp949 (coreano) ou ASCII. Devolve (str_legivel, bytes_crus)."""
    if b is None:
        return "", b""
    if isinstance(b, str):
        b = b.encode("latin-1", errors="replace")
    try:
        return b.decode("cp949"), b
    except UnicodeDecodeError:
        return b.decode("latin-1"), b


def load_lua_tbl():
    # encoding=None => strings do Lua chegam como bytes crus. Essencial: texto e cp1252 e
    # resourceName e cp949; deixar o lupa decodificar sozinho corromperia um dos dois.
    lua = LuaRuntime(encoding=None, unpack_returned_tuples=True)

    def run(path):
        print(f"  executando {path.name} ...", flush=True)
        lua.execute(path.read_bytes())

    run(ROTP_F)
    run(BASE_LUA)

    g = lua.globals()
    base_count = sum(1 for _ in g[b"tbl"].keys())
    print(f"  tbl (base): {base_count} itens")

    run(CUSTOM_LUA)
    custom_count = sum(1 for _ in g[b"tbl_custom"].keys())
    print(f"  tbl_custom (pos-patches): {custom_count} itens")

    # Mesma ordem do cliente: custom sobrescreve, override por ultimo.
    lua.execute(b"F_itemInfoMerge(tbl_custom, true)")
    lua.execute(b"F_itemInfoMerge(tbl_override, true)")

    return g[b"tbl"], base_count, custom_count


def load_colors():
    colors = {}
    if not COLOR_TXT.exists():
        return colors
    for line in COLOR_TXT.read_bytes().decode("cp1252", errors="replace").splitlines():
        line = line.split("//")[0].strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 2:
            continue
        try:
            iid = int(parts[0])
            raw = parts[1]
            val = int(raw, 16) if raw.lower().startswith("0x") else int(raw)
            colors[iid] = f"#{val & 0xFFFFFF:06x}"
        except ValueError:
            continue
    return colors


def lua_list(t):
    """Tabela-array do Lua -> lista Python."""
    if t is None:
        return []
    out = []
    i = 1
    while True:
        v = t[i]
        if v is None:
            return out
        out.append(v)
        i += 1


def build_item(iid, desc, colors):
    def g(key):
        return desc[key.encode()]

    raw_name = g("identifiedDisplayName") or b""
    name = dec_text(raw_name)
    unid_name = dec_text(g("unidentifiedDisplayName"))
    res_name, res_bytes = dec_resource(g("identifiedResourceName"))
    desc_lines = [dec_text(x) for x in lua_list(g("identifiedDescriptionName"))]

    slot_count = g("slotCount") or 0
    class_num = g("ClassNum") or 0

    item = {
        "id": iid,
        "name": name or unid_name or f"Item {iid}",
        "unidentifiedName": unid_name,
        "descriptionLines": desc_lines,
        "descriptionText": "\n".join(strip_colors(l) for l in desc_lines),
        "resourceName": res_name,
        # hex dos bytes cp949 crus -- e a chave para casar com os nomes de arquivo do GRF,
        # que tambem sao cp949. Casar pela str decodificada perderia bytes invalidos.
        "resourceHex": res_bytes.hex(),
        "slotCount": int(slot_count),
        "classNum": int(class_num),
        "costume": bool(g("costume")),
        # .Custom e setado pelo proprio F_itemInfoMerge (rotp_f.lua:78), so para
        # tbl_custom/tbl_override. Os patches in-place (slotfix/jobfix) NAO marcam.
        "isCustom": bool(g("Custom")),
        # Item que a traducao PT-BR do servidor nunca cobriu: nome ainda em coreano.
        # Exposto como faceta porque e informacao real -- o jogador ve esse nome no jogo.
        "untranslated": looks_korean(raw_name),
    }

    item.update(parse_description(desc_lines))
    item.update(classify(item))
    if iid in colors:
        item["nameColor"] = colors[iid]
    item["searchName"] = deaccent(item["name"])
    return item


def main():
    print("Executando os arquivos Lua do cliente...")
    tbl, base_count, custom_count = load_lua_tbl()
    colors = load_colors()
    print(f"  cores customizadas (color_items.txt): {len(colors)}")

    print("\nExtraindo itens...")
    items = []
    for iid, desc in tbl.items():
        if not isinstance(iid, int):
            continue
        items.append(build_item(iid, desc, colors))
    items.sort(key=lambda x: x["id"])

    print(f"\nTOTAL de itens unicos: {len(items)}")
    print(f"  marcados Custom     : {sum(1 for i in items if i['isCustom'])}")
    print(f"  sem traducao (coreano): {sum(1 for i in items if i['untranslated'])}")

    print("\nCobertura de facetas:")
    for k in ["weight", "attack", "magicAttack", "defense", "magicDefense", "weaponLevel",
              "requiredLevel", "itemClass", "equipSlot", "element", "jobs", "compoundOn"]:
        print(f"  {k:<15} {sum(1 for it in items if it.get(k) is not None):>6}")
    # refineable e tri-state: False = "Refinavel: Nao" explicito; None = nao declarado.
    # Contar so os truthy (como um booleano) daria 0 e esconderia que a regex funciona.
    print(f"  {'refineable=False':<15} {sum(1 for it in items if it.get('refineable') is False):>6}")
    print(f"  {'indestructible':<15} {sum(1 for it in items if it.get('indestructible')):>6}")

    print("\nDistribuicao de tipos:")
    for t, n in Counter(it["type"] for it in items).most_common():
        print(f"  {t:<18} {n:>6}")

    bad = [it["id"] for it in items if "�" in it["name"] or "�" in it["descriptionText"]]
    print(f"\nItens com mojibake (deve ser 0): {len(bad)}" + (f" -> {bad[:10]}" if bad else ""))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
    print(f"\nEscrito: {OUT}  ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
