"use client";
/**
 * O disparo por dentro (War Room 2.0, redesign premium + didático).
 *
 * A regra do cliente: o que foi fácil na criação tem de continuar fácil aqui.
 * Então: cabeçalho que GUIA o próximo passo (não um monte de botão solto),
 * KPIs, progresso visual, a mensagem com prévia, e o ritmo em VELOCIDADE
 * (Calmo/Normal/Rápido) — o número cru fica no Avançado. As ações que cabem no
 * estado são as mesmas da máquina de estados do servidor (que é quem recusa de
 * verdade); aqui só não se oferece o impossível.
 */
import Link from "next/link";
import { useMemo, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcaoDeCampanha,
  useCampanha,
  useDestinatarios,
  useEditarCampanha,
  useMetricasDaCampanha,
  type AcaoDeCampanha,
  type CampanhaDetalhada,
  type Destinatario,
} from "@/hooks/campanhas/useCampanhas";
import { useAgentesPublicados, useFunis } from "@/hooks/campanhas/useDestinoDaCampanha";
import { useContactList } from "@/hooks/contacts/useContactList";
import { useT } from "@/hooks/i18n/useT";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { TEXTO_DA_EXCLUSAO } from "@/lib/campanhas/tipos";
import {
  Users,
  Send,
  CheckCircle2,
  MessageCircle,
  ChevronDown,
  Gauge,
  FlaskConical,
  Play,
  Pause,
  X,
  Copy,
  Pencil,
} from "lucide-react";

const VELOCIDADES = [
  { id: "calmo", label: "Calmo", emoji: "🐢", desc: "Protege o número. Ideal para a base fria.", intervalo: 90, teto: 40 },
  { id: "normal", label: "Normal", emoji: "🚶", desc: "Equilíbrio entre rapidez e segurança.", intervalo: 45, teto: 150 },
  { id: "rapido", label: "Rápido", emoji: "🏃", desc: "Número aquecido ou quem já respondeu.", intervalo: 20, teto: 400 },
] as const;

export function DetalheDaCampanha({ id }: { id: string }) {
  const t = useT();
  const campanha = useCampanha(id);
  const metricas = useMetricasDaCampanha(id, campanha.data?.status);
  const [vista, setVista] = useState<"lista" | "kanban">("lista");
  const [filtroDeStatus, setFiltroDeStatus] = useState("");
  // No kanban carrega TODOS os status (sem filtro), para montar as colunas.
  const destinatarios = useDestinatarios(id, {
    status: vista === "lista" && filtroDeStatus ? filtroDeStatus : undefined,
  });
  const acao = useAcaoDeCampanha(id);
  const [confirmando, setConfirmando] = useState<AcaoDeCampanha | null>(null);
  const [testando, setTestando] = useState(false);

  if (campanha.isLoading) {
    return (
      <div className="mx-auto max-w-[1040px] space-y-3 px-4 py-7">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (campanha.isError || !campanha.data) {
    return (
      <div className="mx-auto max-w-[1040px] px-4 py-7">
        <div className="wr-card p-6 text-center">
          <p className="text-sm" style={{ color: "#F87171" }}>{t("Não foi possível carregar o disparo.")}</p>
          <button className="wr-btn mt-3" onClick={() => campanha.refetch()}>{t("Tentar novamente")}</button>
        </div>
      </div>
    );
  }

  const c = campanha.data;
  const m = metricas.data;
  const linhas = destinatarios.data?.pages.flatMap((p) => p.data) ?? [];

  const disponiveis: AcaoDeCampanha[] = [];
  if (c.status === "draft") disponiveis.push("preparar", "cancelar");
  if (c.status === "ready") disponiveis.push("testar", "iniciar", "cancelar");
  if (c.status === "running") disponiveis.push("pausar", "cancelar");
  if (c.status === "scheduled") disponiveis.push("pausar", "cancelar");
  if (c.status === "paused") disponiveis.push("retomar", "cancelar");
  disponiveis.push("duplicar");

  const principal: AcaoDeCampanha | null =
    c.status === "draft" ? "preparar" : c.status === "ready" ? "iniciar" : c.status === "paused" ? "retomar" : null;
  const secundarias = disponiveis.filter((a) => a !== principal);

  function dispara(a: AcaoDeCampanha) {
    if (a === "iniciar" || a === "cancelar") setConfirmando(a);
    else if (a === "testar") setTestando(true);
    else acao.mutate({ acao: a });
  }

  const guia = proximoPasso(c.status, c.snapshot_eligible, c.failure_code);
  const pill = statusPill(c.status);

  return (
    <div className="mx-auto max-w-[1040px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <Link href="/app/campaigns" className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--color-text-subtle)" }}>
        ← {t("Disparos")}
      </Link>

      {/* Cabeçalho que GUIA */}
      <header
        className="wr-card wr-anim-in relative overflow-hidden p-6 sm:p-7"
        style={{ background: "linear-gradient(135deg,#0E1116 0%,#14181F 55%,#1A2410 100%)", border: "1px solid rgba(215,243,106,0.22)" }}
      >
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full" style={{ background: "radial-gradient(closest-side,rgba(215,243,106,0.16),transparent)" }} />
        <div className="relative space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: pill.bg, color: pill.color }}>
                {c.status === "running" && <span className="wr-live-dot" aria-hidden />}
                {t(pill.label)}
              </span>
              <h1 className="font-heading mt-2 text-2xl font-bold leading-tight" style={{ color: "#FFFFFF" }}>{c.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {c.status === "draft" && (
                <Link href={`/app/campaigns/${c.id}/edit`} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-sm font-medium" style={{ border: "1px solid rgba(255,255,255,0.18)", color: "rgba(255,255,255,0.9)" }}>
                  <Pencil className="h-4 w-4" /> {t("Editar")}
                </Link>
              )}
              {secundarias.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={acao.isPending}
                  onClick={() => dispara(a)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-sm font-medium disabled:opacity-50"
                  style={{ border: "1px solid rgba(255,255,255,0.18)", color: a === "cancelar" ? "#FCA5A5" : "rgba(255,255,255,0.9)" }}
                >
                  <IconeAcao a={a} /> {t(ROTULO_DA_ACAO[a])}
                </button>
              ))}
              {principal && (
                <button
                  type="button"
                  disabled={acao.isPending}
                  onClick={() => dispara(principal)}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-5 text-sm font-bold disabled:opacity-50"
                  style={{ background: "#D7F36A", color: "#14181F" }}
                >
                  <IconeAcao a={principal} /> {t(ROTULO_DA_ACAO[principal])}
                </button>
              )}
            </div>
          </div>
          {/* Próximo passo */}
          <div className="flex items-start gap-2.5 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
            <span className="text-lg leading-none">{guia.emoji}</span>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>{t(guia.texto)}</p>
          </div>
        </div>
      </header>

      {/* Confirmação */}
      {confirmando && (
        <div className="wr-card wr-anim-in space-y-3 p-5" style={{ borderColor: "#F3C9C5", background: "#FEF5F4" }}>
          <p className="text-sm" style={{ color: "#8A2A24" }}>
            {confirmando === "iniciar"
              ? `${t("Começar a enviar para")} ${c.snapshot_eligible} ${c.snapshot_eligible === 1 ? t("pessoa?") : t("pessoas?")} ${t("O envio segue o ritmo escolhido e pode levar horas.")}`
              : t("Cancelar é definitivo: quem ainda não recebeu não recebe mais, e o disparo não volta a rodar.")}
          </p>
          <div className="flex gap-2">
            <button className="wr-btn-dark px-5" disabled={acao.isPending} onClick={() => { acao.mutate({ acao: confirmando }); setConfirmando(null); }}>
              {t("Confirmar")}
            </button>
            <button className="wr-btn px-5" onClick={() => setConfirmando(null)}>{t("Voltar")}</button>
          </div>
        </div>
      )}

      {testando && (
        <TesteDaCampanha
          onCancelar={() => setTestando(false)}
          onEnviar={(contactId) => { acao.mutate({ acao: "testar", corpo: { contact_id: contactId } }); setTestando(false); }}
          enviando={acao.isPending}
        />
      )}

      {/* KPIs */}
      <div className="wr-anim-in grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniKpi icone={Users} label={t("Na lista")} valor={c.snapshot_eligible} />
        <MiniKpi icone={Send} label={t("Enviadas")} valor={m?.contagem.enviados ?? 0} />
        <MiniKpi icone={CheckCircle2} label={t("Entregues")} valor={m?.contagem.entregues ?? 0} cor="#4ADE80" />
        <MiniKpi icone={MessageCircle} label={t("Responderam")} valor={m?.contagem.responderam ?? 0} cor="#D7F36A" />
      </div>

      {/* Progresso */}
      {m && (
        <div className="wr-card wr-anim-in space-y-2 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-[15px] font-bold" style={{ color: "var(--color-text)" }}>{t("Progresso do envio")}</h2>
            <span className="text-sm font-bold tabular-nums" style={{ color: "var(--color-accent)" }}>{Math.round(m.progresso * 100)}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-elevated)" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.round(m.progresso * 100)}%`, background: "linear-gradient(90deg,#8AA62E,#D7F36A)" }} role="progressbar" aria-valuenow={Math.round(m.progresso * 100)} aria-valuemin={0} aria-valuemax={100} />
          </div>
          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            {m.contagem.pendentes} {t("na fila")} · {m.contagem.falharam} {t("falharam")} · {m.contagem.optOut} {t("pediram para parar")}
          </p>
        </div>
      )}

      {/* Mensagem + material */}
      <div className="wr-card wr-anim-in space-y-3 p-5">
        <h2 className="font-heading text-[15px] font-bold" style={{ color: "var(--color-text)" }}>{t("Mensagem")}</h2>
        <div className="rounded-2xl p-4" style={{ background: "#0B141A" }}>
          <div className="max-w-[85%] rounded-xl rounded-tl-sm px-3 py-2 text-sm" style={{ background: "#1F2C33", color: "#E9EDEF" }} dangerouslySetInnerHTML={{ __html: previewWhatsapp(c.message_body ?? "") }} />
        </div>
        <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
          {t("Base legal")}: {c.base_legal === "consent" ? t("consentimento") : t("interesse legítimo")}{c.lia_ref ? ` (${c.lia_ref})` : ""}
        </p>
        {c.material_id && (
          <p className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "rgba(215,243,106,0.12)", color: "#8AA62E" }}>
            📘 {t("Quem responder SIM recebe o material automaticamente")}
          </p>
        )}
      </div>

      <DestinoDaCampanha campanha={c} />
      <VelocidadeDaCampanha campanha={c} />

      {/* Quem está na lista */}
      <div className="wr-card wr-anim-in space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-[15px] font-bold" style={{ color: "var(--color-text)" }}>{t("Quem está na lista")}</h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border p-0.5" style={{ borderColor: "var(--color-border)" }}>
              {(["lista", "kanban"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setVista(v)} className="rounded-full px-3 py-1 text-xs font-semibold transition-colors" style={vista === v ? { background: "var(--color-accent)", color: "#14181F" } : { color: "var(--color-text-muted)" }}>
                  {v === "lista" ? t("Lista") : t("Kanban")}
                </button>
              ))}
            </div>
            {vista === "lista" && (
              <select className="wr-input" style={{ maxWidth: 200 }} value={filtroDeStatus} onChange={(e) => setFiltroDeStatus(e.target.value)} aria-label={t("Filtrar")}>
                <option value="">{t("Todos")}</option>
                <option value="pending">{t("Na fila")}</option>
                <option value="sent">{t("Enviadas")}</option>
                <option value="delivered">{t("Entregues")}</option>
                <option value="read">{t("Lidas")}</option>
                <option value="replied">{t("Responderam")}</option>
                <option value="skipped">{t("Fora da lista")}</option>
                <option value="failed">{t("Falharam")}</option>
              </select>
            )}
          </div>
        </div>
        {c.snapshot_total === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>{t("A lista ainda não foi montada. Use “Preparar lista” para ver quem entra.")}</p>
        ) : vista === "kanban" ? (
          <KanbanDosDestinatarios
            linhas={linhas}
            temMaterial={!!c.material_id}
            hasNext={!!destinatarios.hasNextPage}
            fetchNext={() => destinatarios.fetchNextPage()}
            fetching={destinatarios.isFetchingNextPage}
          />
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {linhas.map((d) => {
              const estilo = estiloDoDestinatario(d.status, d.eligibility_status === "excluded");
              return (
                <div key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate" style={{ color: "var(--color-text)" }}>{rotuloDoContato(d.contacts, t)}</span>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: estilo.bg, color: estilo.color }}>
                    {d.eligibility_status === "excluded"
                      ? t(d.legenda_da_exclusao ?? rotuloDoMotivo(d.exclusion_reason))
                      : t(ROTULO_DO_DESTINATARIO[d.status] ?? d.status)}
                  </span>
                </div>
              );
            })}
            {destinatarios.hasNextPage && (
              <div className="pt-3">
                <button className="wr-btn" onClick={() => destinatarios.fetchNextPage()} disabled={destinatarios.isFetchingNextPage}>
                  {destinatarios.isFetchingNextPage ? t("Carregando…") : t("Carregar mais")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Velocidade (substitui o ritmo cru; cru fica no Avançado) ─────────────── */

function VelocidadeDaCampanha({ campanha }: { campanha: CampanhaDetalhada }) {
  const t = useT();
  const editar = useEditarCampanha(campanha.id);
  const [avancado, setAvancado] = useState(false);
  const atualId = detectarVelocidade(campanha.intervalo_segundos, campanha.teto_diario);
  const [intervalo, setIntervalo] = useState(txt(campanha.intervalo_segundos));
  const [tetoDia, setTetoDia] = useState(txt(campanha.teto_diario));
  const [tetoHora, setTetoHora] = useState(txt(campanha.teto_horario));
  const [inicio, setInicio] = useState(txt(campanha.janela_inicio_hora));
  const [fim, setFim] = useState(txt(campanha.janela_fim_hora));

  if (campanha.status === "completed" || campanha.status === "cancelled") return null;

  const aplicar = (v: (typeof VELOCIDADES)[number]) =>
    editar.mutate({ intervalo_segundos: v.intervalo, teto_diario: v.teto, teto_horario: null });

  return (
    <div className="wr-card wr-anim-in space-y-4 p-5">
      <div>
        <h2 className="font-heading text-[15px] font-bold" style={{ color: "var(--color-text)" }}>{t("Velocidade do envio")}</h2>
        <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-subtle)" }}>
          {t("Mais devagar protege o número. Dá pra mudar a qualquer momento — vale só pra deixar mais seguro.")}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {VELOCIDADES.map((v) => {
          const ativo = atualId === v.id;
          return (
            <button key={v.id} type="button" disabled={editar.isPending} onClick={() => aplicar(v)} className="wr-lift rounded-xl border p-3 text-left transition-colors disabled:opacity-60" style={ativo ? { borderColor: "var(--color-accent)", background: "rgba(215,243,106,0.08)" } : { borderColor: "var(--color-border)" }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{v.emoji}</span>
                <span className="font-heading text-sm font-bold" style={{ color: "var(--color-text)" }}>{t(v.label)}</span>
                {ativo && <CheckCircle2 className="ml-auto h-4 w-4" style={{ color: "var(--color-accent)" }} />}
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>{t(v.desc)}</p>
            </button>
          );
        })}
      </div>
      {atualId === "custom" && (
        <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>{t("Ritmo personalizado ativo (veja no Avançado).")}</p>
      )}

      <button type="button" onClick={() => setAvancado((v) => !v)} className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>
        <Gauge className="h-4 w-4" /> {t("Ajuste fino (avançado)")}
        <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: avancado ? "rotate(180deg)" : "none" }} />
      </button>
      {avancado && (
        <div className="wr-anim-in space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoNum id="r-int" rotulo={t("Intervalo mínimo entre mensagens (segundos)")} valor={intervalo} onChange={setIntervalo} dica={t("Tempo de espera entre uma mensagem e a próxima.")} />
            <CampoNum id="r-dia" rotulo={t("Máximo por dia")} valor={tetoDia} onChange={setTetoDia} dica={t("Teto de mensagens por dia.")} />
            <CampoNum id="r-hora" rotulo={t("Máximo por hora")} valor={tetoHora} onChange={setTetoHora} placeholder={t("sem limite")} dica={t("Em branco = vale só o teto do dia.")} />
            <div />
            <CampoNum id="r-ini" rotulo={t("Enviar só a partir das (hora)")} valor={inicio} onChange={setInicio} placeholder={t("ex.: 8")} dica={t("Em branco = sem restrição. Ex.: 8 = só a partir das 8h.")} />
            <CampoNum id="r-fim" rotulo={t("Parar de enviar às (hora)")} valor={fim} onChange={setFim} placeholder={t("ex.: 20")} dica={t("Em branco = sem restrição. Ex.: 20 = para às 20h.")} />
          </div>
          <button className="wr-btn-dark px-5" disabled={editar.isPending} onClick={() => editar.mutate({ intervalo_segundos: num(intervalo), teto_diario: num(tetoDia), teto_horario: num(tetoHora), janela_inicio_hora: num(inicio), janela_fim_hora: num(fim) })}>
            {editar.isPending ? t("Salvando…") : t("Salvar ajuste fino")}
          </button>
        </div>
      )}
    </div>
  );
}

function DestinoDaCampanha({ campanha }: { campanha: CampanhaDetalhada }) {
  const t = useT();
  const funis = useFunis();
  const agentes = useAgentesPublicados();
  if (!campanha.pipeline_id && !campanha.agent_id) return null;
  const funil = (funis.data ?? []).find((f) => f.id === campanha.pipeline_id);
  const agente = (agentes.data ?? []).find((a) => a.id === campanha.agent_id);
  return (
    <div className="wr-card wr-anim-in space-y-2 p-5">
      <h2 className="font-heading text-[15px] font-bold" style={{ color: "var(--color-text)" }}>{t("Quem responder")}</h2>
      {campanha.pipeline_id && <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("Vira card no funil")}: <strong>{funil?.name ?? t("funil removido")}</strong></p>}
      {campanha.agent_id && <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("Quem atende")}: <strong>{agente?.name ?? t("agente indisponível")}</strong></p>}
    </div>
  );
}

function TesteDaCampanha({ onCancelar, onEnviar, enviando }: { onCancelar: () => void; onEnviar: (contactId: string) => void; enviando: boolean }) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const contatos = useContactList({ search: busca || undefined, limit: 10 });
  const encontrados = contatos.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <div className="wr-card wr-anim-in space-y-3 p-5">
      <h2 className="font-heading text-[15px] font-bold" style={{ color: "var(--color-text)" }}>{t("Enviar um teste")}</h2>
      <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>{t("Escolha um contato (ex.: o seu próprio número) e o sistema manda a mensagem só pra ele — igualzinho ao envio real: mesmo número, mesmo texto, mesma saudação do horário. Serve pra você conferir como chega antes de disparar pra todo mundo. Esse teste NÃO conta nos números do disparo.")}</p>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t("Busque o contato pelo nome ou telefone")} className="wr-input" />
      <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
        {encontrados.slice(0, 8).map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0 truncate" style={{ color: "var(--color-text)" }}>{rotuloDoContato(c, t)}</span>
            <button className="wr-btn text-xs" disabled={enviando} onClick={() => onEnviar(c.id)}>{t("Enviar para este")}</button>
          </div>
        ))}
        {encontrados.length === 0 && <p className="py-2 text-sm" style={{ color: "var(--color-text-subtle)" }}>{t("Nenhum contato encontrado.")}</p>}
      </div>
      <button className="wr-btn" onClick={onCancelar}>{t("Fechar")}</button>
    </div>
  );
}

/* ── Kanban do disparo ─────────────────────────────────────────────────────── */

function KanbanDosDestinatarios({
  linhas,
  temMaterial,
  hasNext,
  fetchNext,
  fetching,
}: {
  linhas: Destinatario[];
  temMaterial: boolean;
  hasNext: boolean;
  fetchNext: () => void;
  fetching: boolean;
}) {
  const t = useT();
  const colunas: Array<{ id: string; titulo: string; dica: string; cor: string; itens: Destinatario[] }> = [
    { id: "fila", titulo: "Na fila", dica: "ainda não saiu", cor: "#9AA0AA", itens: [] },
    { id: "enviado", titulo: "Enviado", dica: "convite entregue", cor: "#5A6BDC", itens: [] },
    { id: "respondeu", titulo: "Respondeu", dica: "topou receber", cor: "#22C55E", itens: [] },
  ];
  if (temMaterial) colunas.push({ id: "material", titulo: "Recebeu material", dica: "ebook entregue", cor: "#8AA62E", itens: [] });

  const col = (d: Destinatario): number => {
    if (d.material_entregue_at) return temMaterial ? 3 : 2;
    if (d.status === "replied" || d.replied_at) return 2;
    if (["sent", "delivered", "read"].includes(d.status)) return 1;
    if (["pending", "queued", "sending"].includes(d.status)) return 0;
    return -1; // failed/skipped/cancelled/opted_out: fora do fluxo (ficam na Lista)
  };
  for (const d of linhas) {
    const i = col(d);
    if (i >= 0 && i < colunas.length) colunas[i]!.itens.push(d);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {colunas.map((c) => (
          <div key={c.id} className="rounded-xl border p-2.5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--color-text)" }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.cor }} />
                {t(c.titulo)}
              </span>
              <span className="rounded-full px-1.5 text-[11px] font-bold tabular-nums" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}>{c.itens.length}</span>
            </div>
            <div className="space-y-1.5" style={{ maxHeight: 360, overflowY: "auto" }}>
              {c.itens.length === 0 ? (
                <p className="px-1 py-2 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{t(c.dica)}</p>
              ) : (
                c.itens.map((d) => (
                  <div key={d.id} className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text)" }}>
                    <span className="block truncate">{rotuloDoContato(d.contacts, t)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
      {hasNext && (
        <div className="flex justify-center">
          <button className="wr-btn" onClick={fetchNext} disabled={fetching}>{fetching ? t("Carregando…") : t("Carregar mais no quadro")}</button>
        </div>
      )}
      <p className="text-center text-xs" style={{ color: "var(--color-text-subtle)" }}>
        {t("As pessoas andam da esquerda pra direita conforme o disparo avança. Os totais exatos são os números do topo.")}
      </p>
    </div>
  );
}

/* ── Pequenos ─────────────────────────────────────────────────────────────── */

function MiniKpi({ icone: Icone, label, valor, cor }: { icone: typeof Users; label: string; valor: number; cor?: string }) {
  return (
    <div className="wr-card-dark p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="wr-kpi-value text-3xl leading-none" style={cor ? { color: cor, textShadow: "none" } : undefined}>{valor.toLocaleString("pt-BR")}</div>
          <div className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>{label}</div>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(215,243,106,0.1)" }}>
          <Icone className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
        </span>
      </div>
    </div>
  );
}

function CampoNum({ id, rotulo, valor, onChange, dica, placeholder }: { id: string; rotulo: string; valor: string; onChange: (v: string) => void; dica?: string; placeholder?: string }) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>{rotulo}</span>
      <input id={id} type="number" min={0} value={valor} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="wr-input" />
      {dica && <span className="block text-xs" style={{ color: "var(--color-text-subtle)" }}>{dica}</span>}
    </label>
  );
}

function IconeAcao({ a }: { a: AcaoDeCampanha }) {
  const cls = "h-4 w-4";
  if (a === "preparar") return <CheckCircle2 className={cls} />;
  if (a === "iniciar" || a === "retomar") return <Play className={cls} />;
  if (a === "pausar") return <Pause className={cls} />;
  if (a === "cancelar") return <X className={cls} />;
  if (a === "testar") return <FlaskConical className={cls} />;
  if (a === "duplicar") return <Copy className={cls} />;
  return null;
}

/* ── Dados/rótulos ────────────────────────────────────────────────────────── */

function proximoPasso(status: string, eligible: number, failure: string | null): { emoji: string; texto: string } {
  switch (status) {
    case "draft": return { emoji: "📋", texto: "Rascunho. Clique em “Preparar lista” para ver quem vai receber — depois você confere e inicia. Nada sai antes disso." };
    case "preparing": return { emoji: "⏳", texto: "Montando a lista… aguarde um instante." };
    case "ready": return { emoji: "✅", texto: `Lista pronta: ${eligible.toLocaleString("pt-BR")} pessoas. Antes de disparar pra todo mundo, você pode fazer um TESTE: o sistema manda a mensagem só pra 1 contato que você escolher (ex.: o seu número), igual ao envio real — pra você ver como chega. Depois é só clicar em “Iniciar envio”.` };
    case "scheduled": return { emoji: "🗓️", texto: "Agendado. Vai começar sozinho na hora marcada." };
    case "running": return { emoji: "🚀", texto: "Enviando no ritmo seguro. Quem responder recebe o material sozinho. Você pode pausar quando quiser." };
    case "paused": return { emoji: "⏸️", texto: "Pausado. Ninguém mais recebe até você retomar." };
    case "completed": return { emoji: "🏁", texto: "Concluído. Veja abaixo quem recebeu e quem respondeu." };
    case "cancelled": return { emoji: "🚫", texto: "Cancelado. Este disparo não volta a rodar." };
    case "failed": return { emoji: "⚠️", texto: `Falhou${failure ? ` (${failure})` : ""}. Duplique e tente de novo, ou chame o suporte.` };
    default: return { emoji: "•", texto: "" };
  }
}

function statusPill(status: string): { label: string; bg: string; color: string } {
  const mapa: Record<string, { label: string; bg: string; color: string }> = {
    draft: { label: "Rascunho", bg: "rgba(255,255,255,0.1)", color: "#E9EDEF" },
    preparing: { label: "Montando", bg: "rgba(96,125,230,0.2)", color: "#BCC6F7" },
    ready: { label: "Pronta para iniciar", bg: "rgba(96,125,230,0.2)", color: "#BCC6F7" },
    scheduled: { label: "Agendada", bg: "rgba(234,179,8,0.2)", color: "#FCD34D" },
    running: { label: "Enviando", bg: "rgba(34,197,94,0.2)", color: "#4ADE80" },
    paused: { label: "Pausada", bg: "rgba(234,179,8,0.2)", color: "#FCD34D" },
    completed: { label: "Concluída", bg: "rgba(96,125,230,0.2)", color: "#BCC6F7" },
    cancelled: { label: "Cancelada", bg: "rgba(255,255,255,0.1)", color: "#AAB" },
    failed: { label: "Falhou", bg: "rgba(239,68,68,0.2)", color: "#FCA5A5" },
  };
  return mapa[status] ?? { label: status, bg: "rgba(255,255,255,0.1)", color: "#E9EDEF" };
}

function estiloDoDestinatario(status: string, excluido: boolean): { bg: string; color: string } {
  if (excluido) return { bg: "#F0F0EB", color: "#6B6B5E" };
  const m: Record<string, { bg: string; color: string }> = {
    pending: { bg: "#EEF0FB", color: "#3B4280" },
    sent: { bg: "#DDE1F7", color: "#2F3DA8" },
    delivered: { bg: "rgba(34,197,94,0.15)", color: "#15803D" },
    read: { bg: "rgba(34,197,94,0.15)", color: "#15803D" },
    replied: { bg: "#D7F36A", color: "#2E3410" },
    failed: { bg: "#FBE4E2", color: "#A3302A" },
    opted_out: { bg: "#FBE4E2", color: "#A3302A" },
  };
  return m[status] ?? { bg: "#F0F0EB", color: "#6B6B5E" };
}

const ROTULO_DA_ACAO: Record<AcaoDeCampanha, string> = {
  preparar: "Preparar lista",
  iniciar: "Iniciar envio",
  agendar: "Agendar",
  pausar: "Pausar",
  retomar: "Retomar",
  cancelar: "Cancelar",
  duplicar: "Duplicar",
  testar: "Enviar teste",
};

const ROTULO_DO_DESTINATARIO: Record<string, string> = {
  pending: "Na fila",
  queued: "Na fila",
  sending: "Enviando",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  replied: "Respondeu",
  failed: "Falhou",
  skipped: "Fora da lista",
  cancelled: "Cancelada",
  opted_out: "Pediu para parar",
};

function rotuloDoMotivo(motivo: string | null): string {
  if (!motivo) return "Fora da lista";
  return (TEXTO_DA_EXCLUSAO as Record<string, string>)[motivo] ?? motivo;
}

function detectarVelocidade(intervalo: number | null, teto: number | null): string {
  const v = VELOCIDADES.find((x) => x.intervalo === intervalo && x.teto === teto);
  if (v) return v.id;
  if (intervalo == null && teto == null) return "calmo"; // herdando número = tratamos como calmo visual
  return "custom";
}

function txt(v: number | null): string { return v === null || v === undefined ? "" : String(v); }
function num(v: string): number | null { const s = v.trim(); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : null; }

/** Prévia WhatsApp: {{nome}} → "Maria", *negrito*, escapando HTML. */
function previewWhatsapp(texto: string): string {
  const e = texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return e.replace(/\{\{\s*nome\s*\}\}/g, "Maria").replace(/\*([^*]+)\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>");
}
