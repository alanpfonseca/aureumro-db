"""Baixa os icones de item do CDN publico do divine-pride e monta o manifesto de proveniencia.

Contexto (importante): a ideia original era extrair os icones dos GRFs do cliente. Isso NAO
e possivel -- tanto data.grf ("Event Horizon", tabela criptografada) quanto aureumRO.grf
(indice legivel mas PAYLOAD criptografado pelo Gepard: nenhuma das 136k entradas descomprime,
nem um .txt de livro) estao protegidos. Sem chave, nao ha extracao. Entao 100% dos icones vem
do CDN.

Regras de resolucao do ID do icone:
  - Item vanilla  -> pelo proprio ID (existe no kRO/divine-pride).
  - Item custom que compartilha resourceName com um vanilla -> HERDA o icone desse vanilla
    (no cliente e literalmente o mesmo arquivo de textura), entao usa o ID do vanilla.
  - Item custom orfao -> tenta o proprio ID; quase sempre volta o placeholder (descartado).

Armadilha (verificada): ID inexistente NAO da 404 -- da 200 com um PNG placeholder de 5610
bytes (sha 90fd5d...). Baixar cego encheria a base de icones falsos. Todo download cujo
hash bata com o placeholder e descartado.
"""

import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).parent.parent
ITEMS = ROOT / "build" / "items.raw.json"
CACHE = ROOT / "build" / "cdn_cache"          # PNGs crus; torna o processo resumivel
ICON_OUT = ROOT / "web" / "public" / "icons"  # o que o site serve
MANIFEST = ROOT / "build" / "icon_manifest.json"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
URL = "https://static.divine-pride.net/images/items/item/{}.png"
PLACEHOLDER_SHA = "90fd5dfc46354798fa8fc4cbcec9dee97d8071b75abc58951ab1887b11cd916e"

WORKERS = 12
RETRIES = 3

_print_lock = Lock()
_done = 0


def resolve_icon_ids(items):
    """Para cada item, decide de qual ID o icone deve vir. Devolve dict id_item -> id_cdn."""
    vanilla_res = {i["resourceHex"]: i["id"]
                   for i in items if not i["isCustom"] and i["resourceHex"]}
    mapping = {}
    inherited = 0
    for it in items:
        iid = it["id"]
        if it["isCustom"] and it["resourceHex"] in vanilla_res:
            mapping[iid] = vanilla_res[it["resourceHex"]]
            inherited += 1
        else:
            mapping[iid] = iid
    return mapping, inherited


def fetch_one(cdn_id):
    """Baixa (ou le do cache) o PNG do CDN. Devolve (bytes|None, status)."""
    cached = CACHE / f"{cdn_id}.png"
    miss = CACHE / f"{cdn_id}.miss"
    if cached.exists():
        return cached.read_bytes(), "cache"
    if miss.exists():
        return None, "cache-miss"

    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(URL.format(cdn_id), headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                body = r.read()
            if hashlib.sha256(body).hexdigest() == PLACEHOLDER_SHA:
                miss.write_bytes(b"")  # marca "nao existe" pra nao rebaixar no proximo run
                return None, "placeholder"
            if body[:8] != b"\x89PNG\r\n\x1a\n":
                return None, "not-png"
            cached.write_bytes(body)
            return body, "downloaded"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                miss.write_bytes(b"")
                return None, "404"
            time.sleep(0.5 * (attempt + 1))
        except Exception:
            time.sleep(0.5 * (attempt + 1))
    return None, "error"


def main():
    items = json.loads(ITEMS.read_text(encoding="utf-8"))
    mapping, inherited = resolve_icon_ids(items)
    print(f"itens: {len(items)}  | custom herdando icone de vanilla: {inherited}")

    CACHE.mkdir(parents=True, exist_ok=True)
    ICON_OUT.mkdir(parents=True, exist_ok=True)

    # Muitos itens apontam para o MESMO id de CDN (herança). Baixa cada id so uma vez.
    unique_ids = sorted(set(mapping.values()))
    print(f"IDs de CDN unicos a buscar: {len(unique_ids)}\n")

    results = {}  # cdn_id -> bool (tem icone real)
    total = len(unique_ids)

    def work(cdn_id):
        global _done
        body, status = fetch_one(cdn_id)
        with _print_lock:
            _done += 1
            if _done % 500 == 0 or _done == total:
                print(f"  {_done}/{total} ...", flush=True)
        return cdn_id, body is not None, status

    stats = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = [ex.submit(work, cid) for cid in unique_ids]
        for fut in as_completed(futures):
            cdn_id, ok, status = fut.result()
            results[cdn_id] = ok
            stats[status] = stats.get(status, 0) + 1

    print(f"\nstatus dos downloads: {stats}")

    # Copia/escreve o PNG final por ITEM (id do item, nao do CDN) e monta o manifesto.
    manifest = {}
    written = 0
    for it in items:
        iid = it["id"]
        cdn_id = mapping[iid]
        if results.get(cdn_id):
            data = (CACHE / f"{cdn_id}.png").read_bytes()
            (ICON_OUT / f"{iid}.png").write_bytes(data)
            manifest[iid] = "inherited" if cdn_id != iid else "cdn"
            written += 1
        else:
            manifest[iid] = "none"

    have = sum(1 for v in manifest.values() if v != "none")
    print(f"\nicones escritos: {written}")
    print(f"cobertura: {have}/{len(items)} ({100 * have / len(items):.1f}%)")
    print(f"  vanilla/proprio : {sum(1 for v in manifest.values() if v == 'cdn')}")
    print(f"  herdado         : {sum(1 for v in manifest.values() if v == 'inherited')}")
    print(f"  sem icone       : {sum(1 for v in manifest.values() if v == 'none')}")

    MANIFEST.write_text(json.dumps(manifest), encoding="utf-8")
    print(f"\nManifesto: {MANIFEST}")


if __name__ == "__main__":
    main()
