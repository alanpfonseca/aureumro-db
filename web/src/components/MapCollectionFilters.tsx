interface Props {
  bonusTypes?: { id: string; label: string }[];
  cities: string[];
  city: string;
  setCity: (v: string) => void;
  selectedBonuses: Set<string>;
  setSelectedBonuses: (v: Set<string>) => void;
}

function toggleInSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function MapCollectionFilters({
  bonusTypes,
  cities,
  city,
  setCity,
  selectedBonuses,
  setSelectedBonuses,
}: Props) {
  const bonuses = bonusTypes ?? [];
  const hasFilter = city || selectedBonuses.size > 0;

  return (
    <aside className="filters">
      <div className="filter-group">
        <h4>Bônus do mapa</h4>
        <div className="chip-row">
          {bonuses.map((b) => (
            <span
              key={b.id}
              className={"chip" + (selectedBonuses.has(b.id) ? " active" : "")}
              onClick={() => setSelectedBonuses(toggleInSet(selectedBonuses, b.id))}
              title={b.label}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h4>Cidade</h4>
        <select
          className="city-select"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          aria-label="Filtrar por cidade"
        >
          <option value="">Todas as cidades</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {hasFilter && (
        <button
          className="clear-btn"
          onClick={() => {
            setCity("");
            setSelectedBonuses(new Set());
          }}
        >
          Limpar filtros
        </button>
      )}
    </aside>
  );
}
