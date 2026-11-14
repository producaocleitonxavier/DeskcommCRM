import { describe, expect, it } from "vitest";

import { dentroDoBlackout, turnosDoAno } from "./blackout";

describe("turnosDoAno — regra da Constituição", () => {
  it("bate com as eleições que já aconteceram", () => {
    expect(turnosDoAno(2018)).toEqual(["2018-10-07", "2018-10-28"]);
    expect(turnosDoAno(2022)).toEqual(["2022-10-02", "2022-10-30"]);
    expect(turnosDoAno(2024)).toEqual(["2024-10-06", "2024-10-27"]);
    expect(turnosDoAno(2026)).toEqual(["2026-10-04", "2026-10-25"]);
  });

  it("calcula as próximas", () => {
    expect(turnosDoAno(2028)).toEqual(["2028-10-01", "2028-10-29"]);
    expect(turnosDoAno(2030)).toEqual(["2030-10-06", "2030-10-27"]);
  });

  it("ano ímpar não tem eleição", () => {
    expect(turnosDoAno(2027)).toEqual([]);
  });

  it("calendário excepcional substitui a regra naquele ano (2020)", () => {
    const exc = { 2020: ["2020-11-15", "2020-11-29"] };
    expect(turnosDoAno(2020, exc)).toEqual(["2020-11-15", "2020-11-29"]);
    expect(turnosDoAno(2022, exc)).toEqual(["2022-10-02", "2022-10-30"]);
  });
});

describe("dentroDoBlackout — véspera até o fim do dia seguinte, horário de Brasília", () => {
  const br = (s: string) => new Date(`${s}-03:00`);

  it("1º turno de 2028 (domingo, 1º/out): sábado, domingo e segunda em silêncio", () => {
    expect(dentroDoBlackout(br("2028-09-29T23:59:59"))).toBe(false); // sexta à noite
    expect(dentroDoBlackout(br("2028-09-30T00:00:00"))).toBe(true); // sábado, primeira hora
    expect(dentroDoBlackout(br("2028-10-01T12:00:00"))).toBe(true); // dia da eleição
    expect(dentroDoBlackout(br("2028-10-02T23:59:59"))).toBe(true); // segunda à noite
    expect(dentroDoBlackout(br("2028-10-03T00:00:00"))).toBe(false); // terça
  });

  it("2º turno de 2028 (29/out) também silencia", () => {
    expect(dentroDoBlackout(br("2028-10-28T08:00:00"))).toBe(true);
    expect(dentroDoBlackout(br("2028-10-29T20:00:00"))).toBe(true);
    expect(dentroDoBlackout(br("2028-10-31T09:00:00"))).toBe(false);
  });

  it("fora de outubro de ano par, e em ano ímpar, não bloqueia", () => {
    expect(dentroDoBlackout(br("2026-11-14T10:00:00"))).toBe(false);
    expect(dentroDoBlackout(br("2027-10-03T10:00:00"))).toBe(false);
    expect(dentroDoBlackout(br("2028-10-15T10:00:00"))).toBe(false);
  });

  it("lista passada à mão continua valendo (uso em teste)", () => {
    expect(dentroDoBlackout(br("2027-05-10T10:00:00"), ["2027-05-10"])).toBe(true);
    expect(dentroDoBlackout(br("2028-10-01T12:00:00"), [])).toBe(false);
  });

  it("data inválida não derruba nem bloqueia", () => {
    expect(dentroDoBlackout(new Date("x"))).toBe(false);
    expect(dentroDoBlackout(br("2027-05-10T10:00:00"), ["lixo"])).toBe(false);
  });
});
