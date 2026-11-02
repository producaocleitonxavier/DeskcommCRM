/**
 * Fake SupabaseClient para testes de UNIDADE (sem banco real — exigência do
 * guard `test-db-recusa-sem-vitest`). Um builder encadeável cujo resultado é
 * decidido por um HANDLER por tabela, que inspeciona as operações (`ops`) da
 * cadeia pra devolver `{ data, error, count }`. `.rpc(nome,args)` tem handler à
 * parte (`__rpc`). Registra todas as chamadas em `__calls` pra asserção.
 *
 * NÃO é um ORM — é o mínimo pra exercitar o caminho REAL dos módulos do
 * político (contacts/pol_leads/pol_indicacoes/pol_video_* + fn_alcance...).
 */

export interface FakeResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

export interface Op {
  m: string;
  args: unknown[];
}

export type TabelaHandler = (ops: Op[], terminal: string | null) => FakeResult;
export type RpcHandler = (nome: string, args: unknown) => FakeResult;

export interface FakeHandlers {
  [tabela: string]: TabelaHandler | RpcHandler | undefined;
  __rpc?: RpcHandler;
}

export interface ChamadaRegistrada {
  table?: string;
  ops?: Op[];
  terminal?: string | null;
  rpc?: string;
  args?: unknown;
}

/** Acha a 1ª op com o método `m` (e opcionalmente 1º arg === `arg0`). */
export function acharOp(ops: Op[], m: string, arg0?: unknown): Op | undefined {
  return ops.find((o) => o.m === m && (arg0 === undefined || o.args[0] === arg0));
}

export function temOp(ops: Op[], m: string): boolean {
  return ops.some((o) => o.m === m);
}

export interface FakeDb {
  from: (t: string) => unknown;
  rpc: (nome: string, args?: unknown) => Promise<FakeResult>;
  __calls: ChamadaRegistrada[];
}

export function makeDb(handlers: FakeHandlers): FakeDb {
  const calls: ChamadaRegistrada[] = [];

  function resolver(table: string, ops: Op[], terminal: string | null): FakeResult {
    calls.push({ table, ops: [...ops], terminal });
    const h = handlers[table] as TabelaHandler | undefined;
    if (!h) return { data: null, error: null, count: 0 };
    return h(ops, terminal); // handler pode LANÇAR → simula falha de banco (fail-soft)
  }

  function build(table: string): unknown {
    const ops: Op[] = [];
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop: string | symbol) {
          if (prop === "then") {
            const r = resolver(table, ops, "await");
            return (res: (v: FakeResult) => unknown, rej: (e: unknown) => unknown) =>
              Promise.resolve(r).then(res, rej);
          }
          if (prop === "maybeSingle" || prop === "single") {
            return () => Promise.resolve(resolver(table, ops, prop as string));
          }
          return (...args: unknown[]) => {
            ops.push({ m: String(prop), args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  }

  return {
    __calls: calls,
    from: (t: string) => build(t),
    rpc: (nome: string, args?: unknown) => {
      calls.push({ rpc: nome, args });
      const h = handlers.__rpc;
      return Promise.resolve(h ? h(nome, args) : { data: [] });
    },
  };
}
