import type { Meta } from "../types";
import { emptyMobFilters, hasActiveMobFacets, type MobFilters, type MobSort } from "../lib/mobFilters";
import { tElement, tRace, tSize } from "../lib/i18n";

interface Props {
  meta: Meta | null;
  filters: MobFilters;
  setFilters: React.Dispatch<React.SetStateAction<MobFilters>>;
}

function toggleInSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

const MVP_OPTIONS: { value: MobFilters["mvp"]; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "mvp", label: "Só MVP" },
  { value: "normal", label: "Sem MVP" },
];

const SORT_OPTIONS: { value: MobSort; label: string }[] = [
  { value: "level", label: "Nível" },
  { value: "hp", label: "HP" },
  { value: "name", label: "Nome" },
  { value: "exp", label: "EXP" },
  { value: "id", label: "ID" },
];

export function MobFiltersPanel({ meta, filters, setFilters }: Props) {
  if (!meta) return <aside className="filters" />;

  return (
    <aside className="filters">
      <div className="filter-group">
        <h4>Raça</h4>
        <div className="chip-row">
          {meta.mobRaces.map((r) => (
            <span
              key={r}
              className={"chip" + (filters.races.has(r) ? " active" : "")}
              onClick={() =>
                setFilters((f) => ({ ...f, races: toggleInSet(f.races, r) }))
              }
            >
              {tRace(r)}
            </span>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h4>Elemento</h4>
        <div className="chip-row">
          {meta.mobElements.map((el) => (
            <span
              key={el}
              className={"chip" + (filters.elements.has(el) ? " active" : "")}
              onClick={() =>
                setFilters((f) => ({ ...f, elements: toggleInSet(f.elements, el) }))
              }
            >
              {tElement(el)}
            </span>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h4>Tamanho</h4>
        <div className="chip-row">
          {meta.mobSizes.map((sz) => (
            <span
              key={sz}
              className={"chip" + (filters.sizes.has(sz) ? " active" : "")}
              onClick={() =>
                setFilters((f) => ({ ...f, sizes: toggleInSet(f.sizes, sz) }))
              }
            >
              {tSize(sz)}
            </span>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h4>MVP</h4>
        <div className="radio-row">
          {MVP_OPTIONS.map((o) => (
            <label key={o.value} className="radio">
              <input
                type="radio"
                name="mob-mvp-filter"
                checked={filters.mvp === o.value}
                onChange={() => setFilters((f) => ({ ...f, mvp: o.value }))}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h4>Nível</h4>
        <div className="level-row">
          <input
            type="number"
            min={1}
            max={meta.mobMaxLevel}
            placeholder="mín"
            value={filters.minLevel ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                minLevel: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
          />
          <span>—</span>
          <input
            type="number"
            min={1}
            max={meta.mobMaxLevel}
            placeholder="máx"
            value={filters.maxLevel ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                maxLevel: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
          />
        </div>
      </div>

      <div className="filter-group">
        <label className="toggle">
          <input
            type="checkbox"
            checked={filters.onlyWithSpawn}
            onChange={(e) =>
              setFilters((f) => ({ ...f, onlyWithSpawn: e.target.checked }))
            }
          />
          Só com spawn conhecido
        </label>
      </div>

      <div className="filter-group">
        <h4>Ordenar por</h4>
        <select
          className="city-select"
          value={filters.sort}
          onChange={(e) =>
            setFilters((f) => ({ ...f, sort: e.target.value as MobSort }))
          }
          aria-label="Ordenar monstros por"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {hasActiveMobFacets(filters) && (
        <button
          className="clear-btn"
          onClick={() => setFilters(emptyMobFilters())}
        >
          Limpar filtros
        </button>
      )}
    </aside>
  );
}
