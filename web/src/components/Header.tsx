import { Link, NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

// Página nova = 1 linha aqui (+ a rota em main.tsx).
const NAV_TABS = [
  { label: "Itens", to: "/", alsoActive: ["/item/"] },
  { label: "Quests de Chapéu", to: "/hat-quests" },
  { label: "Coleções de Mapa", to: "/map-collections" },
  { label: "Monstros", to: "/mobs", alsoActive: ["/mob/", "/map/"] },
];

export function Header({ tagline, children }: { tagline?: ReactNode; children?: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <header className="header">
      <div className="header-row">
        <Link to="/" className="logo">
          <span className="gold">Aureum</span>RO
        </Link>
        {tagline && <span className="tagline">{tagline}</span>}
      </div>
      <nav className="tabs" aria-label="Seções do site">
        {NAV_TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              isActive || t.alsoActive?.some((p) => pathname.startsWith(p)) ? "tab active" : "tab"
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </header>
  );
}
