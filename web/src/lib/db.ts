import { createDbWorker } from "sql.js-httpvfs";
import type { WorkerHttpvfs } from "sql.js-httpvfs";
import workerUrl from "sql.js-httpvfs/dist/sqlite.worker.js?url";
import wasmUrl from "sql.js-httpvfs/dist/sql-wasm.wasm?url";

// O banco (web/public/data/aureumro.db) e consultado DIRETO no navegador: o worker
// do sql.js-httpvfs baixa so as paginas de 4 KB necessarias via HTTP Range requests.
// requestChunkSize DEVE ser igual ao PRAGMA page_size do banco (tools/db_common.py).
const BASE = import.meta.env.BASE_URL;
const REQUEST_CHUNK_SIZE = 4096;

let workerPromise: Promise<WorkerHttpvfs> | null = null;

// Singleton em nivel de modulo: o StrictMode nunca cria um segundo worker, e o cache
// de paginas do worker sobrevive a navegacao (e o que torna o "voltar" instantaneo).
export function getDb(): Promise<WorkerHttpvfs> {
  if (!workerPromise) {
    workerPromise = (async () => {
      // db-info.json e regravado a cada build do pipeline; o version vira cacheBust
      // para o navegador nao misturar paginas de versoes diferentes apos um deploy.
      const info: { version: number; sizeBytes: number } = await fetch(
        `${BASE}data/db-info.json`,
      ).then((r) => {
        if (!r.ok) throw new Error(`db-info: ${r.status}`);
        return r.json();
      });
      return createDbWorker(
        [
          {
            from: "inline",
            config: {
              serverMode: "full",
              // URL absoluta: o httpvfs resolve URLs relativas contra o script do
              // worker (que o Vite serve de outro caminho), nao contra a pagina.
              url: new URL(`${BASE}data/aureumro.db`, location.href).toString(),
              requestChunkSize: REQUEST_CHUNK_SIZE,
              // So em producao: o middleware do Vite DEV trata query string em asset
              // do public/ por um caminho lento (~2 s por range request); o dev
              // server ja responde com no-cache, entao o cache-buster e dispensavel.
              cacheBust: import.meta.env.PROD ? String(info.version) : undefined,
            },
          },
        ],
        new URL(workerUrl, location.href).toString(),
        new URL(wasmUrl, location.href).toString(),
      );
    })();
  }
  return workerPromise;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { db } = await getDb();
  // O array de params vai como UM argumento: no worker, query e (...args) =>
  // exec(...args), e o exec do sql.js espera (sql, paramsArray). Espalhar os params
  // faria o sql.js ignorar o bind e amarrar tudo como NULL.
  return (await db.query(sql, params)) as T[];
}

// Console de depuracao: SQL arbitrario e estatisticas de rede do worker pelo
// DevTools (ex.: __dbQuery("SELECT count(*) FROM items"); __dbStats()).
declare global {
  interface Window {
    __dbQuery: typeof query;
    __dbStats: () => Promise<unknown>;
  }
}
window.__dbQuery = query;
window.__dbStats = async () => (await getDb()).worker.getStats();
