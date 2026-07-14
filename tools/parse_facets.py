"""Extrai facetas estruturadas do texto (semiestruturado) das descricoes de item.

As descricoes de RO nao sao um formato: sao texto livre com convencoes. Todo campo aqui e
opcional e o parser nunca assume presenca. Ausente => None, e o item so nao entra naquele filtro.

Os rotulos abaixo NAO foram inventados -- saem de um levantamento de frequencia sobre as
20.7k descricoes reais deste servidor. Dai vem tres fatos que guiam o codigo:

  1. Existe um campo "Tipo:" explicito em ~8.9k itens. O tipo NAO precisa ser adivinhado
     na maioria dos casos; a heuristica so entra quando o campo falta.
  2. Parte do dataset nao foi traduzida e usa rotulos em INGLES ("Type:", "Weight:",
     "Attack:", "Compound on:"). Ignorar isso perderia ~300 itens por faceta.
  3. Dois campos podem dividir a MESMA linha, e o espacamento varia:
       "Classe: ^777777Espada^000000     Forca de Ataque: ^77777725^000000"
       "Peso:^009900 5^000000"   vs   "Peso: ^777777 50^000000"
     Por isso o codigo de cor sai ANTES do casamento, o separador de campo e "2+ espacos",
     e as regexes toleram espaco opcional em volta do ':'.
"""

import re
import unicodedata

COLOR_RE = re.compile(r"\^[0-9a-fA-F]{6}")


def strip_colors(text):
    return COLOR_RE.sub("", text)


def deaccent(text):
    """'Poção' -> 'pocao'. O jogador digita sem acento na busca.

    Mapeia caractere a caractere de proposito, em vez de normalizar a string inteira:
    o resultado TEM que ter o mesmo comprimento da entrada, porque parse_description()
    casa as regexes na versao sem acento e usa os offsets pra recortar o texto ORIGINAL
    (com acento). NFKD na string toda quebraria isso -- 'ﬁ' vira 'fi' (2 chars) e '½'
    vira '1⁄2' (3), deslocando todos os offsets seguintes.
    """
    out = []
    for ch in text:
        folded = "".join(
            c for c in unicodedata.normalize("NFKD", ch) if not unicodedata.combining(c)
        )
        out.append(folded if len(folded) == 1 else ch)
    return "".join(out).lower()


def _rx(pattern):
    return re.compile(pattern, re.IGNORECASE)


# Um campo termina no fim da linha OU em 2+ espacos (quando dois campos dividem a linha).
END = r"(?=\s{2,}|$)"

# Casadas contra a linha ja SEM cor e ja SEM acento, o que evita escrever cada
# variante "Nivel"/"Nível" duas vezes. Rotulos PT e EN no mesmo alternador.
INT_FIELDS = {
    "weight":        _rx(r"(?:peso|weight)\s*:\s*([\d.,]+)"),
    "attack":        _rx(r"(?:forca de ataque|poder de ataque|ataque|atq|attack)\s*:\s*(\d+)"),
    "magicAttack":   _rx(r"(?:ataque magico|atqm|matk|magic attack)\s*:\s*(\d+)"),
    "defense":       _rx(r"(?:defesa|def|defense)\s*:\s*(\d+)"),
    "magicDefense":  _rx(r"(?:defesa magica|defm|mdef)\s*:\s*(\d+)"),
    "weaponLevel":   _rx(r"(?:nivel da arma|weapon level)\s*:\s*(\d+)"),
    "requiredLevel": _rx(r"(?:nivel necessario|base level|requirement|required level)\s*:\s*(\d+)"),
}

STR_FIELDS = {
    "itemClass": _rx(r"(?:tipo|type|classe)\s*:\s*(.+?)" + END),
    "equipSlot": _rx(r"(?:equipa em|equipped on|location|posicao)\s*:\s*(.+?)" + END),
    "element":   _rx(r"(?:propriedade|elemento|element|property)\s*:\s*(.+?)" + END),
    "jobs":      _rx(r"(?:classes que utilizam|profissoes que utilizam|classes que podem usar"
                     r"|classes|jobs|applicable jobs)\s*:\s*(.+?)" + END),
    "compoundOn": _rx(r"(?:compoe em|compoe|compound on)\s*:\s*(.+?)" + END),
}

# "Refinavel: Nao" e a UNICA forma que aparece (337x) -- nao existe "Refinavel: Sim".
# Ou seja: o campo so e escrito para NEGAR. Default = refinavel, e a ausencia nao prova nada,
# entao guardamos explicitamente None/False/True em vez de um booleano ingenuo.
NOT_REFINEABLE_RE = _rx(r"(?:refinavel|refineable)\s*:\s*(?:nao|no|nÃ£o)")
INDESTRUCTIBLE_RE = _rx(r"(?:nao pode ser destruid|indestrutivel|indestructible)")

MAX_VALUE_LEN = 60

# O campo "Propriedade:" vem em texto livre e mistura PT/EN, genero e sinonimos
# ("Neutro"/"Neutra"/"Neutral", "Agua"/"Water", "Terra"/"Earth", "Sombrio"/"Sombria"/
# "Sombras"/"Escuridao"). Sem canonicalizar, o filtro vira 19 opcoes quase duplicadas.
# Mapa por forma sem acento -> rotulo canonico (os 10 elementos reais de RO).
ELEMENT_CANON = {
    "neutro": "Neutro", "neutra": "Neutro", "neutral": "Neutro",
    "agua": "Água", "water": "Água",
    "terra": "Terra", "earth": "Terra",
    "fogo": "Fogo", "fire": "Fogo",
    "vento": "Vento", "wind": "Vento",
    "veneno": "Veneno", "poison": "Veneno",
    "sagrado": "Sagrado", "sagrada": "Sagrado", "holy": "Sagrado",
    "sombrio": "Sombrio", "sombria": "Sombrio", "sombras": "Sombrio",
    "escuridao": "Sombrio", "maldito": "Sombrio", "shadow": "Sombrio", "dark": "Sombrio",
    "fantasma": "Fantasma", "ghost": "Fantasma",
    "morto-vivo": "Morto-Vivo", "morto vivo": "Morto-Vivo", "undead": "Morto-Vivo",
}


def canon_element(value):
    if not value:
        return None
    return ELEMENT_CANON.get(deaccent(value).strip())


def parse_description(lines):
    """lines: lista de str (ainda com codigos de cor). Facetas ausentes vem como None."""
    facets = {k: None for k in INT_FIELDS}
    facets.update({k: None for k in STR_FIELDS})
    facets["refineable"] = None
    facets["indestructible"] = False

    for raw in lines:
        clean = strip_colors(raw)
        flat = deaccent(clean)

        for key, rx in INT_FIELDS.items():
            if facets[key] is None:
                m = rx.search(flat)
                if m:
                    try:
                        facets[key] = int(float(m.group(1).replace(",", ".").rstrip(".")))
                    except ValueError:
                        pass

        for key, rx in STR_FIELDS.items():
            if facets[key] is None:
                m = rx.search(flat)
                if m:
                    # Recorta do texto ORIGINAL (com acento) usando os offsets do match,
                    # que so batem porque deaccent() preserva comprimento.
                    span = clean[m.start(1):m.end(1)].strip(" .,")
                    if span and len(span) <= MAX_VALUE_LEN:
                        facets[key] = span

        if NOT_REFINEABLE_RE.search(flat):
            facets["refineable"] = False
        if INDESTRUCTIBLE_RE.search(flat):
            facets["indestructible"] = True

    # Canonicaliza o elemento para o filtro. Mantem o bruto so se nao reconhecido.
    if facets["element"]:
        canon = canon_element(facets["element"])
        if canon:
            facets["element"] = canon

    return facets


# --- Normalizacao de tipo -------------------------------------------------------------
# O campo "Tipo:" tem 182 valores distintos ("Espada", "Sword", "Adaga", "Equipamento para
# Cabeca", "Equipamento para a cabeca", ...). Agrupamos numa categoria ampla pro filtro,
# preservando o valor original em `itemClass` pra quem quiser o detalhe.

TYPE_RULES = [
    ("Carta",       [r"^carta$", r"^card$"]),
    ("Traje",       [r"visual", r"costume", r"^traje"]),
    ("Sombrio",     [r"sombri[ao]", r"shadow"]),
    ("Arma",        [r"espada|sword|adaga|dagger|maca|mace|machado|axe|lanca|spear|arco|bow",
                     r"cajado|staff|livro|book|chicote|whip|katar|punho|knuckle|instrumento",
                     r"revolver|rifle|shotgun|gatling|launcher|canhao|arma|weapon|foice|huuma",
                     r"shuriken|kunai|balestra|crossbow|manopla"]),
    ("Escudo",      [r"escudo", r"shield"]),
    ("Armadura",    [r"armadura", r"armor", r"vestimenta", r"robe", r"^roupa"]),
    ("Capa",        [r"^capa", r"garment", r"manto", r"ombreira"]),
    ("Calçado",     [r"calcado", r"sapato", r"shoes", r"boots", r"bota"]),
    ("Acessório",   [r"acessorio", r"accessory", r"anel|ring|brinco|colar|pingente|pendant"]),
    ("Headgear",    [r"cabeca", r"headgear", r"chapeu", r"^topo|^meio|^baixo"]),
    ("Consumível",  [r"consumivel|consumable|pocao|potion|comida|food|healing|recuperacao"]),
    ("Munição",     [r"municao|ammo|flecha|arrow|bala|bullet|cartucho|canhonball"]),
    ("Pet",         [r"^pet|montaria|mount|ovo|egg|coleira"]),
    ("Material",    [r"material|minerio|ore|ingrediente|manufactur|craft"]),
    ("Caixa",       [r"caixa|box|bau|pacote|package"]),
]

COMPILED_TYPE_RULES = [
    (name, [re.compile(p, re.IGNORECASE) for p in pats]) for name, pats in TYPE_RULES
]


# Cartas sao o caso mais bagunçado do dataset, por dois motivos independentes:
#   - o servidor REESCREVEU a descricao de algumas cartas (ARO_carddesc), e a descricao nova
#     nao tem mais a linha "Compoe em:" -- a carta perdeu o proprio sinal de tipo (ex.: 4128);
#   - 351 cartas nunca foram traduzidas e so tem nome coreano, que termina em 카드 ("card").
# Por isso o nome tambem vale como sinal, nao so a descricao.
CARD_NAME_RE = re.compile(r"^carta\b|\bcarta$|\bcard$|카드$", re.IGNORECASE)

CONSUMABLE_RE = re.compile(
    r"clique duplo|ao usar|recupera|restaura|\bcura\b|ingerir|\bcomer\b|consumivel", re.I
)
BOX_RE = re.compile(r"\b(caixa|bau|pacote|box|package)\b", re.I)
BOX_ACTION_RE = re.compile(r"abr[ai]|contendo|contem|containing|contains", re.I)
MATERIAL_RE = re.compile(r"usado na fabricacao|material de|minerio|ingrediente|refinar itens", re.I)


def classify(item):
    """Devolve {'type': ...}.

    Prefere o campo "Tipo:"/"Type:" declarado na descricao (existe em ~9k itens). So cai
    na heuristica quando ele falta -- e quando cai, prefere o que o item TEM (weaponLevel,
    defense, compoundOn) ao que o texto diz, porque campo estruturado mente menos que prosa.
    O que sobra fica em "Diversos": e um balde grande de proposito, porque o cliente
    honestamente nao diz o tipo desses itens e chutar seria pior que admitir.
    """
    name_flat = deaccent(item.get("name") or "")

    # Carta antes de tudo: e o unico tipo que o nome identifica com seguranca.
    if item.get("compoundOn") is not None or CARD_NAME_RE.search(name_flat):
        return {"type": "Carta"}

    if item.get("costume"):
        return {"type": "Traje"}

    declared = item.get("itemClass")
    if declared:
        flat = deaccent(declared)
        for name, pats in COMPILED_TYPE_RULES:
            if any(p.search(flat) for p in pats):
                return {"type": name}

    if item.get("weaponLevel") is not None or item.get("attack"):
        return {"type": "Arma"}

    if item.get("defense"):
        slot = deaccent(item.get("equipSlot") or "")
        if slot:
            for name, pats in COMPILED_TYPE_RULES:
                if any(p.search(slot) for p in pats):
                    return {"type": name}
        return {"type": "Armadura"}

    desc = deaccent(item.get("descriptionText") or "")
    if BOX_RE.search(name_flat) or (BOX_RE.search(desc) and BOX_ACTION_RE.search(desc)):
        return {"type": "Caixa"}
    if CONSUMABLE_RE.search(desc):
        return {"type": "Consumível"}
    if MATERIAL_RE.search(desc):
        return {"type": "Material"}

    return {"type": "Diversos"}
