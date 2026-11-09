"use client";

/**
 * Multiplicadores — quem divulga pra você. REDESENHO (09/nov, com o time): placar
 * à prova de criança. Hierarquia = (1) resumo em NÚMEROS (bater o olho) → (2) duas
 * AÇÕES lado a lado (espalhar / convidar) → (3) o PLACAR (Assessores × Divulgadores,
 * o centro) → (4) explicação e config RECOLHIDAS (como funciona / número dedicado).
 * Medimos o ALCANCE gerado (não acusamos "não divulgou" — a rede dele pode ser pequena).
 */

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { CommandHero } from "@/components/politico/command-hero";
import { Button } from "@/components/ui/button";
import {
  CaretDown,
  ChartLineUp,
  CheckCircle,
  Gear,
  MagnifyingGlass,
  Megaphone,
  PaperPlaneTilt,
  Plus,
  Question,
  Trash,
  Trophy,
  UserCircle,
  UsersThree,
} from "@/lib/ui/icons";
import {
  adicionarMultiplicador,
  removerMultiplicador,
  buscarContatosParaMarcar,
  type ContatoParaMarcar,
} from "@/app/actions/politico/multiplicadores-actions";
import {
  enviarVideoAosMultiplicadores,
  type VideoDaBiblioteca,
  type GrupoMultiplicador,
} from "@/app/actions/politico/multiplicadores-envio-actions";
import { convidarDivulgadores } from "@/app/actions/politico/divulgador-actions";
import {
  definirCanalMultiplicadores,
  type CanalDisponivel,
} from "@/app/actions/politico/multiplicadores-canal-actions";
import type { MultiplicadorRow, SugestaoMultiplicador } from "@/lib/politico/multiplicadores";

/** "há 3 dias", "hoje", "há 2 sem" — leitura rápida de recência. */
function tempoRelativo(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const dias = Math.floor(ms / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  if (dias < 30) return `há ${Math.floor(dias / 7)} sem`;
  if (dias < 365) return `há ${Math.floor(dias / 30)} meses`;
  return `há ${Math.floor(dias / 365)} ano${dias < 730 ? "" : "s"}`;
}

interface Props {
  multiplicadores: MultiplicadorRow[];
  sugestoes: SugestaoMultiplicador[];
  videos: VideoDaBiblioteca[];
  elegiveis: number;
  potenciais: number;
  canais: CanalDisponivel[];
  canalAtual: string | null;
}

export default function MultiplicadoresClient({
  multiplicadores,
  sugestoes,
  videos,
  elegiveis,
  potenciais,
  canais,
  canalAtual,
}: Props) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ContatoParaMarcar[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [videoSel, setVideoSel] = useState("");
  const [grupoSel, setGrupoSel] = useState<GrupoMultiplicador>("todos");
  const [enviando, setEnviando] = useState(false);
  const [convidando, setConvidando] = useState(false);
  const [canalSel, setCanalSel] = useState(canalAtual ?? "");
  // Recolhidos por padrão (à prova de criança: só aparece quando a pessoa pede).
  const [verComo, setVerComo] = useState(false);
  const [verPrevia, setVerPrevia] = useState(false);
  const [verBusca, setVerBusca] = useState(false);
  const [verAvancado, setVerAvancado] = useState(false);

  const assessores = multiplicadores.filter((m) => m.tipo === "assessor");
  const divulgadores = multiplicadores.filter((m) => m.tipo === "divulgador");

  // Resumo em números (bater o olho): total, quantos JÁ espalham, alcance e trazidos.
  const total = multiplicadores.length;
  const espalhando = multiplicadores.filter((m) => m.compartilhou).length;
  const alcanceTotal = multiplicadores.reduce((s, m) => s + (m.alcancou || 0), 0);
  const trouxeTotal = multiplicadores.reduce((s, m) => s + (m.trouxe || 0), 0);
  // Quantos recebem o conteúdo, conforme o GRUPO escolhido (o botão mostra esse nº).
  const alvoCount =
    grupoSel === "assessor" ? assessores.length : grupoSel === "divulgador" ? divulgadores.length : total;

  function onSalvarCanal(valor: string) {
    setCanalSel(valor);
    iniciar(async () => {
      const r = await definirCanalMultiplicadores(valor || null);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(valor ? "Número dos multiplicadores definido." : "Voltou pro automático.");
      router.refresh();
    });
  }

  function onConvidar() {
    setConvidando(true);
    iniciar(async () => {
      try {
        const r = await convidarDivulgadores();
        if (!r.ok) {
          toast.error(r.erro);
          return;
        }
        const base = `Convite enviado para ${r.convidados} de ${r.total} apoiador${r.total === 1 ? "" : "es"}.`;
        if (r.pulados.length > 0) toast.warning(`${base} ${r.pulados.length} pulado(s).`);
        else toast.success(base);
        router.refresh();
      } finally {
        setConvidando(false);
      }
    });
  }

  function onEnviarVideo() {
    if (!videoSel) {
      toast.error("Escolha um vídeo primeiro.");
      return;
    }
    setEnviando(true);
    iniciar(async () => {
      try {
        const r = await enviarVideoAosMultiplicadores(videoSel, grupoSel);
        if (!r.ok) {
          toast.error(r.erro);
          return;
        }
        const base = `Enviado para ${r.enviados} de ${r.total} multiplicador${r.total === 1 ? "" : "es"}.`;
        if (r.pulados.length > 0)
          toast.warning(
            `${base} ${r.pulados.length} pulado(s): ${r.pulados
              .map((p) => `${p.nome} (${p.motivo})`)
              .slice(0, 3)
              .join(", ")}${r.pulados.length > 3 ? "…" : ""}`,
          );
        else toast.success(base);
        router.refresh();
      } finally {
        setEnviando(false);
      }
    });
  }

  function rodar(p: Promise<{ ok: boolean; erro?: string }>, okMsg?: string) {
    iniciar(async () => {
      const r = await p;
      if (!r.ok) {
        toast.error(r.erro ?? "Não foi possível concluir.");
        return;
      }
      if (okMsg) toast.success(okMsg);
      setResultados([]);
      setBusca("");
      router.refresh();
    });
  }

  async function onBuscar(v: string) {
    setBusca(v);
    if (v.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    try {
      setResultados(await buscarContatosParaMarcar(v));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="gip-ambient-bg min-h-full space-y-5 p-4 md:p-6">
      <CommandHero
        eyebrow="OPERAÇÃO · CAMPANHA"
        titulo="Multiplicadores"
        subtitulo="Quem está espalhando o seu conteúdo — e quem ainda não."
        extra={
          <button
            type="button"
            onClick={() => setVerComo((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-white/85 transition-colors hover:bg-white/10"
          >
            <Question size={15} weight="bold" aria-hidden /> Como funciona?
          </button>
        }
      />

      {/* Como funciona — RECOLHIDO (abre pelo botão do hero) */}
      {verComo && (
        <div className="gip-glass p-4 text-[13px] leading-relaxed text-text-muted">
          <strong className="text-foreground">Multiplicador</strong> é quem traz gente pra você. Há duas formas de
          virar — <strong className="text-foreground">o sistema conta sozinho</strong>:
          <ul className="mt-2 space-y-1.5">
            <li className="flex gap-2">
              <span className="font-bold text-accent">①</span>
              <span>
                <strong className="text-foreground">Indica</strong> alguém que se cadastra (pelo código/QR pessoal) —
                é <span className="text-foreground">o ouro</span>: vira cadastro na base.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-accent">②</span>
              <span>
                <strong className="text-foreground">Compartilha o link pessoal</strong> de um vídeo e a rede abre —
                cada abertura conta como <span className="text-foreground">alcance dele</span>.
              </span>
            </li>
          </ul>
        </div>
      )}

      {/* ── RESUMO EM NÚMEROS (bater o olho) ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi icon={<UsersThree size={22} weight="fill" aria-hidden />} valor={total} rotulo="Multiplicadores" />
        <Kpi
          icon={<CheckCircle size={22} weight="fill" aria-hidden />}
          valor={espalhando}
          rotulo="Já espalhando"
          sub={total > 0 ? `de ${total}` : undefined}
          cor="#34D399"
        />
        <Kpi icon={<ChartLineUp size={22} weight="bold" aria-hidden />} valor={alcanceTotal} rotulo="Alcance gerado" />
        <Kpi
          icon={<Trophy size={22} weight="fill" aria-hidden />}
          valor={trouxeTotal}
          rotulo="Cadastros trazidos"
          destaque
        />
      </div>

      {/* ── DUAS AÇÕES, LADO A LADO ──────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Espalhar um conteúdo */}
        <div className="gip-glass flex flex-col p-4">
          <div className="mb-1 flex items-center gap-2">
            <PaperPlaneTilt size={18} weight="bold" className="text-accent" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Espalhar um conteúdo</h2>
          </div>
          <p className="mb-3 text-[13px] leading-snug text-text-muted">
            Manda, no privado de cada um, o <strong className="font-semibold text-foreground">link pessoal dele</strong>{" "}
            pra compartilhar. Cada abertura vira alcance dele.
          </p>
          {videos.length === 0 ? (
            <p className="rounded-xl px-3 py-4 text-center text-[13px] text-text-subtle"
              style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)" }}>
              Nenhum post do Instagram na biblioteca ainda. Adicione um na Biblioteca de Materiais.
            </p>
          ) : (
            <div className="mt-auto space-y-2.5">
              {/* Para QUEM vai — escolhe o GRUPO, não as pessoas (obrigação do assessor
                  × exclusivo do divulgador). Single-select = exclusivo. */}
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-subtle">Enviar para</p>
                <div
                  className="flex gap-0.5 rounded-full p-0.5 text-[12px] font-semibold"
                  style={{ background: "color-mix(in srgb, var(--color-text) 6%, transparent)" }}
                >
                  {([
                    { v: "todos", t: "Todos", n: total },
                    { v: "assessor", t: "Assessores", n: assessores.length },
                    { v: "divulgador", t: "Divulgadores", n: divulgadores.length },
                  ] as const).map((g) => {
                    const ativo = grupoSel === g.v;
                    return (
                      <button
                        key={g.v}
                        type="button"
                        onClick={() => setGrupoSel(g.v)}
                        className="flex-1 rounded-full px-2 py-1.5 transition-colors"
                        style={
                          ativo
                            ? {
                                background: "color-mix(in srgb, var(--color-accent) 20%, transparent)",
                                color: "var(--accent-ink, var(--color-accent))",
                              }
                            : { color: "var(--color-text-muted)" }
                        }
                      >
                        {g.t} <span className="tabular-nums opacity-70">{g.n}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <select
                className="wr-input w-full"
                value={videoSel}
                onChange={(e) => setVideoSel(e.target.value)}
              >
                <option value="">Escolha um conteúdo do Instagram…</option>
                {videos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.titulo}
                  </option>
                ))}
              </select>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setVerPrevia((v) => !v)}
                  disabled={!videoSel}
                  className="text-[12px] font-medium text-text-subtle underline-offset-2 hover:underline disabled:opacity-40"
                >
                  {verPrevia ? "ocultar prévia" : "ver prévia da mensagem"}
                </button>
                <Button
                  onClick={onEnviarVideo}
                  disabled={ocupado || enviando || !videoSel || alvoCount === 0}
                >
                  <PaperPlaneTilt size={15} weight="bold" aria-hidden />
                  Enviar aos {alvoCount}
                </Button>
              </div>
              {verPrevia && videoSel && (
                <div
                  className="rounded-xl p-3 text-[12.5px]"
                  style={{ background: "color-mix(in srgb, var(--color-text) 5%, transparent)" }}
                >
                  <p className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-text-subtle">
                    Vão 2 mensagens — ele só encaminha o link
                  </p>
                  <p className="whitespace-pre-line text-foreground">
                    {"Olá, [nome]! 👋 Saiu um conteúdo novo do nosso mandato.\n\nÉ só encaminhar a mensagem abaixo 👇 pra sua rede.\n\nObrigado por multiplicar! 🙏"}
                  </p>
                  <p className="mb-1 mt-2 text-[10.5px] text-text-subtle">↓ 2ª mensagem (o que ele encaminha):</p>
                  <p
                    className="rounded-lg px-2 py-1 font-medium text-foreground"
                    style={{ background: "color-mix(in srgb, var(--color-accent) 12%, transparent)" }}
                  >
                    [link do vídeo dele]
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Convidar apoiadores a divulgar */}
        <div className="gip-glass flex flex-col p-4">
          <div className="mb-1 flex items-center gap-2">
            <Megaphone size={18} weight="bold" className="text-accent" aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Convidar apoiadores</h2>
          </div>
          <p className="mb-3 text-[13px] leading-snug text-text-muted">
            O sistema convida seus <strong className="font-semibold text-foreground">apoiadores</strong> a espalhar.
            Quem responde <strong className="font-semibold text-foreground">SIM</strong> vira divulgador sozinho.
          </p>
          <div className="mt-auto">
            {elegiveis === 0 ? (
              <p className="rounded-xl px-3 py-4 text-center text-[13px] text-text-subtle"
                style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)" }}>
                Ninguém elegível agora. Conforme as pessoas viram apoiadores, aparecem aqui pra convidar.
              </p>
            ) : (
              <>
                <Button onClick={onConvidar} disabled={ocupado || convidando}>
                  <Megaphone size={15} weight="bold" aria-hidden />
                  Convidar {elegiveis} apoiador{elegiveis === 1 ? "" : "es"}
                </Button>
                {potenciais > 0 && (
                  <p className="mt-2 text-[12px] font-medium text-accent">
                    ⭐ {potenciais} potencial{potenciais === 1 ? "" : "is"} —{" "}
                    {potenciais === 1 ? "convidado" : "convidados"} primeiro.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Nota de segurança — UMA vez, discreta */}
      <p className="text-[11.5px] text-text-subtle">
        🔒 Antes do go-live, só os números de teste recebem de fato — a trava de segurança continua valendo.
      </p>

      {/* ── O PLACAR (o centro) ──────────────────────────────────────────── */}
      <SecaoPlacar
        titulo="Assessores"
        subtitulo="Sua equipe e lideranças — marcados por você."
        vazio="Nenhum assessor marcado ainda. Clique em “Marcar alguém” pra adicionar."
        linhas={assessores}
        ocupado={ocupado}
        onRemover={(id) => rodar(removerMultiplicador(id), "Removido da lista.")}
        acaoHeader={
          <button
            type="button"
            onClick={() => setVerBusca((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-accent transition-colors hover:bg-white/10"
          >
            <Plus size={13} weight="bold" aria-hidden /> Marcar alguém
          </button>
        }
      >
        {verBusca && (
          <div className="mb-3 space-y-2 rounded-xl p-3"
            style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)" }}>
            <div className="relative">
              <MagnifyingGlass
                size={16}
                weight="bold"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
                aria-hidden
              />
              <input
                className="wr-input pl-9"
                placeholder="Busque por nome ou telefone…"
                value={busca}
                onChange={(e) => onBuscar(e.target.value)}
              />
            </div>
            {busca.trim().length >= 2 &&
              (buscando ? (
                <p className="text-sm text-text-subtle">Buscando…</p>
              ) : resultados.length === 0 ? (
                <p className="text-sm text-text-subtle">Ninguém novo com esse nome.</p>
              ) : (
                <div className="space-y-1.5">
                  {resultados.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 rounded-xl px-3 py-2"
                      style={{ background: "color-mix(in srgb, var(--color-surface-elevated) 50%, transparent)" }}
                    >
                      <UserCircle size={20} weight="fill" className="shrink-0 text-text-subtle" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {c.nome}
                        {c.telefone && <span className="text-text-subtle"> · {c.telefone}</span>}
                      </span>
                      <Button
                        size="sm"
                        disabled={ocupado}
                        onClick={() => rodar(adicionarMultiplicador(c.id), `${c.nome} agora é multiplicador.`)}
                      >
                        <Plus size={14} weight="bold" aria-hidden /> Marcar
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
            {sugestoes.length > 0 && (
              <div className="space-y-1.5 border-t border-white/10 pt-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-text-subtle">
                  Sugeridos — já trouxeram ou alcançaram gente
                </p>
                {sugestoes.map((s) => (
                  <div
                    key={s.contactId}
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                    style={{ background: "color-mix(in srgb, var(--color-surface-elevated) 50%, transparent)" }}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {s.nome}
                      {(s.trouxe > 0 || s.alcancou > 0) && (
                        <span className="text-text-subtle">
                          {" · "}
                          {s.trouxe > 0 ? `trouxe ${s.trouxe}` : ""}
                          {s.trouxe > 0 && s.alcancou > 0 ? " · " : ""}
                          {s.alcancou > 0 ? `alcançou ${s.alcancou}` : ""}
                        </span>
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={ocupado}
                      onClick={() => rodar(adicionarMultiplicador(s.contactId), `${s.nome} agora é multiplicador.`)}
                    >
                      <Plus size={14} weight="bold" aria-hidden /> Marcar
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SecaoPlacar>

      <SecaoPlacar
        titulo="Divulgadores"
        subtitulo="Apoiadores que aceitaram o convite (responderam SIM)."
        vazio="Nenhum divulgador ainda — eles entram pelo convite acima."
        linhas={divulgadores}
        ocupado={ocupado}
        onRemover={(id) => rodar(removerMultiplicador(id), "Removido da lista.")}
      />

      {/* ── AVANÇADO — número dedicado (recolhido) ───────────────────────── */}
      <div className="gip-glass overflow-hidden">
        <button
          type="button"
          onClick={() => setVerAvancado((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-[13px] font-medium text-text-muted">
            <Gear size={16} weight="bold" aria-hidden /> Avançado — número de disparo
          </span>
          <CaretDown
            size={16}
            weight="bold"
            className="text-text-subtle transition-transform"
            style={{ transform: verAvancado ? "rotate(180deg)" : "none" }}
            aria-hidden
          />
        </button>
        {verAvancado && (
          <div className="border-t border-white/10 px-4 py-3">
            <p className="mb-2 text-[12.5px] leading-snug text-text-muted">
              Separe o disparo dos multiplicadores num número dedicado pra não arriscar o número do gabinete (quando
              você tiver um 2º número). Por ora, deixe no automático.
            </p>
            <select
              className="wr-input w-full sm:w-80"
              value={canalSel}
              disabled={ocupado}
              onChange={(e) => onSalvarCanal(e.target.value)}
            >
              <option value="">Automático (o mesmo do atendimento)</option>
              {canais.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

/** Tile de número do resumo — grande, bater o olho (dataviz à prova de criança). */
function Kpi({
  icon,
  valor,
  rotulo,
  sub,
  cor,
  destaque,
}: {
  icon: ReactNode;
  valor: number;
  rotulo: string;
  sub?: string;
  cor?: string;
  destaque?: boolean;
}) {
  return (
    <div className="gip-glass flex items-center gap-3 p-3.5">
      <div
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
        style={{
          background: `color-mix(in srgb, ${destaque ? "var(--color-accent)" : cor ?? "var(--color-text)"} 14%, transparent)`,
          color: destaque ? "var(--accent-ink, var(--color-accent))" : cor ?? "var(--color-text-muted)",
        }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p
          className="text-2xl font-bold leading-none tabular-nums text-foreground"
          style={cor ? { color: cor } : undefined}
        >
          {valor}
        </p>
        <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wide text-text-subtle">
          {rotulo}
          {sub && <span className="ml-1 normal-case tracking-normal text-text-muted">{sub}</span>}
        </p>
      </div>
    </div>
  );
}

/** Uma seção do placar (Assessores OU Divulgadores) — mesmo render de linha. */
function SecaoPlacar({
  titulo,
  subtitulo,
  vazio,
  linhas,
  ocupado,
  onRemover,
  acaoHeader,
  children,
}: {
  titulo: string;
  subtitulo: string;
  vazio: string;
  linhas: MultiplicadorRow[];
  ocupado: boolean;
  onRemover: (contactId: string) => void;
  acaoHeader?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="gip-glass p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
          <span className="rounded-full bg-white/10 px-2 text-xs font-semibold tabular-nums text-text-muted">
            {linhas.length}
          </span>
        </div>
        {acaoHeader}
      </div>
      <p className="mb-3 text-[13px] text-text-muted">{subtitulo}</p>
      {children}
      {linhas.length === 0 ? (
        <p className="rounded-xl px-3 py-5 text-center text-sm text-text-subtle">{vazio}</p>
      ) : (
        <ol className="space-y-2">
          {linhas.map((m) => (
            <LinhaMultiplicador key={m.contactId} m={m} ocupado={ocupado} onRemover={onRemover} />
          ))}
        </ol>
      )}
    </div>
  );
}

function LinhaMultiplicador({
  m,
  ocupado,
  onRemover,
}: {
  m: MultiplicadorRow;
  ocupado: boolean;
  onRemover: (contactId: string) => void;
}) {
  const quando = tempoRelativo(m.ultimaAtividadeISO);
  return (
    <li
      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
      style={{ background: "color-mix(in srgb, var(--color-surface-elevated) 45%, transparent)" }}
    >
      <UserCircle size={22} weight="fill" className="shrink-0 text-text-subtle" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{m.nome}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted">
          {m.trouxe > 0 && <span className="font-semibold text-accent">trouxe {m.trouxe}</span>}
          {m.alcancou > 0 && <span>alcançou {m.alcancou}</span>}
          {m.recebeuLink && <span className="text-text-subtle">· recebeu o link ✓</span>}
          {quando && <span className="text-text-subtle">· ativo {quando}</span>}
        </div>
      </div>
      {m.compartilhou ? (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: "color-mix(in srgb, #34D399 20%, transparent)", color: "#34D399" }}
        >
          <CheckCircle size={12} weight="fill" aria-hidden /> Gerou alcance
        </span>
      ) : (
        <span
          className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: "color-mix(in srgb, #FBBF24 18%, transparent)", color: "#FBBF24" }}
        >
          Sem alcance ainda
        </span>
      )}
      <button
        type="button"
        disabled={ocupado}
        onClick={() => onRemover(m.contactId)}
        className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-destructive/15 hover:text-destructive"
        title="Remover da lista de multiplicadores"
      >
        <Trash size={16} aria-hidden />
      </button>
    </li>
  );
}
