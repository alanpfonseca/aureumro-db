"""Baixa a base PRE-RENEWAL do rAthena (open source) para build/rathena/.

Por que rAthena e nao divine-pride: a API do divine-pride exige chave (401 sem ela) e serve
dados de RENEWAL. O AureumRO e pre-renewal por design, e a base pre-re do rAthena e
publica, e exatamente a referencia certa. Ela da tres coisas:
  - db/pre-re/item_db_*.yml : stats OFICIAIS pre-re (ATK, DEF, peso, slots, jobs, refinavel)
  - db/pre-re/mob_db.yml    : monstros + seus DROPS com taxa
  - npc/pre-re/mobs/**.txt  : SPAWNS (em que mapa cada monstro aparece, e quantos)

Isto e uma REFERENCIA pre-re padrao, nao o servidor do AureumRO -- eles podem ter mexido em
taxas e drops. O site deve deixar isso claro.
"""

import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OUT = Path(__file__).parent.parent / "build" / "rathena"
RAW = "https://raw.githubusercontent.com/rathena/rathena/master/"
TREE = "https://api.github.com/repos/rathena/rathena/git/trees/master?recursive=1"
UA = "Mozilla/5.0 (compatible; AureumRO-DB-builder/1.0)"

DB_FILES = [
    "db/pre-re/item_db_equip.yml",
    "db/pre-re/item_db_usable.yml",
    "db/pre-re/item_db_etc.yml",
    "db/pre-re/mob_db.yml",
]


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def save(relpath, data):
    dest = OUT / relpath
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return dest


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    print("Baixando os db pre-re...")
    for f in DB_FILES:
        dest = OUT / f
        if dest.exists() and dest.stat().st_size > 0:
            print(f"  (cache) {f}")
            continue
        data = get(RAW + f)
        save(f, data)
        print(f"  {f}  {len(data) / 1000:.0f} KB")

    # Os spawns sao ~200 arquivos espalhados em npc/pre-re/mobs/. Pega a arvore do repo
    # de uma vez em vez de adivinhar os caminhos.
    print("\nListando os scripts de spawn (npc/pre-re/mobs/)...")
    tree = json.loads(get(TREE))
    spawn_paths = [
        n["path"] for n in tree["tree"]
        if n["path"].startswith("npc/pre-re/mobs/") and n["path"].endswith(".txt")
    ]
    print(f"  {len(spawn_paths)} arquivos")

    missing = [p for p in spawn_paths if not (OUT / p).exists()]
    print(f"  a baixar: {len(missing)}")

    if missing:
        def fetch(p):
            try:
                save(p, get(RAW + p))
                return True
            except Exception as e:
                print(f"  ! {p}: {e}")
                return False

        with ThreadPoolExecutor(max_workers=10) as ex:
            ok = sum(1 for r in ex.map(fetch, missing) if r)
        print(f"  baixados: {ok}/{len(missing)}")

    (OUT / "spawn_index.json").write_text(json.dumps(spawn_paths), encoding="utf-8")
    print(f"\nPronto em {OUT}")


if __name__ == "__main__":
    sys.exit(main())
