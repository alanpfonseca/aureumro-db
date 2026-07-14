import { useState } from "react";
import { cdnItemUrl } from "../lib/data";

interface Props {
  id: number;
  hasIcon: boolean;
  name: string;
  size?: number;
  big?: boolean; // no detalhe, tenta a imagem grande (collection) primeiro
}

// Degrada em cadeia: icone local -> CDN por id -> placeholder. Um item custom orfao
// (sem icone local e inexistente no CDN) cai no placeholder sem quebrar o layout.
export function ItemIcon({ id, hasIcon, name, size = 32 }: Props) {
  const base = import.meta.env.BASE_URL;
  const chain: string[] = [];
  if (hasIcon) chain.push(`${base}icons/${id}.png`);
  chain.push(cdnItemUrl(id));

  const [step, setStep] = useState(0);
  const failed = step >= chain.length;

  if (failed) {
    return (
      <span
        className="icon-fallback"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
        title={name}
        aria-label={name}
      >
        ?
      </span>
    );
  }

  return (
    <img
      src={chain[step]}
      width={size}
      height={size}
      loading="lazy"
      alt={name}
      className="item-icon"
      onError={() => setStep((s) => s + 1)}
      style={{ width: size, height: size }}
    />
  );
}
