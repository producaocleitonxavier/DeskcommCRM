/**
 * INSCRIÇÃO da conta do Instagram nos avisos (webhooks) do aplicativo.
 *
 * Configurar o endereço de webhook no painel da Meta NÃO basta: cada conta
 * conectada precisa ser inscrita, com o token DELA, em
 * `POST /me/subscribed_apps?subscribed_fields=…`. Sem isso a Meta não avisa nada
 * daquela conta — o endereço está certo, os campos estão assinados no app, e
 * nenhum comentário ou DM chega. Era o caso desta casa: o OAuth conectava a conta
 * e nunca a inscrevia.
 *
 * Só vale para conexão por Login do Instagram (token de `graph.instagram.com`).
 *
 * Ref: developers.facebook.com/docs/instagram-platform/webhooks (Enable Subscriptions)
 */
import { logger } from "@/lib/logger";

const IG_LOGIN_GRAPH = "https://graph.instagram.com";

/** O que a captação precisa: o comentário (entrada) e a DM (a resposta da pessoa). */
export const CAMPOS_DE_AVISO = ["comments", "messages"] as const;

export interface CredencialParaInscricao {
  token: string;
  graphVersion: string;
}

export type ResultadoInscricao = { ok: true; campos: string[] } | { ok: false; erro: string; httpStatus?: number };

function mensagemDeErro(json: unknown, padrao: string): string {
  if (typeof json === "object" && json !== null && "error" in json) {
    const e = (json as { error?: { message?: unknown } }).error;
    if (e && typeof e.message === "string" && e.message) return e.message;
  }
  return padrao;
}

/** Inscreve a conta nos avisos de comentário e mensagem. Idempotente do lado da Meta. */
export async function inscreverContaNosAvisos(
  creds: CredencialParaInscricao,
  campos: readonly string[] = CAMPOS_DE_AVISO,
): Promise<ResultadoInscricao> {
  const url = `${IG_LOGIN_GRAPH}/${creds.graphVersion}/me/subscribed_apps?subscribed_fields=${encodeURIComponent(campos.join(","))}`;
  try {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${creds.token}` } });
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) {
      const erro = mensagemDeErro(json, res.statusText);
      logger.error("[ig-inscricao] a Meta recusou a inscrição", { status: res.status, error: erro });
      return { ok: false, erro, httpStatus: res.status };
    }
    return { ok: true, campos: [...campos] };
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    logger.error("[ig-inscricao] falha de rede ao inscrever", { error: erro });
    return { ok: false, erro };
  }
}

/** Lê em quais campos a conta está inscrita hoje. Lista vazia = não inscrita. */
export async function lerInscricaoDaConta(creds: CredencialParaInscricao): Promise<ResultadoInscricao> {
  const url = `${IG_LOGIN_GRAPH}/${creds.graphVersion}/me/subscribed_apps`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.token}` } });
    const json = (await res.json().catch(() => ({}))) as unknown;
    if (!res.ok) return { ok: false, erro: mensagemDeErro(json, res.statusText), httpStatus: res.status };
    const data = typeof json === "object" && json !== null && Array.isArray((json as { data?: unknown }).data) ? ((json as { data: unknown[] }).data) : [];
    const campos = new Set<string>();
    for (const app of data) {
      const lista = typeof app === "object" && app !== null ? (app as { subscribed_fields?: unknown }).subscribed_fields : null;
      if (Array.isArray(lista)) for (const c of lista) if (typeof c === "string") campos.add(c);
    }
    return { ok: true, campos: [...campos] };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }
}
