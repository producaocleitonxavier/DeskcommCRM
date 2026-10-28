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
import PageTabs from "@/components/politico/page-tabs";

const COMANDO_TABS = [
  { id: "hoje", label: "Hoje", href: "/app/politico" },
  { id: "painel", label: "Painel", href: "/app/politico/dashboard" },
];

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
  /** Obras que pedem ação: paralisadas, com prazo vencido ou sem vistoria há +30d. */
  obras: { id: string; titulo: string; categoria: "paralisada" | "prazo_vencido" | "sem_vistoria"; infoISO: string | null }[];
  resumo: {
    totalDemandas: number;
    resolvidas: number;
    taxaResolucao: number;
    abertas: number;
    resolvidasMes: number;
    tempoMedioDias: number | null;
    nomeParlamentar: string | null;
  };
  /** Funil de atendimento (ciclo de vida das demandas). */
  lifecycle: { label: string; count: number }[];
  /** Demandas por área (pol_tipo), top 6. */
  porArea: { name: string; value: number }[];
  /** Demandas registradas por dia nos últimos 14 dias. */
  registradas14d: { name: string; value: number }[];
}

const TIPO_LABEL: Record<string, string> = {
  servico_publico: "Serviço público",
  infraestrutura: "Infraestrutura",
  saude: "Saúde",
  educacao: "Educação",
  seguranca: "Segurança",
  assistencia_social: "Assistência social",
  meio_ambiente: "Meio ambiente",
  documentacao: "Documentação",
  emprego: "Emprego",
  outro: "Outro",
};

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
  const inicioMes = new Date(agora);
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [demRes, agendaRes, aniRes, cfgRes, obrasRes, vistoriasRes] = await Promise.all([
    db
      .from("demandas")
      .select("id, assunto, estado, pol_prioridade, prazo_em, pol_tipo, aberta_em, fechada_em")
      .eq("organization_id", organizationId)
      .eq("pol_gabinete", true)
      .order("aberta_em", { ascending: false })
      .limit(2000),
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
    db.from("pol_gabinete_config").select("nome_parlamentar").eq("organization_id", organizationId).maybeSingle(),
    // Obras ativas (nem concluídas nem canceladas) para o card de atenção.
    db
      .from("pol_obras")
      .select("id, titulo, status, data_prevista, created_at")
      .eq("organization_id", organizationId)
      .not("status", "in", "(concluida,cancelada)")
      .order("created_at", { ascending: false })
      .limit(500),
    // Datas de vistoria (a mais recente por obra sai do order desc + primeiro visto).
    db
      .from("pol_obra_vistorias")
      .select("obra_id, data")
      .eq("organization_id", organizationId)
      .order("data", { ascending: false })
      .limit(5000),
  ]);

  const demandas = (demRes.data ?? []) as {
    id: string;
    assunto: string | null;
    estado: string;
    pol_prioridade: string | null;
    prazo_em: string | null;
    pol_tipo: string | null;
    aberta_em: string;
    fechada_em: string | null;
  }[];

  // Atenção: abertas atrasadas / vencendo / alta prioridade.
  const ordem: Record<GabineteHoje["atencao"][number]["categoria"], number> = { atrasada: 0, vence: 1, prioridade: 2 };
  const atencao: GabineteHoje["atencao"] = [];
  for (const d of demandas) {
    if (d.estado === "resolvida" || d.estado === "encerrada") continue;
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

  // KPIs + funil de atendimento.
  const totalDemandas = demandas.length;
  const porEstado = (e: string) => demandas.filter((d) => d.estado === e).length;
  const resolvidas = porEstado("resolvida");
  const abertas = demandas.filter((d) => d.estado !== "resolvida" && d.estado !== "encerrada").length;
  const taxaResolucao = totalDemandas > 0 ? Math.round((resolvidas / totalDemandas) * 100) : 0;
  const resolvidasMes = demandas.filter((d) => d.estado === "resolvida" && d.fechada_em && new Date(d.fechada_em) >= inicioMes).length;
  const fechadas = demandas.filter((d) => d.fechada_em);
  const tempoMedioDias =
    fechadas.length > 0
      ? Math.round(
          (fechadas.reduce((s, d) => s + (new Date(d.fechada_em as string).getTime() - new Date(d.aberta_em).getTime()), 0) / fechadas.length / 86_400_000) * 10,
        ) / 10
      : null;
  const lifecycle = [
    { label: "Novas", count: porEstado("aberta") },
    { label: "Em atendimento", count: porEstado("em_atendimento") },
    { label: "Aguardando", count: porEstado("aguardando_cliente") },
    { label: "Resolvidas", count: resolvidas },
  ];

  // Demandas por área (pol_tipo), top 6.
  const areaMap = new Map<string, number>();
  for (const d of demandas) {
    const k = d.pol_tipo ?? "outro";
    areaMap.set(k, (areaMap.get(k) ?? 0) + 1);
  }
  const porArea = [...areaMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => ({ name: TIPO_LABEL[k] ?? k, value: v }));

  // Registradas por dia (últimos 14 dias).
  const registradas14d: { name: string; value: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const ini = new Date(hojeIni);
    ini.setDate(hojeIni.getDate() - i);
    const fim = new Date(ini);
    fim.setDate(ini.getDate() + 1);
    const count = demandas.filter((d) => {
      const t = new Date(d.aberta_em).getTime();
      return t >= ini.getTime() && t < fim.getTime();
    }).length;
    registradas14d.push({ name: `${String(ini.getDate()).padStart(2, "0")}/${String(ini.getMonth() + 1).padStart(2, "0")}`, value: count });
  }

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

  const nomeParlamentar = (cfgRes.data as { nome_parlamentar?: string | null } | null)?.nome_parlamentar ?? null;

  // Obras que pedem ação. Prioridade: paralisada > prazo vencido > sem vistoria +30d.
  const obrasData = (obrasRes.data ?? []) as { id: string; titulo: string; status: string; data_prevista: string | null; created_at: string }[];
  const vistoriaData = (vistoriasRes.data ?? []) as { obra_id: string; data: string }[];
  const ultimaVistoria = new Map<string, string>(); // obra_id → data mais recente (vem ordenado desc)
  for (const v of vistoriaData) {
    if (!ultimaVistoria.has(v.obra_id)) ultimaVistoria.set(v.obra_id, v.data);
  }
  const trintaDiasMs = 30 * 86_400_000;
  const ordemObra: Record<GabineteHoje["obras"][number]["categoria"], number> = { paralisada: 0, prazo_vencido: 1, sem_vistoria: 2 };
  const obras: GabineteHoje["obras"] = [];
  for (const o of obrasData) {
    let categoria: GabineteHoje["obras"][number]["categoria"] | null = null;
    let infoISO: string | null = null;
    if (o.status === "paralisada") {
      categoria = "paralisada";
    } else if (o.data_prevista && new Date(`${o.data_prevista}T23:59:59`) < hojeIni) {
      categoria = "prazo_vencido";
      infoISO = o.data_prevista;
    } else if (o.status === "em_andamento") {
      const ref = ultimaVistoria.get(o.id) ?? o.created_at;
      if (agora.getTime() - new Date(ref).getTime() > trintaDiasMs) {
        categoria = "sem_vistoria";
        infoISO = ultimaVistoria.get(o.id) ?? null;
      }
    }
    if (categoria) obras.push({ id: o.id, titulo: o.titulo, categoria, infoISO });
  }
  obras.sort((a, b) => ordemObra[a.categoria] - ordemObra[b.categoria]);

  return {
    atencao: atencao.slice(0, 8),
    agenda,
    aniversariantes,
    obras: obras.slice(0, 8),
    resumo: { totalDemandas, resolvidas, taxaResolucao, abertas, resolvidasMes, tempoMedioDias, nomeParlamentar },
    lifecycle,
    porArea,
    registradas14d,
  };
}

export interface FilaDeAcao {
  /** Rascunhos da IA esperando o humano aprovar e enviar (modo assistido). */
  rascunhosIA: number;
  /** Disparos em rascunho (criados, ainda não iniciados). */
  disparosRascunho: number;
  /** Leads QUENTES sem contato há 7+ dias — esfriam se ninguém falar com eles. */
  leadsQuentesSemContato: number;
}

/**
 * A FILA DE AÇÃO do dia que faltava no comando: o que ESPERA uma decisão sua
 * agora — respostas da IA pra aprovar (conversation_drafts vivos) e disparos em
 * rascunho. Tudo contagem (head:true), barato.
 */
async function buscarFilaDeAcao(organizationId: string): Promise<FilaDeAcao> {
  const db = await createClient();
  const agora = new Date().toISOString();
  const corte7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [draftsIA, disparos, hotLeads] = await Promise.all([
    db
      .from("conversation_drafts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .is("consumed_at", null)
      .gt("expires_at", agora),
    db
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "draft"),
    // Leads quentes (temperature=quente). Lista enxuta de contact_ids p/ cruzar
    // com a última atividade sem depender da FK dupla pol_leads→contacts.
    db
      .from("pol_leads")
      .select("contact_id")
      .eq("organization_id", organizationId)
      .eq("temperature", "quente")
      .limit(300),
  ]);

  // Quentes sem contato há 7+ dias: entre os quentes, quantos têm last_activity_at
  // antigo (esfriam se ninguém falar). 2 passos robustos, contagens baratas.
  let leadsQuentesSemContato = 0;
  const hotIds = ((hotLeads.data ?? []) as { contact_id: string | null }[])
    .map((r) => r.contact_id)
    .filter((x): x is string => !!x);
  if (hotIds.length) {
    const { count } = await db
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("id", hotIds)
      .lt("last_activity_at", corte7d);
    leadsQuentesSemContato = count ?? 0;
  }

  return {
    rascunhosIA: draftsIA.count ?? 0,
    disparosRascunho: disparos.count ?? 0,
    leadsQuentesSemContato,
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

// O container roda em UTC; sem fixar o fuso, "Bom dia/Boa tarde" e a hora saem
// 3h adiantadas. Horário de Brasília (America/Sao_Paulo) em tudo que é "agora".
const FUSO_BR = "America/Sao_Paulo";

function saudacao(): string {
  const h = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: FUSO_BR, hour: "numeric", hourCycle: "h23" }).format(new Date()),
  );
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function dataFormatada(): string {
  const txt = new Date().toLocaleDateString("pt-BR", {
    timeZone: FUSO_BR,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function horaAgora(): string {
  return new Date().toLocaleTimeString("pt-BR", { timeZone: FUSO_BR, hour: "2-digit", minute: "2-digit" });
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

  const [metrics, gabineteHoje, filaAcao] = await Promise.all([
    buscarMetricas(org.orgId),
    buscarGabineteHoje(org.orgId),
    buscarFilaDeAcao(org.orgId),
  ]);

  return (
    <>
      <PageTabs abas={COMANDO_TABS} active="hoje" maxW="1140px" />
      <HojeClient
        metrics={metrics}
        gabineteHoje={gabineteHoje}
        filaAcao={filaAcao}
        nome={primeiroNome(user.full_name)}
        saudacao={saudacao()}
        dataFormatada={dataFormatada()}
        horaAtualizacao={horaAgora()}
      />
    </>
  );
}
