import type { Meta } from "../types";
import { emptyFilters, hasActiveFacets, type Filters } from "../lib/search";

interface Props {
  meta: Meta | null;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
}

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export function FiltersPanel({ meta, filters, setFilters }: Props) {
  if (!meta) return <aside className="filters" />;

  const slotOptions = Array.from({ length: meta.maxSlots + 1 }, (_, i) => i);

  return (
    <aside className="filters">
      <div className="filter-group">
        <h4>Origem</h4>
        <div className="chip-row">
          {(["all", "vanilla", "custom"] as const).map((v) => (
            <span
              key={v}
              className={
                "chip" +
                (v === "custom" ? " custom" : "") +
                (filters.custom === v ? " active" : "")
              }
              onClick={() => setFilters((f) => ({ ...f, custom: v }))}
            >
              {v === "all" ? "Todos" : v === "vanilla" ? "Oficial" : "Custom"}
            </span>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h4>Tipo</h4>
        <div className="chip-row">
          {meta.types.map((t) => (
            <span
              key={t}
              className={"chip" + (filters.types.has(t) ? " active" : "")}
              onClick={() => setFilters((f) => ({ ...f, types: toggleInSet(f.types, t) }))}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h4>Slots (brechas)</h4>
        <div className="chip-row">
          {slotOptions.map((n) => (
            <span
              key={n}
              className={"chip" + (filters.slots.has(n) ? " active" : "")}
              onClick={() => setFilters((f) => ({ ...f, slots: toggleInSet(f.slots, n) }))}
            >
              {n}
            </span>
          ))}
        </div>
      </div>

      {meta.elements.length > 0 && (
        <div className="filter-group">
          <h4>Elemento</h4>
          <div className="chip-row">
            {meta.elements.map((el) => (
              <span
                key={el}
                className={"chip" + (filters.elements.has(el) ? " active" : "")}
                onClick={() =>
                  setFilters((f) => ({ ...f, elements: toggleInSet(f.elements, el) }))
                }
              >
                {el}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="filter-group">
        <h4>Nível necessário</h4>
        <div className="level-row">
          <input
            type="number"
            min={0}
            placeholder="mín"
            value={filters.minReqLevel ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                minReqLevel: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
          />
          <span>—</span>
          <input
            type="number"
            min={0}
            placeholder="máx"
            value={filters.maxReqLevel ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                maxReqLevel: e.target.value === "" ? null : Number(e.target.value),
              }))
            }
          />
        </div>
      </div>

      <div className="filter-group">
        <label className="toggle">
          <input
            type="checkbox"
            checked={filters.onlyWithDrops}
            onChange={(e) => setFilters((f) => ({ ...f, onlyWithDrops: e.target.checked }))}
          />
          Só o que monstro dropa
        </label>
        <label className="toggle" style={{ marginTop: 6 }}>
          <input
            type="checkbox"
            checked={filters.onlyPreRenewal}
            onChange={(e) => setFilters((f) => ({ ...f, onlyPreRenewal: e.target.checked }))}
          />
          Só pré-renewal
        </label>
        <label className="toggle" style={{ marginTop: 6 }}>
          <input
            type="checkbox"
            checked={filters.onlyWithIcon}
            onChange={(e) => setFilters((f) => ({ ...f, onlyWithIcon: e.target.checked }))}
          />
          Só com ícone
        </label>
      </div>

      {(hasActiveFacets(filters) || filters.text) && (
        <button
          className="clear-btn"
          onClick={() => setFilters(emptyFilters())}
        >
          Limpar filtros
        </button>
      )}
    </aside>
  );
}
