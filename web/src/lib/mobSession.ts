import type { MobFilters } from "./mobFilters";

export interface MobSession {
  filters: MobFilters;
  scrollOffset: number;
}

let session: MobSession | null = null;

export function saveMobSession(s: MobSession): void {
  session = s;
}

export function takeMobSession(): MobSession | null {
  return session;
}
