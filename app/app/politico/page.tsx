/**
 * /app/politico — Tela "Hoje" do War Room 2.0
 *
 * Server component: auth + fetch (buscarMetricas). O corpo visual com gráficos
 * (Recharts) vive em ./_hoje-client (client component), porque os componentes de
 * components/politico/ recebem ícones LucideIcon como prop — funções não podem
 * cruzar a fronteira server→client.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import HojeClient from "./_hoje-client";

export const dynamic = "force-dynamic";

// -- Tipos -------------------------------------------------------------------

export interface MetricasHoje {
  totalPessoas: number;
  ativadasSemana: number;
  apoiadoresOuMais: number;
  demandasGabinete: number;
  demandasUrgentes: number;
  alertasAtivos: number;
  funilStages: { label: string; count: number; pct: number; cor: string }[];
  /** Contagem por temperatura (pol_leads.temperature). */
  temperaturas: { quentes: number; mornos: number; frios: number };
  /** Transições no funil por dia nos últimos 7 dias. */
  ativacoesPorDia: { name: string; value: number }[];
}

export interface GabineteHoje {
  atencao: {
    id: string;
    assunto: string;
    prioridade: string | null;
    prazoISO: string | null;
    categoria: "atrasada" | "vence" | "prioridade";
  }[];
  agenda: { id: string; titulo: string; dataISO: string; diaInteiro: boolean; local: string | null }[];
  aniversariantes: { id: string; nome: string; cidade: string | null }[];
  resumo: { totalDemandas: number; resolvidas: number; taxaResolucao: number; nomeParlamentar: string | null };
}

async function buscarGabineteHoje(organizationId: string): Promise<GabineteHoje> {
  const db = await createClient();
  const agora = new Date();
  const hojeIni = new Date(agora);
  hojeIni.setHours(0, 0, 0, 0);
  const hojeFim = new Date(hojeIni);
  hojeFim.setDate(hojeIni.getDate() + 1);
  const em3dias = new Date(hojeIni);
  em3dias.setDate(hojeIni.getDate() + 3);
  em3dias.setHours(23, 59, 59, 999);

  const [abertasRes, agendaRes, aniRes, totalGabRes, resolvidasGabRes, cfgRes] = await Promise.all([
    db
      .from("demandas")
      .select("id, assunto, estado, pol_prioridade, prazo_em")
      .eq("organization_id", organizationId)
      .eq("pol_gabinete", true)
      .not("estado", "in", "(resolvida,encerrada)")
      .order("prazo_em", { ascending: true, nullsFirst: false })
      .limit(60),
    db
      .from("pol_agenda")
      .select("id, titulo, data_inicio, dia_inteiro, local, status")
      .eq("organization_id", organizationId)
      .gte("data_inicio", hojeIni.toISOString())
      .lt("data_inicio", hojeFim.toISOString())
      .neq("status", "cancelado")
      .order("data_inicio", { ascending: true })
      .limit(12),
    db
      .from("pol_liderancas")
      .select("id, nome, cidade, aniversario")
      .eq("organization_id", organizationId)
      .not("aniversario", "is", null)
      .limit(1000),
    db.from("demandas").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("pol_gabinete", true),
    db.from("demandas").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("pol_gabinete", true).eq("estado", "resolvida"),
    db.from("pol_gabinete_config").select("nome_parlamentar").eq("organization_id", organizationId).maybeSingle(),
  ]);

  const abertas = (abertasRes.data ?? []) as {
    id: string;
    assunto: string | null;
    pol_prioridade: string | null;
    prazo_em: string | null;
  }[];
  const ordem: Record<GabineteHoje["atencao"][number]["categoria"], number> = { atrasada: 0, vence: 1, prioridade: 2 };
  const atencao: GabineteHoje["atencao"] = [];
  for (const d of abertas) {
    let categoria: "atrasada" | "vence" | "prioridade" | null = null;
    if (d.prazo_em) {
      const p = new Date(d.prazo_em);
      if (p < hojeIni) categoria = "atrasada";
      else if (p <= em3dias) categoria = "vence";
    }
    if (!categoria && (d.pol_prioridade === "urgente" || d.pol_prioridade === "alta")) categoria = "prioridade";
    if (categoria) atencao.push({ id: d.id, assunto: d.assunto ?? "Sem assunto", prioridade: d.pol_prioridade, prazoISO: d.prazo_em, categoria });
  }
  atencao.sort((a, b) => ordem[a.categoria] - ordem[b.categoria]);

  const agenda = ((agendaRes.data ?? []) as { id: string; titulo: string; data_inicio: string; dia_inteiro: boolean; local: string | null }[]).map((a) => ({
    id: a.id,
    titulo: a.titulo,
    dataISO: a.data_inicio,
    diaInteiro: a.dia_inteiro,
    local: a.local,
  }));

  const hojeM = agora.getMonth();
  const hojeD = agora.getDate();
  const aniversariantes = ((aniRes.data ?? []) as { id: string; nome: string; cidade: string | null; aniversario: string }[])
    .filter((l) => {
      const a = new Date(`${l.aniversario}T12:00:00`);
      return a.getMonth() === hojeM && a.getDate() === hojeD;
    })
    .map((l) => ({ id: l.id, nome: l.nome, cidade: l.cidade }))
    .slice(0, 12);

  const totalDemandas = totalGabRes.count ?? 0;
  const resolvidas = resolvidasGabRes.count ?? 0;
  const taxaResolucao = totalDemandas > 0 ? Math.round((resolvidas / totalDemandas) * 100) : 0;
  const nomeParlamentar = (cfgRes.data as { nome_parlamentar?: string | null } | null)?.nome_parlamentar ?? null;

  return {
    atencao: atencao.slice(0, 8),
    agenda,
    aniversariantes,
    resumo: { totalDemandas, resolvidas, taxaResolucao, nomeParlamentar },
  };
}

// -- Data fetching -----------------------------------------------------------

async function buscarMetricas(organizationId: string): Promise<MetricasHoje> {
  const db = await createClient();
  const agora = new Date();
  const inicioSemana = new Date(agora);
  inicioSemana.setDate(agora.getDate() - agora.getDay());
  inicioSemana.setHours(0, 0, 0, 0);

  const sextaFeira = new Date(agora);
  sextaFeira.setDate(agora.getDate() + (5 - agora.getDay()));
  sextaFeira.setHours(23, 59, 59, 999);

  // Janela dos últimos 7 dias (hoje inclusive) para a série de ativações.
  const seteDiasAtras = new Date(agora);
  seteDiasAtras.setDate(agora.getDate() - 6);
  seteDiasAtras.setHours(0, 0, 0, 0);

  const [
    totalPessoas,
    ativadasSemana,
    apoiadoresOuMais,
    demandasGabinete,
    demandasUrgentes,
    alertasAtivos,
    novoContato,
    simpatizante,
    apoiador,
    multiplicador,
    votoCerto,
    quentes,
    mornos,
    frios,
    transicoes7d,
  ] = await Promise.all([
    db
      .from("pol_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    db
      .from("pol_funnel_transitions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", inicioSemana.toISOString()),
    db
      .from("pol_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("support_level", ["apoiador", "militante", "voto_certo"]),
    // Demandas DO GABINETE (tabela `demandas`, pol_gabinete), não a antiga pol_demands.
    db
      .from("demandas")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("pol_gabinete", true)
      .not("estado", "in", "(resolvida,encerrada)"),
    db
      .from("demandas")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("pol_gabinete", true)
      .not("estado", "in", "(resolvida,encerrada)")
      .not("prazo_em", "is", null)
      .lte("prazo_em", sextaFeira.toISOString()),
    db
      .from("pol_alerts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    // Funil stages — support_level alinhado ao enum real (pol-leads API):
    // novo_cadastro, simpatizante, apoiador, militante, voto_certo.
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("support_level", "novo_cadastro"),
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("support_level", "simpatizante"),
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("support_level", "apoiador"),
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("support_level", "militante"),
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("support_level", "voto_certo"),
    // Temperatura (pol_leads.temperature): frio | morno | quente.
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("temperature", "quente"),
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("temperature", "morno"),
    db.from("pol_leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("temperature", "frio"),
    // Transições dos últimos 7 dias, agrupadas por dia no servidor.
    db.from("pol_funnel_transitions").select("created_at").eq("organization_id", organizationId).gte("created_at", seteDiasAtras.toISOString()),
  ]);

  const total = totalPessoas.count ?? 0;
  const stages = [
    { label: "Novo contato", count: novoContato.count ?? 0, cor: "var(--wr-funnel-1)" },
    { label: "Simpatizante", count: simpatizante.count ?? 0, cor: "var(--wr-funnel-2)" },
    { label: "Apoiador", count: apoiador.count ?? 0, cor: "var(--wr-funnel-3)" },
    { label: "Multiplicador", count: multiplicador.count ?? 0, cor: "var(--wr-funnel-4)" },
    { label: "Voto certo", count: votoCerto.count ?? 0, cor: "var(--wr-funnel-5)" },
  ].map((s) => ({ ...s, pct: total > 0 ? Math.max((s.count / total) * 100, 1.2) : 0 }));

  // Buckets dos últimos 7 dias (por data local), rótulo = dia da semana curto.
  const linhas = (transicoes7d.data ?? []) as { created_at: string }[];
  const ativacoesPorDia: { name: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const ini = new Date(agora);
    ini.setDate(agora.getDate() - i);
    ini.setHours(0, 0, 0, 0);
    const fim = new Date(ini);
    fim.setDate(ini.getDate() + 1);
    const count = linhas.filter((l) => {
      const t = new Date(l.created_at).getTime();
      return t >= ini.getTime() && t < fim.getTime();
    }).length;
    const rotulo = ini.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    ativacoesPorDia.push({ name: rotulo, value: count });
  }

  return {
    totalPessoas: total,
    ativadasSemana: ativadasSemana.count ?? 0,
    apoiadoresOuMais: apoiadoresOuMais.count ?? 0,
    demandasGabinete: demandasGabinete.count ?? 0,
    demandasUrgentes: demandasUrgentes.count ?? 0,
    alertasAtivos: alertasAtivos.count ?? 0,
    funilStages: stages,
    temperaturas: {
      quentes: quentes.count ?? 0,
      mornos: mornos.count ?? 0,
      frios: frios.count ?? 0,
    },
    ativacoesPorDia,
  };
}

// -- Helpers -----------------------------------------------------------------

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function dataFormatada(): string {
  const txt = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function horaAgora(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function primeiroNome(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome.split(" ")[0] ?? nome;
}

// -- Componente (server) -----------------------------------------------------

export default async function HojePage() {
  const user = await requireAuth();

  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const [metrics, gabineteHoje] = await Promise.all([buscarMetricas(org.orgId), buscarGabineteHoje(org.orgId)]);

  return (
    <HojeClient
      metrics={metrics}
      gabineteHoje={gabineteHoje}
      nome={primeiroNome(user.full_name)}
      saudacao={saudacao()}
      dataFormatada={dataFormatada()}
      horaAtualizacao={horaAgora()}
    />
  );
}
