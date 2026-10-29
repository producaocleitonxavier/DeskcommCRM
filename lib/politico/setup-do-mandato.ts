/**
 * Setup do Mandato — chaves em `organizations.settings.gabinete` e o leitor do
 * sinal "já configurou?". Sem migration: tudo mora no jsonb de settings.
 *
 * `setupDoMandatoCompleto(settings)` é o que faz o sistema abrir no assistente
 * na PRIMEIRA entrada e, depois de concluído, ir direto para a home. Client-safe
 * (sem supabase/next): a página servidor lê settings e chama isto.
 */
import { CHAVE_GABINETE } from "@/lib/politico/aviso-de-resolucao";

export const CHAVE_SETUP_COMPLETO = "setup_completo";
export const CHAVE_SETUP_ADIADO = "setup_adiado";
export const CHAVE_MANDATO = "mandato";
/** O conhecimento + prompt que a inteligência montou a partir do `mandato`. */
export const CHAVE_MANDATO_GERADO = "mandato_gerado";

export interface ServicoComLink {
  nome: string;
  link: string;
}

export interface MandatoConfig {
  tipo: string | null;
  uf: string | null;
  whats: string | null;
  horario: string | null;
  insta: string | null;
  endereco: string | null;
  email: string | null;
  agendaContato: string | null;
  portal: string | null;
  servicos: ServicoComLink[];
  orgaos: string | null;
  bio: string | null;
  temas: string | null;
}

export function setupDoMandatoCompleto(settings: unknown): boolean {
  const s = (settings ?? {}) as Record<string, unknown>;
  const gab = (s[CHAVE_GABINETE] ?? {}) as Record<string, unknown>;
  return gab[CHAVE_SETUP_COMPLETO] === true;
}

/** O admin pediu para fazer depois — não força nem fica repetindo (anti-loop). */
export function setupDoMandatoAdiado(settings: unknown): boolean {
  const s = (settings ?? {}) as Record<string, unknown>;
  const gab = (s[CHAVE_GABINETE] ?? {}) as Record<string, unknown>;
  return gab[CHAVE_SETUP_ADIADO] === true;
}

/** A home deve abrir no assistente? Só na primeira vez: nem concluído, nem adiado. */
export function deveAbrirSetup(settings: unknown): boolean {
  return !setupDoMandatoCompleto(settings) && !setupDoMandatoAdiado(settings);
}

export function lerMandatoConfig(settings: unknown): MandatoConfig | null {
  const s = (settings ?? {}) as Record<string, unknown>;
  const gab = (s[CHAVE_GABINETE] ?? {}) as Record<string, unknown>;
  const m = gab[CHAVE_MANDATO];
  return (m ?? null) as MandatoConfig | null;
}
