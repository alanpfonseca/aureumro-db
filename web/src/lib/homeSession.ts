import type { Filters } from "./filters";

// Estado da listagem preservado entre navegacoes (Home -> item -> voltar).
// Vive em modulo de proposito: sobrevive ao HashRouter e zera no reload da pagina.
export interface HomeSession {
  filters: Filters;
  scrollOffset: number;
}

let session: HomeSession | null = null;

export function saveHomeSession(s: HomeSession): void {
  session = s;
}

// Le sem consumir: voltar mais de uma vez continua restaurando.
export function takeHomeSession(): HomeSession | null {
  return session;
}
