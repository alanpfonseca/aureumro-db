import { Fragment, type ReactNode } from "react";

// As descricoes de RO embutem cor inline como ^RRGGBB (^000000 = "volta ao padrao").
// Converte a linha em spans coloridos. Mantem a semantica do cliente: uma cor vale
// ate o proximo codigo.
const COLOR_RE = /\^([0-9a-fA-F]{6})/g;

// Os codigos de cor do cliente foram calibrados para o fundo BRANCO da janela de item
// do jogo; no tema escuro, azul puro (^0000ff), verde escuro (^009900) e roxo (^a400cd)
// ficam quase ilegiveis. Recalibra mantendo o matiz e elevando a luminosidade ao minimo
// legivel — transformacao extraida do resource/cores.png (esquema validado com um
// usuario daltonico). Azul puro desvia levemente para ciano (matiz 240 -> 216), que e o
// unico jeito de deixa-lo legivel em fundo escuro sem perder a identidade de "azul".
const MIN_LIGHTNESS = 0.62;

export function readableColor(hex: string): string {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (l >= MIN_LIGHTNESS) return `#${raw}`;

  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h > 216 && h <= 264) h = 216;

  // HSL -> RGB com a luminosidade elevada
  const nl = MIN_LIGHTNESS;
  const c = (1 - Math.abs(2 * nl - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = nl - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const [r2, g2, b2] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg];
  const toHex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

export function colorize(line: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let color: string | null = null;
  let key = 0;

  const push = (text: string) => {
    if (!text) return;
    if (color && color !== "000000") {
      parts.push(
        <span key={key++} style={{ color: readableColor(color) }}>
          {text}
        </span>,
      );
    } else {
      parts.push(<Fragment key={key++}>{text}</Fragment>);
    }
  };

  for (const m of line.matchAll(COLOR_RE)) {
    push(line.slice(last, m.index));
    color = m[1].toLowerCase();
    last = m.index + m[0].length;
  }
  push(line.slice(last));
  return parts;
}

export function stripColors(line: string): string {
  return line.replace(COLOR_RE, "");
}
