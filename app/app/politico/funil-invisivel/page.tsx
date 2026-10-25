/**
 * /app/politico/funil-invisivel — PARKEADO (retirado do front em 2026-10-25).
 *
 * O funil comportamental (cliques/respostas/semanas) nasceu sem pipeline que o
 * alimentasse e fora do padrão visual — vazio na prática. O painel (analista
 * político + doutrina + mercado + IA) decidiu RETIRAR do front e guardar o
 * conceito reformulado: um "Termômetro de Base" alimentado por sinais que o
 * sistema JÁ captura (respostas no WhatsApp, presença em eventos, Instagram,
 * follow-ups), sem link — build da fase 2027 (organizar).
 *
 * A tabela `pol_invisible_funnel` e o endpoint `/api/v1/pol-invisible-funnel`
 * seguem dormentes (nada foi apagado). A implementação original desta tela está
 * no histórico do git. Enquanto isso, qualquer acesso cai no Funil Político.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function FunilInvisivelParkeado() {
  redirect("/app/politico/funil");
}
