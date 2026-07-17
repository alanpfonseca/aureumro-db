import type { Meta } from "../types";
import { emptyFilters, hasActiveFacets, normalizeFilters, type Filters } from "../lib/filters";
import { tJob, tSubType } from "../lib/i18n";

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
  const showWeaponSub = filters.types.has("Arma");
  const showClass = [...filters.types].some((t) => meta.equipTypes.includes(t));

  const apply = (patch: Partial<Filters>) =>
    setFilters((f) => normalizeFilters({ ...f, ...patch }));

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
              onClick={() => apply({ custom: v })}
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
              onClick={() => apply({ types: toggleInSet(filters.types, t) })}
            >
              {t}
            </span>
          ))}
        </div>

        {showWeaponSub && meta.weaponSubTypes.length > 0 && (
          <div className="filter-subgroup">
            <h5>Tipo de arma</h5>
            <div className="chip-row">
              {meta.weaponSubTypes.map((st) => (
                <span
                  key={st}
                  className={"chip" + (filters.weaponSubTypes.has(st) ? " active" : "")}
                  onClick={() =>
                    apply({ weaponSubTypes: toggleInSet(filters.weaponSubTypes, st) })
                  }
                >
                  {tSubType(st)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {showClass && (
        <div className="filter-group">
          <h4>Classe</h4>
          <p className="dim small" style={{ margin: "0 0 8px" }}>
            Filtra pela base pré-renewal. Itens custom sem dados oficiais ficam de fora.
          </p>
          <div className="chip-row">
            {meta.jobBits.map((j) => (
              <span
                key={j}
                className={"chip" + (filters.jobs.has(j) ? " active" : "")}
                onClick={() => apply({ jobs: toggleInSet(filters.jobs, j) })}
              >
                {tJob(j)}
              </span>
            ))}
          </div>
          <div className="radio-row" style={{ marginTop: 10 }}>
            {([
              { k: "all", label: "Todas" },
              { k: "trans", label: "Só transcendentais" },
              { k: "nontrans", label: "Só classes normais" },
            ] as const).map((o) => (
              <label key={o.k} className="radio">
                <input
                  type="radio"
                  name="item-class-filter"
                  checked={filters.classes === o.k}
                  onChange={() => apply({ classes: o.k })}
                />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="filter-group">
        <h4>Slots (brechas)</h4>
        <div className="chip-row">
          {slotOptions.map((n) => (
            <span
              key={n}
              className={"chip" + (filters.slots.has(n) ? " active" : "")}
              onClick={() => apply({ slots: toggleInSet(filters.slots, n) })}
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
                onClick={() => apply({ elements: toggleInSet(filters.elements, el) })}
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
              apply({ minReqLevel: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
          <span>—</span>
          <input
            type="number"
            min={0}
            placeholder="máx"
            value={filters.maxReqLevel ?? ""}
            onChange={(e) =>
              apply({ maxReqLevel: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div className="filter-group">
        <label className="toggle">
          <input
            type="checkbox"
            checked={filters.onlyWithDrops}
            onChange={(e) => apply({ onlyWithDrops: e.target.checked })}
          />
          Só o que monstro dropa
        </label>
        <label className="toggle" style={{ marginTop: 6 }}>
          <input
            type="checkbox"
            checked={filters.onlyPreRenewal}
            onChange={(e) => apply({ onlyPreRenewal: e.target.checked })}
          />
          Só pré-renewal
        </label>
        <label className="toggle" style={{ marginTop: 6 }}>
          <input
            type="checkbox"
            checked={filters.onlyWithIcon}
            onChange={(e) => apply({ onlyWithIcon: e.target.checked })}
          />
          Só com ícone
        </label>
        <label className="toggle" style={{ marginTop: 6 }}>
          <input
            type="checkbox"
            checked={filters.onlyHatQuestIngredient}
            onChange={(e) => apply({ onlyHatQuestIngredient: e.target.checked })}
          />
          Só ingredientes de quests de chapéu
        </label>
      </div>

      {(hasActiveFacets(filters) || filters.text) && (
        <button className="clear-btn" onClick={() => setFilters(emptyFilters())}>
          Limpar filtros
        </button>
      )}
    </aside>
  );
}
