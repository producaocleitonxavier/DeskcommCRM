"use client";

/**
 * Detalhe/edição de uma demanda (Gabinete). Edita campos, aplica transições de
 * estado (mantendo a coerência desfecho⇔fechada_em exigida pelo banco) e o
 * texto de encaminhamento. Grava via Supabase browser client (RLS).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, Flag, MessageCircle, Mic, Pencil, Printer, Sparkles, Trash2, X } from "lucide-react";

import { gerarEncaminhamento } from "@/app/actions/politico/gerarEncaminhamento";
import { gerarOficioDemanda } from "@/app/actions/politico/gerarOficio";
import { avisarCidadao, avisarResolucaoAutomatica } from "@/app/actions/politico/avisarCidadao";
import { atualizarRegistro, excluirRegistro, registrarEventoDemanda } from "@/app/actions/politico/gabinete-actions";
import DemandaAnexos from "@/components/politico/demanda-anexos";

interface Opcao {
  id: string;
  nome: string;
}

export interface DemandaDetalhe {
  id: string;
  assunto: string | null;
  estado: string;
  origem: string | null;
  pol_tipo: string | null;
  pol_prioridade: string | null;
  pol_orgao_destino: string | null;
  pol_encaminhamento_ia: string | null;
  pol_oficio_rotulo: string | null;
  pol_oficio_destinatario: string | null;
  pol_municipio: string | null;
  pol_territory_id: string | null;
  pol_lideranca_id: string | null;
  dono_kind: string | null;
  dono_user_id: string | null;
  pol_assessor_nome: string | null;
  aberta_em: string;
  prazo_em: string | null;
  desfecho: string | null;
  fechada_em: string | null;
  created_at: string;
  updated_at: string;
  contacts: { name: string | null; phone_number: string | null } | null;
}

export interface EventoDemanda {
  id: string;
  tipo: string;
  descricao: string | null;
  created_at: string;
}

export interface Props {
  demanda: DemandaDetalhe;
  assessores: Opcao[];
  eventos: EventoDemanda[];
  /** Voz do Mandato pronta (clone + consentimento + ligada)? Liga a opção de
   * mandar o aviso também como recado em áudio na voz do político. */
  vozArmada?: boolean;
}

const TIPOS: Opcao[] = [
  { id: "servico_publico", nome: "Serviço público" },
  { id: "infraestrutura", nome: "Infraestrutura" },
  { id: "saude", nome: "Saúde" },
  { id: "educacao", nome: "Educação" },
  { id: "seguranca", nome: "Segurança" },
  { id: "assistencia_social", nome: "Assistência social" },
  { id: "meio_ambiente", nome: "Meio ambiente" },
  { id: "documentacao", nome: "Documentação" },
  { id: "outro", nome: "Outro" },
];
const PRIORIDADES: Opcao[] = [
  { id: "baixa", nome: "Baixa" },
  { id: "normal", nome: "Normal" },
  { id: "alta", nome: "Alta" },
  { id: "urgente", nome: "Urgente" },
];
const ESTADO_LABEL: Record<string, string> = {
  aberta: "Nova",
  em_atendimento: "Em atendimento",
  aguardando_cliente: "Aguardando cidadão",
  resolvida: "Resolvida",
  encerrada: "Encerrada",
};
const ESTADO_COR: Record<string, { bg: string; color: string }> = {
  aberta: { bg: "rgba(245,158,11,0.15)", color: "#F59E0B" },
  em_atendimento: { bg: "rgba(59,130,246,0.15)", color: "#60A5FA" },
  aguardando_cliente: { bg: "rgba(252,211,77,0.15)", color: "#FCD34D" },
  resolvida: { bg: "rgba(34,197,94,0.15)", color: "#22C55E" },
  encerrada: { bg: "rgba(156,163,175,0.15)", color: "#9CA3AF" },
};

function nomeDe(lista: Opcao[], id: string | null): string {
  if (!id) return "—";
  return lista.find((o) => o.id === id)?.nome ?? "—";
}
function labelTipo(id: string | null): string {
  if (!id) return "—";
  return TIPOS.find((t) => t.id === id)?.nome ?? id;
}
function fmtData(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function paraInputDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export default function DetalheDemandaClient({ demanda, assessores, eventos, vozArmada }: Props) {
  const router = useRouter();

  const [d, setD] = useState<DemandaDetalhe>(demanda);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [gerandoIA, setGerandoIA] = useState(false);
  const [gerandoOficio, setGerandoOficio] = useState(false);
  const [avisando, setAvisando] = useState(false);
  const [avisoMsg, setAvisoMsg] = useState<string | null>(null);
  const [incluirVoz, setIncluirVoz] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [anexoToken, setAnexoToken] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  // Campos editáveis (rascunho)
  const [assunto, setAssunto] = useState(d.assunto ?? "");
  const [tipo, setTipo] = useState(d.pol_tipo ?? "");
  const [prioridade, setPrioridade] = useState(d.pol_prioridade ?? "normal");
  const [orgao, setOrgao] = useState(d.pol_orgao_destino ?? "");
  const [prazo, setPrazo] = useState(paraInputDate(d.prazo_em));
  const [municipio, setMunicipio] = useState(d.pol_municipio ?? "");
  const [assessorNome, setAssessorNome] = useState(
    d.pol_assessor_nome ?? (d.dono_kind === "humano" ? (assessores.find((a) => a.id === d.dono_user_id)?.nome ?? "") : ""),
  );
  const [encaminhamento, setEncaminhamento] = useState(d.pol_encaminhamento_ia ?? "");
  const [numeroOficio, setNumeroOficio] = useState(d.pol_oficio_rotulo ?? "");
  const [destinatarioOficio, setDestinatarioOficio] = useState(d.pol_oficio_destinatario ?? "");

  const fechada = d.estado === "resolvida" || d.estado === "encerrada";

  async function persistir(patch: Record<string, unknown>, otimista: Partial<DemandaDetalhe>) {
    setErro(null);
    setSalvando(true);
    const res = await atualizarRegistro("demandas", d.id, patch);
    setSalvando(false);
    if (!res.ok) {
      setErro(res.erro);
      return false;
    }
    setD((prev) => ({ ...prev, ...otimista }));
    router.refresh();
    return true;
  }

  async function salvarEdicao() {
    // Assessor por texto livre: se bate exatamente com um membro, vira dono
    // humano de verdade (dono_user_id); se for nome de fora, fica só o rótulo
    // (o banco exige user quando dono_kind='humano').
    const nomeAssessor = assessorNome.trim();
    const membro = nomeAssessor ? assessores.find((a) => a.nome === nomeAssessor) : undefined;
    const campos = {
      assunto: assunto.trim() || null,
      pol_tipo: tipo || null,
      pol_prioridade: prioridade,
      pol_orgao_destino: orgao.trim() || null,
      pol_municipio: municipio.trim() || null,
      dono_kind: membro ? "humano" : "ia",
      dono_user_id: membro ? membro.id : null,
      pol_assessor_nome: nomeAssessor || null,
      pol_encaminhamento_ia: encaminhamento.trim() || null,
      pol_oficio_rotulo: numeroOficio.trim() || null,
      pol_oficio_destinatario: destinatarioOficio.trim() || null,
      prazo_em: prazo ? new Date(prazo + "T12:00:00").toISOString() : null,
    };
    const ok = await persistir(campos, campos as Partial<DemandaDetalhe>);
    if (ok) setEditando(false);
  }

  async function mudarEstado(novo: string) {
    const nowISO = new Date().toISOString();
    let patch: Record<string, unknown>;
    let otim: Partial<DemandaDetalhe>;
    if (novo === "resolvida") {
      patch = { estado: "resolvida", desfecho: "resolvida", fechada_em: nowISO };
      otim = { estado: "resolvida", desfecho: "resolvida", fechada_em: nowISO };
    } else if (novo === "encerrada") {
      patch = { estado: "encerrada", desfecho: "nao_procede", fechada_em: nowISO };
      otim = { estado: "encerrada", desfecho: "nao_procede", fechada_em: nowISO };
    } else {
      patch = { estado: novo, desfecho: null, fechada_em: null };
      otim = { estado: novo, desfecho: null, fechada_em: null };
    }
    const ok = await persistir(patch, otim);
    if (ok) {
      void registrarEventoDemanda(d.id, "estado_alterado", `Status alterado para "${ESTADO_LABEL[novo] ?? novo}"`);
      // Ciclo da demanda: resolveu, o cidadão é avisado sozinho ("resolvemos o
      // que você pediu"). Idempotente e com guarda de telefone no servidor — aqui
      // só mostramos o que aconteceu. Nunca bloqueia a resolução.
      if (novo === "resolvida") {
        setAvisoMsg(null);
        const aviso = await avisarResolucaoAutomatica(d.id);
        if (aviso.ok && aviso.enviado) {
          setAvisoMsg(`Cidadão avisado da resolução no WhatsApp (protocolo ${aviso.protocolo}).`);
        } else if (aviso.ok && !aviso.enviado && aviso.motivo === "sem_telefone") {
          setAvisoMsg("Demanda resolvida. O cidadão não tem telefone cadastrado — avise por outro meio quando puder.");
        } else if (aviso.ok && !aviso.enviado && aviso.motivo === "numero_invalido") {
          setErro("Demanda resolvida, mas o número do cidadão não é um WhatsApp BR válido (+55 + DDD). Corrija o cadastro para conseguir avisar.");
        }
      }
      router.refresh();
    }
  }

  // Ações de estado disponíveis conforme o estado atual.
  const acoes: { label: string; estado: string; tom?: "dark" | "ok" | "mut" }[] = (() => {
    switch (d.estado) {
      case "aberta":
        return [{ label: "Iniciar atendimento", estado: "em_atendimento", tom: "dark" }];
      case "em_atendimento":
        return [
          { label: "Aguardar cidadão", estado: "aguardando_cliente", tom: "mut" },
          { label: "Marcar resolvida", estado: "resolvida", tom: "ok" },
          { label: "Encerrar", estado: "encerrada", tom: "mut" },
        ];
      case "aguardando_cliente":
        return [
          { label: "Retomar atendimento", estado: "em_atendimento", tom: "dark" },
          { label: "Marcar resolvida", estado: "resolvida", tom: "ok" },
          { label: "Encerrar", estado: "encerrada", tom: "mut" },
        ];
      default:
        return [{ label: "Reabrir", estado: "aberta", tom: "mut" }];
    }
  })();

  const ec = ESTADO_COR[d.estado] ?? ESTADO_COR.aberta!;

  return (
    <div className="mx-auto max-w-[860px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/demandas" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Demandas
        </Link>
      </div>

      {/* Cabeçalho */}
      <header className="wr-card overflow-hidden p-6 sm:p-7">
        {/* Faixa tactical (assinatura Centro de Comando) */}
        <div
          className="-mx-6 -mt-6 mb-5 px-6 py-2.5 sm:-mx-7 sm:-mt-7 sm:px-7"
          style={{
            background: "linear-gradient(135deg,#0E1116 0%,#14181F 55%,#1A2410 100%)",
            borderBottom: "1px solid rgba(215,243,106,0.22)",
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "#D7F36A" }}>
            Gabinete · Atendimento ao cidadão
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: ec.bg, color: ec.color }}>
              {ESTADO_LABEL[d.estado] ?? d.estado}
            </span>
            <h1 className="mt-2 font-heading text-2xl font-bold leading-tight" style={{ color: "var(--color-text)" }}>
              {d.assunto || "Sem assunto"}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
              {d.contacts?.name ?? "Cidadão sem nome"}
              {d.contacts?.phone_number ? ` · ${d.contacts.phone_number}` : ""}
            </p>
          </div>
          {!editando && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setEditando(true)} className="wr-btn inline-flex items-center gap-2">
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </button>
              <button
                type="button"
                disabled={excluindo}
                onClick={async () => {
                  if (!window.confirm("Excluir esta demanda? Esta ação não pode ser desfeita (anexos e ofício também serão removidos).")) return;
                  setErro(null);
                  setExcluindo(true);
                  const res = await excluirRegistro("demandas", d.id);
                  if (!res.ok) {
                    setExcluindo(false);
                    setErro(res.erro);
                    return;
                  }
                  router.push("/app/politico/demandas");
                  router.refresh();
                }}
                className="wr-btn inline-flex items-center gap-2 disabled:opacity-50"
                style={{ color: "#EF4444", borderColor: "rgba(239,68,68,0.35)" }}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> {excluindo ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          )}
        </div>

        {/* Transições de estado + avisar cidadão */}
        <div className="mt-4 flex flex-wrap gap-2">
          {acoes.map((a) => (
            <button
              key={a.estado + a.label}
              type="button"
              disabled={salvando}
              onClick={() => mudarEstado(a.estado)}
              className={a.tom === "dark" ? "wr-btn-dark" : "wr-btn"}
              style={a.tom === "ok" ? { background: "#17784F", color: "#FFFFFF", borderColor: "#17784F" } : undefined}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            disabled={avisando || !d.contacts?.phone_number}
            title={!d.contacts?.phone_number ? "O cidadão não tem telefone cadastrado" : "Enviar aviso ao cidadão por WhatsApp"}
            onClick={async () => {
              const comVoz = !!vozArmada && incluirVoz;
              const pergunta = comVoz
                ? "Enviar o aviso por WhatsApp E um recado em áudio na voz do Cleiton?"
                : "Enviar aviso ao cidadão por WhatsApp confirmando o registro da demanda?";
              if (!window.confirm(pergunta)) return;
              setErro(null);
              setAvisoMsg(null);
              setAvisando(true);
              const res = await avisarCidadao(d.id, { incluirAudio: comVoz });
              setAvisando(false);
              if (res.ok) {
                const audioNota =
                  res.audio === "blackout"
                    ? "O áudio ficou de fora (silêncio eleitoral de 72h)."
                    : res.audio === "voz_desarmada"
                      ? "O áudio ficou de fora (a Voz do Mandato não está ligada)."
                      : res.audio === "falha"
                        ? "O áudio falhou — tente de novo."
                        : "";
                let msg: string;
                if (res.textoEnviado) {
                  msg =
                    `Cidadão avisado no WhatsApp (protocolo ${res.protocolo})` +
                    (res.comOficio ? " com o ofício em anexo" : "") +
                    (res.audio === "enviado" ? " + recado em áudio na voz do Cleiton" : "") +
                    "." +
                    (audioNota ? ` ${audioNota}` : "");
                } else if (res.audio === "enviado") {
                  msg = "Recado em áudio na voz do Cleiton enviado. (O aviso de texto já tinha ido antes.)";
                } else if (audioNota) {
                  msg = `O cidadão já tinha sido avisado por texto. ${audioNota}`;
                } else {
                  msg = "O cidadão já tinha sido avisado por texto — nada novo a enviar.";
                }
                setAvisoMsg(msg);
                router.refresh();
              } else setErro(res.erro);
            }}
            className="wr-btn inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "rgba(37,211,102,0.14)", color: "#25D366", borderColor: "rgba(37,211,102,0.35)" }}
          >
            <MessageCircle className="h-4 w-4" aria-hidden /> {avisando ? "Enviando…" : "Avisar cidadão"}
          </button>
          {vozArmada && (
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold"
              style={{
                border: `1px solid ${incluirVoz ? "#D7F36A" : "var(--color-border)"}`,
                background: incluirVoz ? "rgba(215,243,106,0.14)" : "transparent",
                color: incluirVoz ? "#D7F36A" : "var(--color-text-muted)",
              }}
              title="Manda também um recado em áudio na voz do Cleiton, depois da mensagem de texto."
            >
              <input type="checkbox" checked={incluirVoz} onChange={(e) => setIncluirVoz(e.target.checked)} className="sr-only" />
              <Mic className="h-3.5 w-3.5" aria-hidden /> Incluir recado na voz do Cleiton
            </label>
          )}
        </div>
      </header>

      {avisoMsg && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(34,197,94,0.14)", color: "#22C55E" }}>
          {avisoMsg}
        </div>
      )}

      {erro && (
        <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>
          {erro}
        </div>
      )}

      {/* Campos */}
      <section className="wr-card p-6 sm:p-7">
        {editando ? (
          <div className="space-y-4">
            <Campo label="Tipo de demanda">
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="wr-input w-full">
                <option value="">— Selecione a área —</option>
                {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Justificativa">
              <textarea value={assunto} onChange={(e) => setAssunto(e.target.value)} rows={3} className="wr-input w-full" />
            </Campo>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Prioridade">
                <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="wr-input w-full">
                  {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Órgão de destino">
                <input type="text" value={orgao} onChange={(e) => setOrgao(e.target.value)} className="wr-input w-full" />
              </Campo>
              <Campo label="Data da visita">
                <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="wr-input w-full" />
              </Campo>
              <Campo label="Município">
                <input type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="Ex.: Belo Horizonte" className="wr-input w-full" />
              </Campo>
              <Campo label="Assessor responsável">
                <input
                  type="text"
                  list="assessores-lista-detalhe"
                  value={assessorNome}
                  onChange={(e) => setAssessorNome(e.target.value)}
                  placeholder="Nome do assessor"
                  className="wr-input w-full"
                  autoComplete="off"
                />
                {assessores.length > 0 && (
                  <datalist id="assessores-lista-detalhe">
                    {assessores.map((a) => <option key={a.id} value={a.nome} />)}
                  </datalist>
                )}
              </Campo>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" disabled={salvando} onClick={salvarEdicao} className="wr-btn-dark disabled:opacity-60">
                {salvando ? "Salvando…" : "Salvar alterações"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditando(false);
                  setAssunto(d.assunto ?? "");
                  setTipo(d.pol_tipo ?? "");
                  setPrioridade(d.pol_prioridade ?? "normal");
                  setOrgao(d.pol_orgao_destino ?? "");
                  setPrazo(paraInputDate(d.prazo_em));
                  setMunicipio(d.pol_municipio ?? "");
                  setAssessorNome(d.pol_assessor_nome ?? (d.dono_kind === "humano" ? (assessores.find((a) => a.id === d.dono_user_id)?.nome ?? "") : ""));
                }}
                className="wr-btn inline-flex items-center gap-1.5"
              >
                <X className="h-4 w-4" aria-hidden /> Cancelar
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Info label="Tipo de demanda" valor={labelTipo(d.pol_tipo)} />
            <Info label="Prioridade" valor={PRIORIDADES.find((p) => p.id === d.pol_prioridade)?.nome ?? "Normal"} />
            <Info label="Órgão de destino" valor={d.pol_orgao_destino ?? "—"} />
            <Info label="Data da visita" valor={fmtData(d.prazo_em)} />
            <Info label="Município" valor={d.pol_municipio ?? "—"} />
            <Info label="Aberta em" valor={fmtData(d.aberta_em)} />
            <Info label="Responsável" valor={d.pol_assessor_nome ?? (d.dono_kind === "humano" ? nomeDe(assessores, d.dono_user_id) : "IA / triagem")} />
          </dl>
        )}
      </section>

      {/* Encaminhamento (+ IA no próximo passo) */}
      <section className="wr-card p-6 sm:p-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Encaminhamento ao órgão</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={gerandoOficio || !d.pol_encaminhamento_ia?.trim()}
              title={!d.pol_encaminhamento_ia?.trim() ? "Gere e salve o encaminhamento primeiro" : "Emitir ofício em PDF"}
              onClick={async () => {
                setErro(null);
                if (!numeroOficio.trim()) {
                  setErro("Antes de imprimir, preencha o número do ofício (do jeito que o seu gabinete numera, ex.: OF. GAB.VER.CX – 405/2026).");
                  return;
                }
                setGerandoOficio(true);
                // Salva número e destinatário ANTES de gerar (a tela é a fonte).
                await atualizarRegistro("demandas", d.id, {
                  pol_oficio_rotulo: numeroOficio.trim(),
                  pol_oficio_destinatario: destinatarioOficio.trim() || null,
                });
                const res = await gerarOficioDemanda(d.id);
                setGerandoOficio(false);
                if (res.ok) {
                  window.open(res.url, "_blank", "noopener,noreferrer");
                  setAnexoToken((t) => t + 1);
                  router.refresh();
                } else {
                  setErro(res.erro);
                }
              }}
              className="wr-btn inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Printer className="h-4 w-4" aria-hidden /> {gerandoOficio ? "Gerando…" : "Imprimir ofício"}
            </button>
            <button
              type="button"
              disabled={gerandoIA}
              onClick={async () => {
                setErro(null);
                setGerandoIA(true);
                const res = await gerarEncaminhamento(d.id);
                setGerandoIA(false);
                if (res.ok) {
                  setEncaminhamento(res.texto);
                  setEditando(true);
                } else {
                  setErro(res.erro);
                }
              }}
              className="wr-btn inline-flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: "rgba(215,243,106,0.14)", color: "#D7F36A", borderColor: "rgba(215,243,106,0.3)" }}
            >
              <Sparkles className="h-4 w-4" aria-hidden /> {gerandoIA ? "Gerando…" : "Gerar com IA"}
            </button>
          </div>
        </div>

        {/* Dados do ofício — número MANUAL + destinatário (sempre visíveis, fáceis
            de preencher: quem opera no gabinete pode não ter intimidade com tela). */}
        <div className="mb-4 grid gap-3 rounded-xl p-4" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
          <div>
            <label className="mb-1 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Número do ofício
            </label>
            <input
              value={numeroOficio}
              onChange={(e) => setNumeroOficio(e.target.value)}
              placeholder="Ex.: OF. GAB.VER.CX – 405/2026"
              className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            />
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>
              Escreva do jeito que o seu gabinete numera. É esse número que sai no ofício.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Para quem vai o ofício (autoridade)
            </label>
            <textarea
              value={destinatarioOficio}
              onChange={(e) => setDestinatarioOficio(e.target.value)}
              rows={4}
              placeholder={"Ex.:\nAo Excelentíssimo Senhor\nGuilherme Catunda Daltro\nSecretário Municipal de Governo\nAv. Afonso Pena, 1212, 2º andar – Centro – BH/MG"}
              className="w-full resize-y rounded-lg px-3.5 py-2.5 text-sm outline-none"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
            />
            <p className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>
              Nome da autoridade, cargo e endereço — aparece no rodapé do ofício.
            </p>
          </div>
        </div>

        {editando ? (
          <textarea
            value={encaminhamento}
            onChange={(e) => setEncaminhamento(e.target.value)}
            rows={12}
            placeholder="Ex.: Ofício encaminhado à Secretaria de Obras solicitando…"
            className="w-full resize-y rounded-xl px-4 py-3.5 text-sm leading-relaxed outline-none transition-colors focus:border-[rgba(215,243,106,0.55)]"
            style={{
              background: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              minHeight: 260,
              boxShadow: "none",
            }}
          />
        ) : d.pol_encaminhamento_ia ? (
          <div
            className="rounded-xl p-5 text-sm leading-relaxed whitespace-pre-wrap"
            style={{
              background: "var(--color-surface-elevated)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
            }}
          >
            {d.pol_encaminhamento_ia}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
            Sem encaminhamento registrado. Edite para redigir — em breve, a IA redige para você.
          </p>
        )}
      </section>

      {/* Anexos (ofícios, fotos, documentos) */}
      <DemandaAnexos demandaId={d.id} refreshToken={anexoToken} />

      {/* Histórico / linha do tempo */}
      <LinhaDoTempo aberturaISO={d.aberta_em} eventos={eventos} />
    </div>
  );
}

const EVT_ICONE: Record<string, { Icon: typeof Flag; cor: string }> = {
  registrada: { Icon: Flag, cor: "#9CA3AF" },
  encaminhamento_ia: { Icon: Sparkles, cor: "#D7F36A" },
  oficio_emitido: { Icon: Printer, cor: "#60A5FA" },
  cidadao_avisado: { Icon: MessageCircle, cor: "#25D366" },
  estado_alterado: { Icon: Clock, cor: "#F59E0B" },
  nota: { Icon: Pencil, cor: "#9CA3AF" },
};

function quandoTexto(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function LinhaDoTempo({ aberturaISO, eventos }: { aberturaISO: string; eventos: EventoDemanda[] }) {
  const itens = [
    { id: "__reg", tipo: "registrada", descricao: "Demanda registrada", created_at: aberturaISO },
    ...eventos,
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <section className="wr-card p-6 sm:p-7">
      <h2 className="mb-4 font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Histórico do atendimento</h2>
      <ol className="space-y-0">
        {itens.map((e, i) => {
          const cfg = EVT_ICONE[e.tipo] ?? EVT_ICONE.nota!;
          const ultimo = i === itens.length - 1;
          return (
            <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
              {!ultimo && (
                <span className="absolute left-[15px] top-8 bottom-0 w-px" style={{ background: "var(--color-border)" }} aria-hidden />
              )}
              <span
                className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", color: cfg.cor }}
                aria-hidden
              >
                <cfg.Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 pt-1">
                <div className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{e.descricao ?? "—"}</div>
                <div className="text-xs" style={{ color: "var(--color-text-subtle)" }}>{quandoTexto(e.created_at)}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>{label}</label>
      {children}
    </div>
  );
}

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>{label}</dt>
      <dd className="mt-0.5 text-sm font-medium" style={{ color: "var(--color-text)" }}>{valor}</dd>
    </div>
  );
}
