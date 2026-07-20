export type MobSort = "level" | "hp" | "name" | "exp" | "id";

export interface MobFilters {
  text: string;
  races: Set<string>;
  elements: Set<string>;
  sizes: Set<string>;
  mvp: "all" | "mvp" | "normal";
  minLevel: number | null;
  maxLevel: number | null;
  onlyWithSpawn: boolean;
  sort: MobSort;
}

export function emptyMobFilters(): MobFilters {
  return {
    text: "",
    races: new Set(),
    elements: new Set(),
    sizes: new Set(),
    mvp: "all",
    minLevel: null,
    maxLevel: null,
    onlyWithSpawn: false,
    sort: "level",
  };
}

export function hasActiveMobFacets(f: MobFilters): boolean {
  return (
    f.races.size > 0 ||
    f.elements.size > 0 ||
    f.sizes.size > 0 ||
    f.mvp !== "all" ||
    f.minLevel != null ||
    f.maxLevel != null ||
    f.onlyWithSpawn
  );
}
