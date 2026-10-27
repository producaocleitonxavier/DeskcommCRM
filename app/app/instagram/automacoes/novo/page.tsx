/**
 * /app/instagram/automacoes/novo — Criação de novo flow de automação Instagram (War Room 2.0)
 *
 * Formulário completo para criar um flow de automação: trigger + lista de ações.
 * Arquitetura ManyChat: trigger dispara, ações executam em ordem, first-match wins.
 *
 * Acesso: admin (gate no layout). Visual: padrão War Room dark (CommandHero +
 * wr-input + tokens de tema).
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { CommandHero } from "@/components/politico/command-hero";
import SeletorPosts from "../_seletor-posts";

export const dynamic = "force-dynamic";

// ── Tipos ──────────────────────────────────────────────────────────────────────

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

// ── Labels ─────────────────────────────────────────────────────────────────────

// SÓ os gatilhos que o Instagram realmente entrega por webhook e que o nosso
// motor trata (ver lib/ig-automacoes/motor.handler.ts). "Novo seguidor" e
// "Palavra-chave em DM" foram removidos: o IG não envia webhook de follow (é um
// beta fechado do Meta via parceiro) e o handler de DM por palavra-chave ainda
// não existe — virariam flow morto.
// Quando a automação dispara — em linguagem de pessoa, não de motor. A opção
// recomendada ("em qualquer comentário") vem primeiro e é o padrão: é o que a
// captação usa e o que mais traz gente.
const TRIGGER_OPTIONS: { value: TriggerTipo; label: string; descricao: string }[] = [
  { value: "novo_comentario", label: "Em qualquer comentário (recomendado)", descricao: "Responde quem comentar em qualquer post ou reel seu. É o modo da captação — o que mais traz gente." },
  { value: "comment_keyword", label: "Só quando o comentário tiver uma palavra", descricao: "Responde só quando o comentário contém uma palavra que você escolher (ex.: EU QUERO)." },
  { value: "comment_no_post", label: "Só nos vídeos que eu escolher", descricao: "Você clica nos vídeos que terão a automação (os sensíveis ficam de fora). Mais seguro e mais controle." },
  { value: "story_reply", label: "Quando responderem seu Story", descricao: "Dispara quando alguém responde um Story seu." },
];

// O que a automação FAZ. A "Captação completa" vem primeiro e já faz tudo (responde
// o comentário + chama no Direct + pergunta cidade/WhatsApp + joga no Kanban), então
// o cliente não precisa montar nada. As demais são peças soltas, pra casos avançados.
// Só o que o cliente entende e usa. A "Captação completa" já faz tudo (responde +
// Direct + pergunta cidade/WhatsApp + Kanban + funil), então as peças soltas de CRM
// (etiqueta, criar contato, avisar equipe, classificar funil) saíram do menu — eram
// jargão do motor e só confundiam (regra de ouro).
const ACAO_OPTIONS: { value: AcaoTipo; label: string; descricao: string }[] = [
  { value: "captar_instagram", label: "Captação completa (recomendado)", descricao: "Faz tudo sozinho: responde o comentário em público, chama a pessoa no Direct, pergunta de onde ela é (estado/cidade/bairro) e o WhatsApp, e coloca no Kanban. É o recomendado — não precisa de mais nada." },
  { value: "enviar_dm", label: "Só chamar no Direct (sem pesquisa)", descricao: "Manda só uma mensagem no Direct pra quem comentou, sem perguntar cidade nem WhatsApp. Use se não quiser o funil completo." },
  { value: "responder_comentario", label: "Só responder o comentário", descricao: "Responde só em público, embaixo do comentário — sem chamar no Direct." },
];

const NIVEIS_FUNIL = ["Simpatizante", "Apoiador", "Embaixador"];

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--color-text-subtle)",
  letterSpacing: ".08em",
  textTransform: "uppercase" as const,
};

// ── Componente de ação ─────────────────────────────────────────────────────────

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
          placeholder="Texto da mensagem (use {{username}} e {{comentario}})"
          rows={3}
          className="wr-input w-full resize-none"
        />
      )}

      {acao.tipo === "add_etiqueta" && (
        <input
          type="text"
          value={acao.etiqueta ?? ""}
          onChange={(e) => onChange({ ...acao, etiqueta: e.target.value })}
          placeholder="Nome da etiqueta (ex: Lead Quente)"
          className="wr-input w-full"
        />
      )}

      {acao.tipo === "notificar_equipe" && (
        <input
          type="text"
          value={acao.mensagem ?? ""}
          onChange={(e) => onChange({ ...acao, mensagem: e.target.value })}
          placeholder="Mensagem para a equipe (use {{username}} e {{comentario}})"
          className="wr-input w-full"
        />
      )}

      {acao.tipo === "add_funil_politico" && (
        <select value={acao.nivel ?? "Simpatizante"} onChange={(e) => onChange({ ...acao, nivel: e.target.value })} className="wr-input w-full">
          {NIVEIS_FUNIL.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function NovoFlowPage() {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [triggerTipo, setTriggerTipo] = useState<TriggerTipo>("novo_comentario");
  const [keywords, setKeywords] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [postIds, setPostIds] = useState("");
  const [acoes, setAcoes] = useState<AcaoConfig[]>([{ tipo: "captar_instagram" }]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const triggerInfo = TRIGGER_OPTIONS.find((o) => o.value === triggerTipo);

  function addAcao() {
    setAcoes((prev) => [...prev, { tipo: "responder_comentario" }]);
  }
  function updateAcao(i: number, acao: AcaoConfig) {
    setAcoes((prev) => prev.map((a, idx) => (idx === i ? acao : a)));
  }
  function removeAcao(i: number) {
    setAcoes((prev) => prev.filter((_, idx) => idx !== i));
  }

  function buildTriggerConfig() {
    const cfg: Record<string, unknown> = {};
    if (triggerTipo === "comment_keyword" || triggerTipo === "dm_keyword") {
      cfg.keywords = keywords.split(",").map((k) => k.trim()).filter(Boolean);
      cfg.case_sensitive = caseSensitive;
    }
    if (triggerTipo === "comment_no_post") {
      cfg.post_ids = postIds.split(",").map((p) => p.trim()).filter(Boolean);
      cfg.lista_exata = true; // allowlist: vazio = não dispara em nada (trava de segurança)
    }
    return cfg;
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
      trigger_tipo: triggerTipo,
      trigger_config: buildTriggerConfig(),
      acoes,
      ativo: true,
    };

    setSalvando(true);
    try {
      const res = await fetch("/api/v1/ig-automation-flows", {
        method: "POST",
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

  return (
    <div className="mx-auto max-w-[720px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Instagram · Automações"
        titulo="Nova automação"
        subtitulo="Escolha quando ela dispara e o que faz. Já vem no modo recomendado — se quiser, é só salvar."
        acoes={[{ href: "/app/instagram/automacoes", label: "← Voltar" }]}
      />

      <form onSubmit={salvar} className="space-y-[18px]">
        {/* ── Identificação ────────────────────────────────────── */}
        <div className="wr-card space-y-4 p-5">
          <p style={sectionLabelStyle}>Identificação</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--color-text)" }}>Nome (só pra você lembrar) *</label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder='Ex.: "Captação Instagram"'
                required
                className="wr-input w-full"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--color-text)" }}>Descrição (opcional)</label>
              <input
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Explique rapidinho o que esta automação faz"
                className="wr-input w-full"
              />
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
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="INFO, quero saber, saiba mais"
                  className="wr-input w-full"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="rounded" />
                <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>Case sensitive (diferencia maiúsculas)</span>
              </label>
            </div>
          )}

          {triggerTipo === "comment_no_post" && (
            <SeletorPosts
              selecionados={postIds.split(",").map((p) => p.trim()).filter(Boolean)}
              onChange={(ids) => setPostIds(ids.join(","))}
            />
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

          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            Com a <strong>Captação completa</strong> você não precisa de mais nada — ela já responde o comentário e chama no Direct. Se adicionar outras, elas rodam em ordem.
          </p>
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
            {salvando ? "Salvando…" : "Criar automação"}
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
