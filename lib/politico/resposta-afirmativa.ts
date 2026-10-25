/**
 * "A pessoa disse SIM?" — para liberar a entrega automática do material.
 *
 * ═══ Por que um detector próprio, e não o `ehConfirmacao` ═══
 *
 * O `ehConfirmacao` do follow-up (`node-handlers.ts`) casa a PALAVRA SOZINHA
 * ("sim", "ok", "pode") — a mensagem inteira tem de ser a palavra. Mas quem
 * responde a "posso te mandar o ebook?" escreve do jeito real: "claro, manda
 * aí", "pode mandar sim", "quero muito", "manda pra mim". Este detector lê a
 * INTENÇÃO afirmativa DENTRO da frase, com as formas que o cliente listou.
 *
 * ═══ A régua do risco (diferente do opt-out) ═══
 *
 * Aqui o erro barato é o OPOSTO do opt-out. Um falso positivo entrega um PDF que
 * a pessoa pediu no cadastro — dano ~zero. Um falso negativo só adia: cai no
 * atendimento humano. Por isso este é PERMISSIVO no afirmativo, com um único
 * freio duro: se houver negação clara ("não quero", "não pode", "para"), NÃO
 * entrega. Opt-out de verdade é outro caminho (`lib/opt-out/deteccao.ts`), que
 * roda antes e bloqueia o contato.
 */
import { normalizarTexto } from "@/lib/opt-out/deteccao";

/** Negações que vetam a entrega mesmo com palavra afirmativa na frase. */
const NEGACAO = [
  /\bnao\s+(quero|preciso|pode|precisa|manda|mande|envia|envie|desejo|vou|obrigad\w*)\b/u,
  /\bnao,?\s+obrigad\w*\b/u,
  /\bja\s+(tenho|recebi|baixei)\b/u,
  /\bnunca\b/u,
  /\bpar[ae]\s+de\b/u,
  /\bdeixa\s+(pra|pro)\b/u,
];

/** Formas afirmativas, da palavra solta às frases do dia a dia. */
const AFIRMATIVO = [
  // palavra/abertura clássica
  /\b(sim|claro|quero|aceito|aceita|aceitar|positivo|isso|bora|vamos|ok|okay|okok|opa|show|otim[oa]|perfeito|blz|beleza|fechou|uhum|aham|dale|demais)\b/u,
  // "pode" em qualquer forma (pode, pode sim, pode mandar, pode enviar)
  /\bpode\b/u,
  // "manda / envia / me manda / manda aí / manda pra mim / manda aqui"
  /\b(me\s+)?(manda|mande|mandar|envia|envie|enviar)\b/u,
  // "quero receber / quero o ebook / quero sim / quero muito"
  /\bquero\b/u,
  // "com certeza", "certeza que sim"
  /\bcerteza\b/u,
  // "pode crer", "com certeza"
  /\bpode\s+crer\b/u,
  // emoji de positivo
  /[\u{1F44D}\u{1F197}✅]/u, // 👍 🆗 ✅
];

/**
 * A resposta é um SIM para receber o material?
 *
 * Normaliza (minúsculas, sem acento), veta se houver negação clara, e aceita se
 * bater qualquer forma afirmativa. Texto vazio = não.
 */
export function ehRespostaAfirmativa(texto: string | null | undefined): boolean {
  if (!texto) return false;
  const t = normalizarTexto(texto.trim());
  if (t === "") return false;
  if (NEGACAO.some((re) => re.test(t))) return false;
  return AFIRMATIVO.some((re) => re.test(texto) || re.test(t));
}
