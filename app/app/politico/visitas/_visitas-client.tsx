"use client";

/**
 * Visitas Técnicas — visão geral + ação rápida. KPIs no topo, lista filtrável, e
 * por visita: marcar a PRÓPRIA presença ("Eu vou"), delegar a outro assessor,
 * registrar o RELATO de campo (o que foi feito / presentes / decidido) — visível
 * a todo o gabinete. A visita nasce na demanda (data); aqui não se cria.
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, CalendarClock, AlertTriangle, UserX, CheckCircle2, User, Check, X, ArrowUpRight, Camera, Plus } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { KpiCard } from "@/components/politico/kpi-card";
import { EmptyState } from "@/components/politico/empty-state";
import { corDoOrgao } from "@/lib/politico/demanda-cobranca";
import { visitaPendente, visitaAgendada, visitaSemResponsavel, statusVisita, ordenarVisitas } from "@/lib/politico/visita-tecnica";
import { definirResponsavelVisita, marcarVisitaRealizada, registrarRelatoVisita } from "@/app/actions/politico/gabinete-actions";
import { uploadAnexoDemanda, ANEXO_MAX_BYTES } from "@/lib/politico/anexos-upload";
import NovaVisitaForm from "./_nova-visita-form";

export interface FotoVisita {
  url: string;
  nome: string;
}

export interface VisitaItem {
  id: string;
  assunto: string | null;
  orgao: string | null;
  municipio: string | null;
  visitaEm: string | null;
  estado: string;
  realizadaEm: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  relato: string | null;
  presentes: string | null;
  decisoes: string | null;
  relatoPorId: string | null;
  relatoPorNome: string | null;
}

interface Props {
  visitas: VisitaItem[];
  kpis: { agendadas: number; atrasadas: number; semResponsavel: number; realizadas: number };
  assessores: { id: string; nome: string }[];
  usuarioAtualId: string;
  temRelato: boolean;
  fotos: Record<string, FotoVisita[]>;
  tipoMandato: string | null;
}

type Filtro = "todas" | "agendadas" | "atrasadas" | "sem_responsavel" | "realizadas";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "agendadas", label: "Agendadas" },
  { id: "atrasadas", label: "Atrasadas" },
  { id: "sem_responsavel", label: "Sem responsável" },
  { id: "realizadas", label: "Realizadas" },
];

function fmtData(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

/** "atrasada 3d" / "hoje" / "em 5d" a partir da data da visita. */
function quando(visitaEm: string | null): string {
  if (!visitaEm) return "";
  const dias = Math.ceil((new Date(visitaEm).getTime() - Date.now()) / 86_400_000);
  if (dias < 0) return `${Math.abs(dias)}d atrás`;
  if (dias === 0) return "hoje";
  return `em ${dias}d`;
}

const STATUS_PILL: Record<string, { bg: string; color: string; label: string }> = {
  atrasada: { bg: "rgba(239,68,68,0.16)", color: "#F87171", label: "Atrasada" },
  agendada: { bg: "rgba(59,130,246,0.15)", color: "#93B4EA", label: "Agendada" },
  realizada: { bg: "rgba(34,197,94,0.15)", color: "#7AD4AB", label: "Realizada" },
};

export default function VisitasClient({ visitas, kpis, assessores, usuarioAtualId, temRelato, fotos, tipoMandato }: Props) {
  const router = useRouter();
  const [novaAberta, setNovaAberta] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [pendente, startTransition] = useTransition();
  const [salvandoRelato, setSalvandoRelato] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Relato aberto (id da visita) + rascunho dos 3 campos + fotos a enviar.
  const [relatoId, setRelatoId] = useState<string | null>(null);
  const [relato, setRelato] = useState("");
  const [presentes, setPresentes] = useState("");
  const [decisoes, setDecisoes] = useState("");
  const [fotosNovas, setFotosNovas] = useState<File[]>([]);

  const arg = (v: VisitaItem) => ({ visitaEm: v.visitaEm, realizadaEm: v.realizadaEm, estado: v.estado, responsavelId: v.responsavelId });

  const lista = useMemo(() => {
    const filtrada = visitas.filter((v) => {
      if (filtro === "agendadas") return visitaAgendada(arg(v));
      if (filtro === "atrasadas") return visitaPendente(arg(v));
      if (filtro === "sem_responsavel") return visitaSemResponsavel(arg(v));
      if (filtro === "realizadas") return !!v.realizadaEm;
      return true;
    });
    return [...filtrada].sort((a, b) => ordenarVisitas(arg(a), arg(b)));
  }, [visitas, filtro]);

  function agir(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.erro ?? "Não foi possível concluir agora.");
      else router.refresh();
    });
  }

  function abrirRelato(v: VisitaItem) {
    setRelatoId(v.id);
    setRelato(v.relato ?? "");
    setPresentes(v.presentes ?? "");
    setDecisoes(v.decisoes ?? "");
    setFotosNovas([]);
    setErro(null);
  }

  async function salvarRelato(id: string) {
    setErro(null);
    setSalvandoRelato(true);
    // 1) Sobe as fotos (anexos da demanda). Fail-soft: foto que falha não perde o
    //    texto do relato — avisa e segue.
    let falhouFoto = false;
    for (const f of fotosNovas) {
      if (f.size > ANEXO_MAX_BYTES) { falhouFoto = true; continue; }
      const up = await uploadAnexoDemanda(id, f);
      if (!up.ok) falhouFoto = true;
    }
    // 2) Grava o relato (marca realizada se ainda não; carimba quem preencheu).
    const r = await registrarRelatoVisita(id, { relato, presentes, decisoes });
    setSalvandoRelato(false);
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível salvar o relato.");
      return;
    }
    if (falhouFoto) setErro("Relato salvo, mas uma ou mais fotos não subiram. Tente anexá-las de novo.");
    setRelatoId(null);
    setFotosNovas([]);
    router.refresh();
  }

  return (
    <div className="gip-ambient-bg mx-auto max-w-[1140px] px-4 py-7 space-y-6">
      <CommandHero
        eyebrow="Gabinete · Visitas Técnicas"
        titulo="Visitas Técnicas"
        subtitulo="As visitas do mandato ao território — o que está marcado, atrasado, sem responsável e já feito. Marque a sua presença e registre o relato de campo."
      />

      {/* Nova visita (ficha rápida) */}
      <div className="flex justify-end">
        <button onClick={() => setNovaAberta((v) => !v)} className="wr-btn-dark inline-flex items-center gap-2">
          {novaAberta ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {novaAberta ? "Fechar" : "Nova visita"}
        </button>
      </div>
      {novaAberta && <NovaVisitaForm tipoMandato={tipoMandato} onFechar={() => setNovaAberta(false)} />}

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Agendadas" valor={kpis.agendadas} icone={CalendarClock} />
        <KpiCard label="Atrasadas" valor={kpis.atrasadas} icone={AlertTriangle} cor={kpis.atrasadas > 0 ? "#F87171" : undefined} />
        <KpiCard label="Sem responsável" valor={kpis.semResponsavel} icone={UserX} cor={kpis.semResponsavel > 0 ? "#E4B96E" : undefined} />
        <KpiCard label="Realizadas" valor={kpis.realizadas} icone={CheckCircle2} />
      </section>

      {erro && (
        <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>
      )}

      {/* Filtros */}
      <section className="gip-glass p-4">
        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className="inline-flex items-center h-9 px-3.5 rounded-full text-sm font-medium transition-colors"
              style={filtro === f.id ? { background: "#16181D", color: "#FFFFFF" } : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs" style={{ color: "var(--color-text-subtle)" }}>
            {lista.length} de {visitas.length} visita(s)
          </span>
        </div>
      </section>

      {lista.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Nenhuma visita aqui"
          description="As visitas aparecem quando uma demanda recebe uma Data da visita. Marque a data na demanda (Nova demanda ou Editar) para ela entrar nesta agenda."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {lista.map((v) => {
            const st = statusVisita(arg(v));
            const pill = STATUS_PILL[st];
            const cor = corDoOrgao(v.orgao ?? "");
            const semResp = visitaSemResponsavel(arg(v));
            const euSou = v.responsavelId === usuarioAtualId;
            const temRelatoPreenchido = !!(v.relato || v.presentes || v.decisoes);
            const vFotos = fotos[v.id] ?? [];
            const registradoPorOutro = !!v.relatoPorId && v.relatoPorId !== v.responsavelId;

            return (
              <div key={v.id} className="gip-glass flex flex-col gap-3 p-5">
                {/* Cabeçalho: assunto + status + link */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/app/politico/demandas/${v.id}`} className="inline-flex items-center gap-1 text-sm font-semibold transition-colors hover:underline">
                      {v.assunto || "Demanda"} <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {v.orgao && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: cor.bg, color: cor.color }}>{v.orgao}</span>
                      )}
                      {v.municipio && (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>{v.municipio}</span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: pill.bg, color: pill.color }}>{pill.label}</span>
                </div>

                {/* Linha: data + responsável */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                  <span className="inline-flex items-center gap-1.5" style={{ color: "var(--color-text-muted)" }}>
                    <CalendarClock className="h-4 w-4" aria-hidden />
                    {v.realizadaEm ? `realizada em ${fmtData(v.realizadaEm)}` : `${fmtData(v.visitaEm)} · ${quando(v.visitaEm)}`}
                  </span>
                  {v.responsavelId ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "#E2F5EC", color: "#17784F" }}>
                      <User className="h-3.5 w-3.5" aria-hidden /> {v.responsavelNome || "Responsável"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "rgba(245,158,11,0.16)", color: "#B45309" }}>
                      Ninguém marcou presença
                    </span>
                  )}
                </div>

                {/* Resultado da visita (relato + fotos) — visível a todo o gabinete. */}
                {(temRelatoPreenchido || vFotos.length > 0) && relatoId !== v.id && (
                  <div className="rounded-xl p-3 text-sm" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                    {v.relato && (<p><strong>O que foi feito:</strong> {v.relato}</p>)}
                    {v.presentes && (<p className="mt-1"><strong>Presentes:</strong> {v.presentes}</p>)}
                    {v.decisoes && (<p className="mt-1"><strong>Decidido:</strong> {v.decisoes}</p>)}
                    {vFotos.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {vFotos.map((f, i) => (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" title={f.nome}>
                            <img src={f.url} alt={f.nome} className="h-20 w-20 rounded-lg object-cover" style={{ border: "1px solid var(--color-border)" }} />
                          </a>
                        ))}
                      </div>
                    )}
                    {registradoPorOutro && (
                      <p className="mt-2 text-xs" style={{ color: "var(--color-text-subtle)" }}>registrado por {v.relatoPorNome || "outro assessor"}</p>
                    )}
                  </div>
                )}

                {/* Formulário de relato (abre ao registrar/editar) */}
                {temRelato && relatoId === v.id ? (
                  <div className="space-y-2 rounded-xl p-3" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                    <label className="block text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>O que foi feito</label>
                    <textarea value={relato} onChange={(e) => setRelato(e.target.value)} rows={2} className="wr-input w-full" placeholder="Ex.: Estivemos no local, vistoriamos o ponto e fotografamos." />
                    <label className="block text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>Quem esteve presente</label>
                    <input value={presentes} onChange={(e) => setPresentes(e.target.value)} className="wr-input w-full" placeholder="Ex.: assessor, liderança do bairro, técnico da Copasa" />
                    <label className="block text-xs font-semibold" style={{ color: "var(--color-text-muted)" }}>O que ficou decidido</label>
                    <textarea value={decisoes} onChange={(e) => setDecisoes(e.target.value)} rows={2} className="wr-input w-full" placeholder="Ex.: Ofício à Secretaria de Obras pedindo o reparo em 30 dias." />

                    {/* Foto do campo (câmera ou galeria) — vira anexo da demanda. */}
                    <label
                      className="flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"
                      style={{ border: "1px dashed var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-muted)" }}
                    >
                      <Camera className="h-5 w-5" aria-hidden />
                      {fotosNovas.length > 0 ? `${fotosNovas.length} foto(s) selecionada(s)` : "Anexar foto da visita"}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        className="hidden"
                        onChange={(e) => setFotosNovas(Array.from(e.target.files ?? []))}
                      />
                    </label>

                    <div className="flex gap-2">
                      <button disabled={salvandoRelato} onClick={() => salvarRelato(v.id)} className="wr-btn-dark inline-flex items-center gap-1.5 text-sm disabled:opacity-60">
                        <Check className="h-4 w-4" /> {salvandoRelato ? "Salvando…" : `Salvar ${v.realizadaEm ? "relato" : "e marcar realizada"}`}
                      </button>
                      <button disabled={salvandoRelato} onClick={() => setRelatoId(null)} className="wr-btn text-sm disabled:opacity-60">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  /* Ações rápidas */
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
                    {/* Presença: eu vou / sair */}
                    {euSou ? (
                      <button disabled={pendente} onClick={() => agir(() => definirResponsavelVisita(v.id, null))} className="wr-btn inline-flex items-center gap-1.5 text-sm disabled:opacity-60">
                        <X className="h-4 w-4" /> Sair da visita
                      </button>
                    ) : (
                      <button disabled={pendente} onClick={() => agir(() => definirResponsavelVisita(v.id, usuarioAtualId))} className="wr-btn-dark inline-flex items-center gap-1.5 text-sm disabled:opacity-60" style={semResp ? { background: "#D7F36A", color: "#16181D" } : undefined}>
                        <User className="h-4 w-4" /> Eu vou
                      </button>
                    )}

                    {/* Delegar (secundário) */}
                    <select
                      value={v.responsavelId ?? ""}
                      disabled={pendente}
                      onChange={(e) => agir(() => definirResponsavelVisita(v.id, e.target.value || null))}
                      className="wr-input h-9 w-auto text-sm"
                      title="Passar a visita para outro assessor"
                    >
                      <option value="">— passar para… —</option>
                      {assessores.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                    </select>

                    {/* Registrar visita / editar relato */}
                    {temRelato ? (
                      <button disabled={pendente} onClick={() => abrirRelato(v)} className="wr-btn inline-flex items-center gap-1.5 text-sm disabled:opacity-60" style={{ marginLeft: "auto" }}>
                        <CheckCircle2 className="h-4 w-4" /> {v.realizadaEm ? "Editar relato" : "Registrar visita"}
                      </button>
                    ) : (
                      <button disabled={pendente} onClick={() => agir(() => marcarVisitaRealizada(v.id, !v.realizadaEm))} className="wr-btn inline-flex items-center gap-1.5 text-sm disabled:opacity-60" style={{ marginLeft: "auto" }}>
                        <CheckCircle2 className="h-4 w-4" /> {v.realizadaEm ? "Desmarcar" : "Marcar realizada"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
