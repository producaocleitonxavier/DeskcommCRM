import { describe, expect, it } from "vitest";

import { lerCanalMultiplicadores } from "./multiplicadores-canal";

/**
 * Número dedicado dos multiplicadores — leitura segura do settings (jsonb
 * compartilhado). Ausente/malformado = null (= automático), nunca lança.
 */
describe("lerCanalMultiplicadores", () => {
  const casos: [string, unknown, string | null][] = [
    ["null", null, null],
    ["undefined", undefined, null],
    ["não-objeto (string)", "oi", null],
    ["não-objeto (número)", 42, null],
    ["objeto vazio", {}, null],
    ["sem a chave multiplicadores", { gabinete: { x: 1 } }, null],
    ["multiplicadores não-objeto", { multiplicadores: "x" }, null],
    ["multiplicadores sem canal", { multiplicadores: { outra: 1 } }, null],
    ["canal null", { multiplicadores: { canal_session_id: null } }, null],
    ["canal vazio", { multiplicadores: { canal_session_id: "" } }, null],
    ["canal só espaços", { multiplicadores: { canal_session_id: "   " } }, null],
    ["canal número (inválido)", { multiplicadores: { canal_session_id: 123 } }, null],
    ["canal setado", { multiplicadores: { canal_session_id: "sess-123" } }, "sess-123"],
    ["preserva outras chaves", { gabinete: { a: 1 }, multiplicadores: { canal_session_id: "sess-9" } }, "sess-9"],
  ];
  it.each(casos)("%s → %s", (_titulo, settings, esperado) => {
    expect(lerCanalMultiplicadores(settings)).toBe(esperado);
  });
});
