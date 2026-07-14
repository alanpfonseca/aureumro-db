// Tradução dos valores crus do rAthena (que são em inglês) para PT-BR.
// Só os rótulos: nomes de monstro ficam em inglês de propósito — é como o pessoal
// os chama em jogo ("Poring", "Pharaoh"), traduzir atrapalharia a busca.

const SUBTYPE: Record<string, string> = {
  Fist: "Punho",
  Dagger: "Adaga",
  "1hSword": "Espada (1 mão)",
  "2hSword": "Espada (2 mãos)",
  "1hSpear": "Lança (1 mão)",
  "2hSpear": "Lança (2 mãos)",
  "1hAxe": "Machado (1 mão)",
  "2hAxe": "Machado (2 mãos)",
  Mace: "Maça",
  "2hMace": "Maça (2 mãos)",
  "1hStaff": "Cajado (1 mão)",
  "2hStaff": "Cajado (2 mãos)",
  Staff: "Cajado",
  Bow: "Arco",
  Knuckle: "Manopla",
  Musical: "Instrumento",
  Whip: "Chicote",
  Book: "Livro",
  Katar: "Katar",
  Revolver: "Revólver",
  Rifle: "Rifle",
  Gatling: "Metralhadora",
  Shotgun: "Escopeta",
  Grenade: "Granada",
  Huuma: "Shuriken Gigante",
  Shuriken: "Shuriken",
  Kunai: "Kunai",
  Arrow: "Flecha",
  Bullet: "Bala",
  Card: "Carta",
  Armor: "Armadura",
  Weapon: "Arma",
  Healing: "Cura",
  Usable: "Consumível",
  Etc: "Diversos",
  Ammo: "Munição",
  DelayConsume: "Consumível",
  Cash: "Cash",
  PetEgg: "Ovo de Pet",
  PetArmor: "Acessório de Pet",
};

const JOB: Record<string, string> = {
  Novice: "Aprendiz",
  SuperNovice: "Super Aprendiz",
  Swordman: "Espadachim",
  Knight: "Cavaleiro",
  Crusader: "Templário",
  Merchant: "Mercador",
  Blacksmith: "Ferreiro",
  Alchemist: "Alquimista",
  Thief: "Gatuno",
  Assassin: "Assassino",
  Rogue: "Arruaceiro",
  Archer: "Arqueiro",
  Hunter: "Caçador",
  Bard: "Bardo",
  Dancer: "Odalisca",
  Mage: "Mago",
  Wizard: "Bruxo",
  Sage: "Sábio",
  Acolyte: "Noviço",
  Priest: "Sacerdote",
  Monk: "Monge",
  Taekwon: "Taekwon",
  StarGladiator: "Justiceiro",
  SoulLinker: "Arruaceiro Espiritual",
  Gunslinger: "Justiceiro",
  Ninja: "Ninja",
  Summoner: "Invocador",
};

const RACE: Record<string, string> = {
  Formless: "Amorfo",
  Undead: "Morto-Vivo",
  Brute: "Bruto",
  Plant: "Planta",
  Insect: "Inseto",
  Fish: "Peixe",
  Demon: "Demônio",
  Demihuman: "Humanóide",
  Angel: "Anjo",
  Dragon: "Dragão",
  Player: "Jogador",
  All: "Todos",
};

const ELEMENT: Record<string, string> = {
  Neutral: "Neutro",
  Water: "Água",
  Earth: "Terra",
  Fire: "Fogo",
  Wind: "Vento",
  Poison: "Veneno",
  Holy: "Sagrado",
  Dark: "Sombrio",
  Ghost: "Fantasma",
  Undead: "Morto-Vivo",
};

const SIZE: Record<string, string> = {
  Small: "Pequeno",
  Medium: "Médio",
  Large: "Grande",
};

const pick = (map: Record<string, string>) => (v?: string | null) =>
  v ? (map[v] ?? v.replace(/_/g, " ")) : "";

export const tSubType = pick(SUBTYPE);
export const tJob = pick(JOB);
export const tRace = pick(RACE);
export const tElement = pick(ELEMENT);
export const tSize = pick(SIZE);
