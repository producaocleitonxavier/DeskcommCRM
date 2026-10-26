/**
 * Montagem do link wa.me e do código da origem de QR.
 *
 * O link abre o WhatsApp do candidato com a mensagem PRONTA + o marcador
 * `[qr:CODE]` no fim — a pessoa só aperta enviar, e o inbound é reconhecido por
 * `lib/politico/qr-cadastro.ts`.
 */

/** Só os dígitos do número (wa.me não aceita +, espaços nem parênteses). */
function soDigitos(numero: string): string {
  return numero.replace(/\D+/g, "");
}

/** O texto completo que a pessoa envia: a mensagem + o marcador da origem. */
export function textoDoEnvio(mensagem: string, codigo: string): string {
  const base = mensagem.trim();
  return `${base} [qr:${codigo.toUpperCase()}]`;
}

/** `https://wa.me/<numero>?text=<mensagem + [qr:CODE]>`. */
export function montarLinkWaMe(numero: string, mensagem: string, codigo: string): string {
  const texto = encodeURIComponent(textoDoEnvio(mensagem, codigo));
  return `https://wa.me/${soDigitos(numero)}?text=${texto}`;
}

/**
 * Sugere um código legível a partir do nome ("Praça 7 de Setembro" → "PRACA7DE").
 * Maiúsculo, sem acento, só A-Z0-9, até 12 chars. Garante unicidade contra os
 * códigos já usados, anexando um sufixo numérico.
 */
export function sugerirCodigo(nome: string, existentes: string[]): string {
  const base =
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 12) || "QR";
  const usados = new Set(existentes.map((c) => c.toUpperCase()));
  if (!usados.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const cand = `${base.slice(0, 10)}${i}`;
    if (!usados.has(cand)) return cand;
  }
  return `${base.slice(0, 8)}${Date.now().toString(36).toUpperCase().slice(-4)}`;
}
