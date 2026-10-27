/**
 * /app/instagram/automacoes/[id] — Edição de flow de automação Instagram (War Room 2.0)
 *
 * Formulário de edição de um flow existente. Pré-carrega via GET e envia PATCH.
 * Acesso: admin (gate no layout). Visual: padrão War Room dark.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

import { CommandHero } from "@/components/politico/command-hero";

export const dynamic = "force-dynamic";

// ── Tipos (mesmo contrato de novo/page.tsx) ───────────────────────────────────

type TriggerTipo =
  | "comment_keyword"
  | "comment_no_post"
  | "dm_keyword"
  | "novo_seguidor"
  | "story_reply"
  | "novo_comentario";

type AcaoTipo =
  | "enviar_dm"
  | "responder_comentario"
  | "add_etiqueta"
  | "criar_contato"
  | "notificar_equipe"
  | "add_funil_politico"
  | "captar_instagram";

interface AcaoConfig {
  tipo: AcaoTipo;
  texto?: string;
  etiqueta?: string;
  nivel?: string;
  mensagem?: string;
}

interface FlowRow {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  trigger_tipo: TriggerTipo;
  trigger_config: Record<string, unknown>;
  acoes: AcaoConfig[];
}

// Só os gatilhos reais (ver novo/page.tsx). "Novo seguidor"/"Palavra-chave em DM"
// removidos por não dispararem. Flows antigos com esses tipos ainda abrem (a
// união de tipos os mantém), mas não aparecem como opção nova.
const TRIGGER_OPTIONS: { value: TriggerTipo; label: string; descricao: string }[] = [
  { value: "novo_comentario", label: "Em qualquer comentário (recomendado)", descricao: "Responde quem comentar em qualquer post ou reel seu. É o modo da captação — o que mais traz gente." },
  { value: "comment_keyword", label: "Só quando o comentário tiver uma palavra", descricao: "Responde só quando o comentário contém uma palavra que você escolher (ex.: EU QUERO)." },
  { value: "comment_no_post", label: "Só em posts específicos", descricao: "Responde só nos posts que você indicar." },
  { value: "story_reply", label: "Quando responderem seu Story", descricao: "Dispara quando alguém responde um Story seu." },
];

const ACAO_OPTIONS: { value: AcaoTipo; label: string; descricao: string }[] = [
  { value: "captar_instagram", label: "Captação completa (recomendado)", descricao: "Faz tudo de uma vez: responde o comentário em público, chama a pessoa no Direct, pergunta estado/cidade/bairro/WhatsApp e coloca no Kanban. Usa os textos da sua Personalização. Não precisa adicionar mais nada." },
  { value: "enviar_dm", label: "Só chamar no Direct", descricao: "Envia uma mensagem no Direct para quem comentou. Use {{username}} pra chamar pelo @." },
  { value: "responder_comentario", label: "Só responder o comentário", descricao: "Responde em público, embaixo do comentário. Use {{username}} pra chamar pelo @." },
  { value: "add_etiqueta", label: "Marcar com uma etiqueta", descricao: "Adiciona uma etiqueta ao contato." },
  { value: "criar_contato", label: "Criar o contato", descricao: "Cria ou atualiza o contato com os dados do Instagram." },
  { value: "notificar_equipe", label: "Avisar a equipe", descricao: "Abre um aviso na Central para alguém do time olhar." },
  { value: "add_funil_politico", label: "Classificar no funil", descricao: "Marca o nível: Simpatizante, Apoiador ou Embaixador." },
];

const NIVEIS_FUNIL = ["Simpatizante", "Apoiador", "Embaixador"];

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--color-text-subtle)",
  letterSpacing: ".08em",
  textTransform: "uppercase" as const,
};

function AcaoEditor({
  acao,
  onChange,
  onRemove,
}: {
  acao: AcaoConfig;
  index: number;
  onChange: (acao: AcaoConfig) => void;
  onRemove: () => void;
}) {
  const info = ACAO_OPTIONS.find((o) => o.value === acao.tipo);

  return (
    <div className="space-y-3 rounded-[16px] p-4" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="flex items-center justify-between gap-2">
        <select value={acao.tipo} onChange={(e) => onChange({ tipo: e.target.value as AcaoTipo })} className="wr-input flex-1">
          {ACAO_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          onClick={onRemove}
          className="inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold transition-colors"
          style={{ border: "1px solid rgba(239,68,68,0.3)", background: "var(--color-surface-elevated)", color: "#F87171" }}
        >
          Remover
        </button>
      </div>

      {info && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{info.descricao}</p>}

      {(acao.tipo === "enviar_dm" || acao.tipo === "responder_comentario") && (
        <textarea
          value={acao.texto ?? ""}
          onChange={(e) => onChange({ ...acao, texto: e.target.value })}
          placeholder="Texto da mensagem ({{username}}, {{comentario}})"
          rows={3}
          className="wr-input w-full resize-none"
        />
      )}

      {acao.tipo === "add_etiqueta" && (
        <input type="text" value={acao.etiqueta ?? ""} onChange={(e) => onChange({ ...acao, etiqueta: e.target.value })} placeholder="Nome da etiqueta" className="wr-input w-full" />
      )}

      {acao.tipo === "notificar_equipe" && (
        <input type="text" value={acao.mensagem ?? ""} onChange={(e) => onChange({ ...acao, mensagem: e.target.value })} placeholder="Mensagem para a equipe" className="wr-input w-full" />
      )}

      {acao.tipo === "add_funil_politico" && (
        <select value={acao.nivel ?? "Simpatizante"} onChange={(e) => onChange({ ...acao, nivel: e.target.value })} className="wr-input w-full">
          {NIVEIS_FUNIL.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )}
    </div>
  );
}

export default function EditarFlowPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [carregando, setCarregando] = useState(true);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [triggerTipo, setTriggerTipo] = useState<TriggerTipo>("comment_keyword");
  const [keywords, setKeywords] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [postIds, setPostIds] = useState("");
  const [acoes, setAcoes] = useState<AcaoConfig[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/ig-automation-flows/${id}`);
        if (res.status === 404) {
          setNaoEncontrado(true);
          return;
        }
        if (!res.ok) throw new Error("Erro ao carregar");
        const json = await res.json();
        const flow: FlowRow = json.data?.flow ?? json.data;
        setNome(flow.nome);
        setDescricao(flow.descricao ?? "");
        setAtivo(flow.ativo);
        setTriggerTipo(flow.trigger_tipo);
        const cfg = flow.trigger_config;
        if (Array.isArray(cfg.keywords)) setKeywords((cfg.keywords as string[]).join(", "));
        if (typeof cfg.case_sensitive === "boolean") setCaseSensitive(cfg.case_sensitive);
        if (Array.isArray(cfg.post_ids)) setPostIds((cfg.post_ids as string[]).join(", "));
        setAcoes(flow.acoes ?? []);
      } catch {
        setErro("Erro ao carregar a automação.");
      } finally {
        setCarregando(false);
      }
    })();
  }, [id]);

  const triggerInfo = TRIGGER_OPTIONS.find((o) => o.value === triggerTipo);

  function buildTriggerConfig() {
    const cfg: Record<string, unknown> = {};
    if (triggerTipo === "comment_keyword" || triggerTipo === "dm_keyword") {
      cfg.keywords = keywords.split(",").map((k) => k.trim()).filter(Boolean);
      cfg.case_sensitive = caseSensitive;
    }
    if (triggerTipo === "comment_no_post") {
      cfg.post_ids = postIds.split(",").map((p) => p.trim()).filter(Boolean);
    }
    return cfg;
  }

  function addAcao() {
    setAcoes((prev) => [...prev, { tipo: "criar_contato" }]);
  }
  function updateAcao(i: number, acao: AcaoConfig) {
    setAcoes((prev) => prev.map((a, idx) => (idx === i ? acao : a)));
  }
  function removeAcao(i: number) {
    setAcoes((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!nome.trim()) {
      setErro("Nome é obrigatório.");
      return;
    }
    if (acoes.length === 0) {
      setErro("Adicione pelo menos uma ação.");
      return;
    }

    const body = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      ativo,
      trigger_tipo: triggerTipo,
      trigger_config: buildTriggerConfig(),
      acoes,
    };

    setSalvando(true);
    try {
      const res = await fetch(`/api/v1/ig-automation-flows/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message ?? "Erro ao salvar");
      }
      router.push("/app/instagram/automacoes");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (naoEncontrado) {
    return (
      <div className="mx-auto max-w-[720px] space-y-4 px-4 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--color-surface-elevated)" }}>
          <span className="text-2xl">🔍</span>
        </div>
        <p className="font-heading text-lg font-semibold" style={{ color: "var(--color-text)" }}>Automação não encontrada</p>
        <Link href="/app/instagram/automacoes" className="text-sm font-semibold underline underline-offset-4" style={{ color: "var(--color-accent)" }}>
          Voltar para automações
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Instagram · Automações"
        titulo="Editar automação"
        subtitulo="Mude quando ela dispara e o que faz. As alterações valem na hora."
        acoes={[{ href: "/app/instagram/automacoes", label: "← Voltar" }]}
      />

      <form onSubmit={salvar} className="space-y-[18px]">
        {/* ── Identificação ────────────────────────────────────── */}
        <div className="wr-card space-y-4 p-5">
          <p style={sectionLabelStyle}>Identificação</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--color-text)" }}>Nome (só pra você lembrar) *</label>
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required className="wr-input w-full" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--color-text)" }}>Descrição</label>
              <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} className="wr-input w-full" />
            </div>
            <div
              className="flex items-center justify-between gap-3 rounded-[14px] p-3.5"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                  {ativo ? "Automação ligada" : "Automação desligada"}
                </p>
                <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                  {ativo ? "Está respondendo os comentários agora." : "Está pausada — não responde ninguém até você ligar."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAtivo((v) => !v)}
                className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors"
                style={{ background: ativo ? "#D7F36A" : "var(--color-border)" }}
                aria-pressed={ativo}
              >
                <span className="inline-block h-6 w-6 rounded-full bg-white transition-transform" style={{ transform: ativo ? "translateX(26px)" : "translateX(4px)" }} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Gatilho ──────────────────────────────────────────── */}
        <div className="wr-card space-y-4 p-5">
          <p style={sectionLabelStyle}>Quando disparar</p>
          <select value={triggerTipo} onChange={(e) => setTriggerTipo(e.target.value as TriggerTipo)} className="wr-input w-full">
            {TRIGGER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {triggerInfo && <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>{triggerInfo.descricao}</p>}

          {(triggerTipo === "comment_keyword" || triggerTipo === "dm_keyword") && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--color-text)" }}>Palavras-chave (separadas por vírgula)</label>
                <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="INFO, quero saber, saiba mais" className="wr-input w-full" />
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="rounded" />
                <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>Case sensitive</span>
              </label>
            </div>
          )}

          {triggerTipo === "comment_no_post" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--color-text)" }}>Código interno dos posts (separados por vírgula)</label>
              <input type="text" value={postIds} onChange={(e) => setPostIds(e.target.value)} placeholder="17891234567, 17898765432" className="wr-input w-full" />
              <p className="mt-1.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>
                Atenção: o Instagram identifica o post por um <strong>código interno</strong>, que <strong>não é</strong> o do link (o <code>Dez9PdFNZq</code> do endereço não serve). Por isso o recomendado é deixar em <strong>“Em qualquer comentário”</strong>.
              </p>
            </div>
          )}
        </div>

        {/* ── Ações ────────────────────────────────────────────── */}
        <div className="wr-card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <p style={sectionLabelStyle}>O que fazer</p>
            <button type="button" onClick={addAcao} className="text-xs font-semibold" style={{ color: "var(--color-accent)" }}>+ Adicionar ação</button>
          </div>

          {acoes.length === 0 && (
            <div className="rounded-[16px] py-8 text-center text-sm" style={{ border: "2px dashed var(--color-border)", color: "var(--color-text-muted)" }}>
              Nenhuma ação. Adicione pelo menos uma.
            </div>
          )}

          <div className="space-y-3">
            {acoes.map((acao, i) => (
              <AcaoEditor key={i} acao={acao} index={i} onChange={(a) => updateAcao(i, a)} onRemove={() => removeAcao(i)} />
            ))}
          </div>
        </div>

        {/* ── Erro ─────────────────────────────────────────────── */}
        {erro && (
          <div className="wr-card p-5" style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)" }}>
            <p className="text-sm font-semibold" style={{ color: "#F87171" }}>{erro}</p>
          </div>
        )}

        {/* ── Botões ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={salvando} className="wr-btn-dark disabled:opacity-50">
            {salvando ? "Salvando…" : "Salvar alterações"}
          </button>
          <Link
            href="/app/instagram/automacoes"
            className="inline-flex h-[44px] items-center rounded-full px-5 text-sm font-semibold transition-colors"
            style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
