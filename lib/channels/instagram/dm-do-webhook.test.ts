import { describe, expect, it } from "vitest";

import { extrairDmsRecebidas } from "./dm-do-webhook";

const CONTA = "17840000000000001";
const entrada = (messaging: unknown[]) => ({ object: "instagram", entry: [{ id: CONTA, time: 1, messaging }] });
const dm = (extra: Record<string, unknown> = {}) => ({
  sender: { id: "999" },
  recipient: { id: CONTA },
  timestamp: 1731400000000,
  message: { mid: "m1", text: "Sou de Belo Horizonte, 31 99999-0000" },
  ...extra,
});

describe("extrairDmsRecebidas — a resposta do seguidor no Direct", () => {
  it("lê a DM de texto com remetente, destinatário, id e horário", () => {
    expect(extrairDmsRecebidas(entrada([dm()]))).toEqual([
      { igAccountId: CONTA, senderId: "999", recipientId: CONTA, messageId: "m1", text: "Sou de Belo Horizonte, 31 99999-0000", attachments: [], timestamp: 1731400000000 },
    ]);
  });

  it("lê DM só com anexo (foto), sem texto", () => {
    const r = extrairDmsRecebidas(entrada([dm({ message: { mid: "m2", attachments: [{ type: "image", payload: { url: "https://x/y.jpg" } }] } })]));
    expect(r).toHaveLength(1);
    expect(r[0]!.text).toBeNull();
    expect(r[0]!.attachments).toEqual([{ type: "image", payload: { url: "https://x/y.jpg" } }]);
  });

  it("ignora o ECO do nosso próprio envio (is_echo)", () => {
    expect(extrairDmsRecebidas(entrada([dm({ message: { mid: "m3", text: "oi", is_echo: true } })]))).toEqual([]);
  });

  it("ignora quando o remetente é a própria conta", () => {
    expect(extrairDmsRecebidas(entrada([dm({ sender: { id: CONTA }, recipient: { id: "999" } })]))).toEqual([]);
  });

  it("ignora evento sem mensagem (leitura, reação) e mensagem vazia", () => {
    expect(extrairDmsRecebidas(entrada([{ sender: { id: "999" }, recipient: { id: CONTA }, timestamp: 1, read: { mid: "m1" } }]))).toEqual([]);
    expect(extrairDmsRecebidas(entrada([dm({ message: { mid: "m4" } })]))).toEqual([]);
  });

  it("payload só de comentário (sem messaging) não vira DM", () => {
    expect(extrairDmsRecebidas({ object: "instagram", entry: [{ id: CONTA, changes: [{ field: "comments", value: { id: "c1", text: "quero" } }] }] })).toEqual([]);
  });

  it("controle negativo: lixo não derruba", () => {
    for (const lixo of [null, undefined, "x", 3, [], {}, { entry: "x" }, { entry: [null, 1, { id: 5, messaging: [dm()] }, { id: CONTA, messaging: "x" }] }]) {
      expect(extrairDmsRecebidas(lixo)).toEqual([]);
    }
  });

  it("várias DMs na mesma entrega saem todas, na ordem", () => {
    const r = extrairDmsRecebidas(entrada([dm(), dm({ sender: { id: "888" }, message: { mid: "m9", text: "oi" } })]));
    expect(r.map((x) => x.messageId)).toEqual(["m1", "m9"]);
  });
});
