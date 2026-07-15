import { useState } from "react";
import { cdnItemUrl, localIconUrl } from "../lib/data";

interface Props {
  id: number;
  hasIcon: boolean;
  name: string;
  size?: number;
  // Tentar o CDN externo quando nao ha icone local. So a pagina de detalhe liga isso:
  // na listagem (20k linhas) cada tentativa seria um request externo lento/404.
  cdnFallback?: boolean;
}

// Degrada em cadeia: icone local -> CDN por id (se cdnFallback) -> placeholder.
export function ItemIcon({ id, hasIcon, name, size = 32, cdnFallback = false }: Props) {
  const chain: string[] = [];
  if (hasIcon) chain.push(localIconUrl(id));
  if (cdnFallback) chain.push(cdnItemUrl(id));

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
      decoding="async"
      alt={name}
      className="item-icon"
      onError={() => setStep((s) => s + 1)}
      style={{ width: size, height: size }}
    />
  );
}
