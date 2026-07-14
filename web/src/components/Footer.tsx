import type { Meta } from "../types";

export function Footer({ meta }: { meta: Meta | null }) {
  return (
    <footer className="footer">
      <p>
        <strong>Nome, descrição e ícone</strong> vêm do cliente do AureumRO.{" "}
        <strong>Stats, drops e mapas</strong> vêm da base <strong>pré-renewal do rAthena</strong>.
      </p>
      <p>
        O AureumRO é pré-re, mas roda um cliente renewal — por isso a descrição de alguns itens
        mostra números de renewal que não valem em jogo. Onde isso acontece, o item traz um aviso.
        E como a base do rAthena é uma <em>referência</em> pré-re padrão (não um dump do servidor),
        o AureumRO pode ter ajustado taxas e drops: use como estimativa.
      </p>
      {meta && (
        <p>
          {meta.total.toLocaleString("pt-BR")} itens · {meta.custom.toLocaleString("pt-BR")} custom ·{" "}
          {meta.preRenewal.toLocaleString("pt-BR")} no pré-re ·{" "}
          {meta.withDrops.toLocaleString("pt-BR")} com drop conhecido ·{" "}
          {meta.mobs.toLocaleString("pt-BR")} monstros ·{" "}
          {meta.divergent.toLocaleString("pt-BR")} com descrição divergente. Ícones via
          divine-pride.net.
        </p>
      )}
    </footer>
  );
}
