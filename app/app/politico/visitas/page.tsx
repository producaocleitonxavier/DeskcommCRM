/**
 * /app/politico/visitas — Visitas Técnicas (Gabinete).
 *
 * Painel próprio da rotina de visita do mandato ao território: números no topo,
 * lista filtrável e ação rápida. A visita NASCE na demanda (marca-se a DATA no
 * cadastro/Editar); aqui é a visão geral + o assessor marca a PRÓPRIA presença e
 * registra o RELATO de campo, que todo o gabinete vê. Acesso manager+.
 *
 * Fonte: demandas do gabinete com DATA de visita (prazo_em). Fail-soft: sem as
 * colunas de visita (migration 9085) o módulo mostra só o que der; sem as de
 * relato (9087) não exibe o relato. Server-side (RLS pela org ativa).
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";
import { lerMandatoConfig } from "@/lib/politico/setup-do-mandato";
import { visitaPendente, visitaAgendada, visitaSemResponsavel } from "@/lib/politico/visita-tecnica";
import { listarAnexosDemanda } from "@/app/actions/politico/gabinete-actions";
import VisitasClient, { type VisitaItem, type FotoVisita } from "./_visitas-client";

export const dynamic = "force-dynamic";

async function colunaExiste(db: Awaited<ReturnType<typeof createClient>>, org: string, col: string): Promise<boolean> {
  const { error } = await db.from("demandas").select(col).eq("organization_id", org).limit(1);
  return !error;
}

export default async function VisitasPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  // Visita é trabalho de RUA: o assessor (agent) vê a lista e marca presença
  // (Incremento 3). Antes exigia manager+, o que contrariava o menu do assessor
  // de rua (incremento 1, que já tem Visitas). viewer segue barrado.
  if (ROLE_RANK[org.role] < ROLE_RANK.agent) redirect("/app/politico");

  const db = await createClient();

  const [temVisita, temRelato, temRelatoPor, temAuto] = await Promise.all([
    colunaExiste(db, org.orgId, "pol_visita_realizada_em"),
    colunaExiste(db, org.orgId, "pol_visita_relato"),
    colunaExiste(db, org.orgId, "pol_visita_relato_por_id"),
    colunaExiste(db, org.orgId, "pol_autoatendimento"),
  ]);

  const colunas =
    "id, assunto, pol_orgao_destino, pol_municipio, prazo_em, estado, pol_prazo_dias" +
    (temVisita ? ", pol_visita_realizada_em, pol_visita_responsavel_id, pol_visita_responsavel_nome" : "") +
    (temRelato ? ", pol_visita_relato, pol_visita_presentes, pol_visita_decisoes" : "") +
    (temRelatoPor ? ", pol_visita_relato_por_id, pol_visita_relato_por_nome" : "");

  let q = db
    .from("demandas")
    .select(colunas)
    .eq("organization_id", org.orgId)
    .eq("pol_gabinete", true)
    .not("prazo_em", "is", null)
    .order("prazo_em", { ascending: true })
    .limit(2000);
  if (temAuto) q = q.eq("pol_autoatendimento", false);
  const { data } = await q;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  const visitas: VisitaItem[] = rows.map((r) => ({
    id: String(r.id),
    assunto: (r.assunto as string | null) ?? null,
    orgao: (r.pol_orgao_destino as string | null) ?? null,
    municipio: (r.pol_municipio as string | null) ?? null,
    visitaEm: (r.prazo_em as string | null) ?? null,
    estado: String(r.estado ?? ""),
    realizadaEm: (r.pol_visita_realizada_em as string | null) ?? null,
    responsavelId: (r.pol_visita_responsavel_id as string | null) ?? null,
    responsavelNome: (r.pol_visita_responsavel_nome as string | null) ?? null,
    relato: (r.pol_visita_relato as string | null) ?? null,
    presentes: (r.pol_visita_presentes as string | null) ?? null,
    decisoes: (r.pol_visita_decisoes as string | null) ?? null,
    relatoPorId: (r.pol_visita_relato_por_id as string | null) ?? null,
    relatoPorNome: (r.pol_visita_relato_por_nome as string | null) ?? null,
  }));

  // Fotos (anexos de IMAGEM) das visitas REALIZADAS — "mostrar o serviço". Só as
  // realizadas, para não disparar N URLs assinadas à toa. Fail-soft por item.
  const fotosEntries = await Promise.all(
    visitas
      .filter((v) => v.realizadaEm)
      .map(async (v): Promise<[string, FotoVisita[]]> => {
        try {
          const anexos = await listarAnexosDemanda(v.id);
          const imgs = anexos
            .filter((a) => /^image\//i.test(a.media_mime) && a.url)
            .map((a) => ({ url: a.url as string, nome: a.nome_arquivo }));
          return [v.id, imgs];
        } catch {
          return [v.id, []];
        }
      }),
  );
  const fotos: Record<string, FotoVisita[]> = Object.fromEntries(fotosEntries.filter(([, imgs]) => imgs.length > 0));

  // KPIs sobre TODAS as visitas (server-side).
  const kpis = {
    agendadas: visitas.filter((v) => visitaAgendada({ visitaEm: v.visitaEm, realizadaEm: v.realizadaEm, estado: v.estado })).length,
    atrasadas: visitas.filter((v) => visitaPendente({ visitaEm: v.visitaEm, realizadaEm: v.realizadaEm, estado: v.estado })).length,
    semResponsavel: visitas.filter((v) =>
      visitaSemResponsavel({ visitaEm: v.visitaEm, realizadaEm: v.realizadaEm, estado: v.estado, responsavelId: v.responsavelId }),
    ).length,
    realizadas: visitas.filter((v) => !!v.realizadaEm).length,
  };

  // Assessores cadastrados (membros ativos) — para delegar a visita.
  const membrosRes = await db.from("user_organizations").select("user_id, role").eq("organization_id", org.orgId).is("revoked_at", null);
  const membros = (membrosRes.data ?? []) as { user_id: string; role: string }[];
  const nomes = await nomesDosAtendentes(membros.map((m) => m.user_id));
  const assessores = membros
    .map((m) => ({ id: m.user_id, nome: nomes.get(m.user_id) ?? `${m.user_id.slice(0, 8)} · ${m.role}` }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  // Tipo de mandato (para a escolha rápida de órgãos na ficha de nova visita).
  const { data: orgRow } = await db.from("organizations").select("settings").eq("id", org.orgId).maybeSingle();
  const tipoMandato = lerMandatoConfig((orgRow as { settings?: unknown } | null)?.settings)?.tipo ?? null;

  // Presenças de equipe (quem vai) por visita — Incremento 3. Fail-soft: se a
  // tabela pol_tarefa_presencas ainda não existe (SQL não aplicado), vem vazio.
  const presencas: Record<string, { user_id: string; nome: string | null }[]> = {};
  const idsVisita = visitas.map((v) => v.id);
  if (idsVisita.length > 0) {
    const { data: pres } = await db
      .from("pol_tarefa_presencas")
      .select("tarefa_id, user_id, nome")
      .eq("organization_id", org.orgId)
      .eq("tarefa_kind", "visita")
      .in("tarefa_id", idsVisita);
    for (const p of (pres ?? []) as { tarefa_id: string; user_id: string; nome: string | null }[]) {
      (presencas[p.tarefa_id] ??= []).push({ user_id: p.user_id, nome: p.nome });
    }
  }

  return (
    <VisitasClient
      visitas={visitas}
      kpis={kpis}
      assessores={assessores}
      usuarioAtualId={user.id}
      temRelato={temRelato}
      fotos={fotos}
      tipoMandato={tipoMandato}
      presencas={presencas}
    />
  );
}
