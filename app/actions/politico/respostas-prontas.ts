"use server";

/**
 * "Usar as respostas sugeridas" — cria de uma vez o conjunto inicial de respostas
 * prontas do gabinete (compartilhadas com a equipe), a partir da Identidade do
 * Mandato. Não duplica: resposta com o mesmo título já cadastrada é pulada, então
 * clicar de novo só acrescenta o que faltar. Só gestor (resposta compartilhada).
 * Organização sempre da sessão.
 */
import { resolveActiveOrg } from "@/lib/auth/server";
import { autenticarComPapel } from "@/lib/politico/acesso";
import { respostasSugeridas } from "@/lib/politico/respostas-sugeridas";
import { createClient } from "@/lib/supabase/server";

export type ResultadoSugeridas = { ok: true; criadas: number; jaExistiam: number } | { ok: false; erro: string };

export async function criarRespostasSugeridas(): Promise<ResultadoSugeridas> {
  const user = await autenticarComPapel("manager");
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  const db = await createClient();

  const { data: cfg } = await db
    .from("pol_gabinete_config")
    .select("nome_parlamentar, cargo")
    .eq("organization_id", org.orgId)
    .maybeSingle();

  const sugeridas = respostasSugeridas({
    nomeParlamentar: (cfg?.nome_parlamentar as string | null) ?? null,
    cargo: (cfg?.cargo as string | null) ?? null,
  });

  const { data: atuais, error: eLer } = await db
    .from("message_templates")
    .select("title, shortcut")
    .eq("organization_id", org.orgId)
    .limit(500);
  if (eLer) return { ok: false, erro: "Não consegui ler as respostas que já existem." };
  const titulos = new Set(((atuais ?? []) as { title: string | null }[]).map((t) => (t.title ?? "").trim().toLowerCase()));
  const atalhos = new Set(((atuais ?? []) as { shortcut: string | null }[]).map((t) => (t.shortcut ?? "").trim().toLowerCase()).filter(Boolean));

  const novas = sugeridas.filter((s) => !titulos.has(s.titulo.toLowerCase()));
  if (novas.length === 0) return { ok: true, criadas: 0, jaExistiam: sugeridas.length };

  const { error: eIns } = await db.from("message_templates").insert(
    novas.map((s) => ({
      organization_id: org.orgId,
      owner_user_id: null, // compartilhada com a equipe
      title: s.titulo,
      body: s.texto,
      // Atalho já usado por outra resposta do gabinete não é reaproveitado.
      shortcut: atalhos.has(s.atalho) ? null : s.atalho,
      created_by_user_id: user.id,
    })),
  );
  if (eIns) return { ok: false, erro: "Não consegui criar as respostas sugeridas. Tente de novo." };
  return { ok: true, criadas: novas.length, jaExistiam: sugeridas.length - novas.length };
}
