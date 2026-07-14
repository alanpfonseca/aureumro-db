import { Fragment, type ReactNode } from "react";

// As descricoes de RO embutem cor inline como ^RRGGBB (^000000 = "volta ao padrao").
// Converte a linha em spans coloridos. Mantem a semantica do cliente: uma cor vale
// ate o proximo codigo.
const COLOR_RE = /\^([0-9a-fA-F]{6})/g;

export function colorize(line: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let color: string | null = null;
  let key = 0;

  const push = (text: string) => {
    if (!text) return;
    if (color && color !== "000000") {
      parts.push(
        <span key={key++} style={{ color: `#${color}` }}>
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
