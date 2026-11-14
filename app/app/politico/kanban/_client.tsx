"use client";

/**
 * Mobilização — o quadro da base. Pessoas como cards em colunas por nível de
 * relacionamento. O operador move à mão (clique, não arrasta — à prova de criança + celular);
 * o motor de engajamento move sozinho. Puxado pela mesma taxonomia do Disparos.
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { CommandHero } from "@/components/politico/command-hero";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  ArrowSquareOut,
  CaretDown,
  ChartLineUp,
  Clock,
  MapPin,
  UserCircle,
} from "@/lib/ui/icons";
import { moverEtapa } from "@/app/actions/politico/kanban-actions";

export interface CardPessoa {
  contactId: string;
  nome: string;
  source: string | null;
  sourceLabel: string | null;
  grupoNome: string | null;
  grupoCor: string | null;
  cidade: string | null;
  temperatura: string;
  /** Índice de engajamento (0+). ≥20 participante, ≥50 multiplicador — sobe de nível. */
  score: number;
  /** ISO da última mexida no lead (proxy de "última interação"). */
  ultimaInteracao: string | null;
}

export interface ColunaKanban {
  estagio: string;
  label: string;
  cor: string;
  total: number;
  cards: CardPessoa[];
}

export interface GrupoChip {
  nome: string;
  cor: string;
}

interface Props {
  colunas: ColunaKanban[];
  grupos: GrupoChip[];
}

const TEMP_CFG: Record<string, { label: string; cor: string; emoji: string }> = {
  frio: { label: "Frio", cor: "#60A5FA", emoji: "🧊" },
  morno: { label: "Morno", cor: "#FB923C", emoji: "🔥" },
  quente: { label: "Quente", cor: "#F87171", emoji: "⚡" },
};

/** Etapas escondidas quando "só participante pra cima" está ligado (os dois primeiros níveis). */
const ESCONDE_SE_SO_APOIADOR = new Set(["novo_cadastro", "simpatizante"]);

/** "há 3 dias", "hoje", "há 2 sem" — leitura rápida de quem está esfriando. */
function tempoRelativo(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const dias = Math.floor(ms / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  if (dias < 30) { const sem = Math.floor(dias / 7); return `há ${sem} ${sem === 1 ? "semana" : "semanas"}`; }
  if (dias < 365) { const m = Math.floor(dias / 30); return `há ${m} ${m === 1 ? "mês" : "meses"}`; }
  return `há ${Math.floor(dias / 365)} ano${dias < 730 ? "" : "s"}`;
}

/** Dias desde a última interação (pra marcar "esfriando"). */
function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

/** Degraus do engajamento (espelha o motor): o que falta pra pessoa subir. */
/** Quantos cartões cada etapa mostra antes do "Ver mais". */
const CARTOES_POR_ETAPA = 10;
const META_APOIADOR = 20;
const META_MULTIPLICADOR = 50;
function proximoDegrau(score: number): { texto: string; alvo: number } {
  if (score < META_APOIADOR)
    return { texto: `Faltam ${META_APOIADOR - score} pts pra virar Participante`, alvo: META_APOIADOR };
  if (score < META_MULTIPLICADOR)
    return {
      texto: `Faltam ${META_MULTIPLICADOR - score} pts pra virar Multiplicador`,
      alvo: META_MULTIPLICADOR,
    };
  return { texto: "No topo do engajamento 🎉", alvo: META_MULTIPLICADOR };
}

export default function KanbanClient({ colunas, grupos }: Props) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [soApoiador, setSoApoiador] = useState(true);
  const [gruposSel, setGruposSel] = useState<string[]>([]);
  const [tempsSel, setTempsSel] = useState<string[]>([]);
  const [selecionado, setSelecionado] = useState<CardPessoa | null>(null);
  // Celular: a etapa à mostra. Qualquer tela: quantos cartões cada etapa já abriu.
  const [etapaCel, setEtapaCel] = useState<string | null>(null);
  const [abertas, setAbertas] = useState<Record<string, number>>({});

  function alternar(lista: string[], v: string): string[] {
    return lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v];
  }

  function cardPassa(c: CardPessoa): boolean {
    if (gruposSel.length > 0 && (!c.grupoNome || !gruposSel.includes(c.grupoNome))) return false;
    if (tempsSel.length > 0 && !tempsSel.includes(c.temperatura)) return false;
    return true;
  }

  function mover(contactId: string, etapa: string, label: string) {
    iniciar(async () => {
      const r = await moverEtapa(contactId, etapa);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(`Movido para ${label}.`);
      router.refresh();
    });
  }

  const colunasVisiveis = useMemo(
    () => colunas.filter((c) => !(soApoiador && ESCONDE_SE_SO_APOIADOR.has(c.estagio))),
    [colunas, soApoiador],
  );

  // A etapa do celular precisa estar entre as visíveis (o filtro "só participante pra cima" esconde as duas primeiras).
  const etapaNoCelular = colunasVisiveis.some((c) => c.estagio === etapaCel) ? etapaCel : (colunasVisiveis[0]?.estagio ?? null);

  const temPessoas = colunas.some((c) => c.total > 0);

  // Resumo dos níveis: a base num relance. Base = todo mundo; participante+ = quem
  // já participa ou multiplica (a coluna Multiplicador já soma registro antigo de
  // "voto certo" — ver page.tsx); taxa = quanto da base chegou lá.
  const resumo = useMemo(() => {
    const porEtapa = new Map(colunas.map((c) => [c.estagio, c.total]));
    const base = colunas.reduce((s, c) => s + c.total, 0);
    const apoiadorMais = (porEtapa.get("apoiador") ?? 0) + (porEtapa.get("militante") ?? 0);
    return { base, apoiadorMais, taxa: base > 0 ? Math.round((apoiadorMais / base) * 100) : 0, porEtapa };
  }, [colunas]);

  return (
    <div className="gip-ambient-bg min-h-full space-y-5 p-4 md:p-6">
      <CommandHero
        eyebrow="Relacionamento · Mobilização"
        titulo="Mobilização"
        subtitulo="A sua base, etapa por etapa. O sistema move sozinho conforme a pessoa se envolve, e você pode mover à mão quando conhecer alguém."
      />

      {/* Resumo — a base num relance (todos os níveis + quanto já participa) */}
      {temPessoas && (
        <div className="gip-glass flex flex-wrap items-center gap-x-6 gap-y-4 p-4">
          <div>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {resumo.base.toLocaleString("pt-BR")}
            </p>
            <p className="text-xs text-text-subtle">na base</p>
          </div>
          <div className="hidden h-9 w-px bg-white/10 sm:block" />
          {colunas.map((c) => (
            <div key={c.estagio} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.cor }} aria-hidden />
              <div>
                <p className="text-lg font-semibold tabular-nums leading-tight text-foreground">
                  {c.total.toLocaleString("pt-BR")}
                </p>
                <p className="text-[11px] leading-tight text-text-subtle">{c.label}</p>
              </div>
            </div>
          ))}
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold tabular-nums text-accent">{resumo.taxa}%</p>
            <p className="text-xs text-text-subtle">já participam ou multiplicam</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="gip-glass flex flex-wrap items-center gap-x-5 gap-y-3 p-3 sm:p-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={soApoiador}
            onChange={(e) => setSoApoiador(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Só participante pra cima
        </label>

        {grupos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-text-subtle">Grupo:</span>
            {grupos.map((g) => {
              const on = gruposSel.includes(g.nome);
              return (
                <button
                  key={g.nome}
                  type="button"
                  onClick={() => setGruposSel(alternar(gruposSel, g.nome))}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    borderColor: on ? g.cor : "color-mix(in srgb, var(--color-text) 12%, transparent)",
                    background: on ? `color-mix(in srgb, ${g.cor} 18%, transparent)` : "transparent",
                    color: on ? "var(--color-text)" : "var(--color-text-muted)",
                  }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: g.cor }} aria-hidden />
                  {g.nome}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-text-subtle">Temperatura:</span>
          {Object.entries(TEMP_CFG).map(([v, cfg]) => {
            const on = tempsSel.includes(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => setTempsSel(alternar(tempsSel, v))}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                style={{
                  borderColor: on ? cfg.cor : "color-mix(in srgb, var(--color-text) 12%, transparent)",
                  background: on ? `color-mix(in srgb, ${cfg.cor} 18%, transparent)` : "transparent",
                  color: on ? "var(--color-text)" : "var(--color-text-muted)",
                }}
              >
                {cfg.emoji} {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {!temPessoas ? (
        <div className="gip-glass p-8 text-center">
          <p className="text-sm font-medium text-foreground">Ninguém na base ainda.</p>
          <p className="mt-1 text-sm text-text-muted">
            Conforme as pessoas forem entrando e se engajando (palestras, QR, pesquisas, respostas), elas aparecem
            aqui e sobem de etapa sozinhas.
          </p>
        </div>
      ) : (
        <>
        {/* No celular as colunas não cabem lado a lado: mostra UMA etapa, escolhida aqui. */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:hidden" role="tablist" aria-label="Etapa">
          {colunasVisiveis.map((col) => {
            const ativa = col.estagio === etapaNoCelular;
            return (
              <button
                key={col.estagio}
                type="button"
                role="tab"
                aria-selected={ativa}
                onClick={() => setEtapaCel(col.estagio)}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={ativa ? { background: "var(--color-accent)", color: "#16181D" } : { background: "color-mix(in srgb, var(--color-text) 8%, transparent)", color: "var(--color-text-muted)" }}
              >
                {col.label} {col.total.toLocaleString("pt-BR")}
              </button>
            );
          })}
        </div>
        <div className="flex gap-4 pb-2 md:overflow-x-auto">
          {colunasVisiveis.map((col) => {
            const todos = col.cards.filter(cardPassa);
            const limite = abertas[col.estagio] ?? CARTOES_POR_ETAPA;
            const visiveis = todos.slice(0, limite);
            const ocultosPeloCap = Math.max(0, col.total - col.cards.length);
            return (
              <div key={col.estagio} className={`min-w-0 flex-1 basis-0 flex-col md:flex md:min-w-[260px] ${col.estagio === etapaNoCelular ? "flex" : "hidden"}`}>
                {/* Cabeçalho da coluna, na cor da etapa */}
                <div
                  className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2"
                  style={{
                    background: `color-mix(in srgb, ${col.cor} 18%, transparent)`,
                    borderBottom: `2px solid ${col.cor}`,
                  }}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.cor }} aria-hidden />
                  <span className="text-sm font-semibold text-foreground">{col.label}</span>
                  <span className="ml-auto rounded-full bg-white/10 px-2 text-xs font-semibold tabular-nums text-text-muted">
                    {col.total.toLocaleString("pt-BR")}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {visiveis.length === 0 ? (
                    <p className="rounded-xl px-3 py-4 text-center text-xs text-text-subtle" style={{ background: "color-mix(in srgb, var(--color-surface-elevated) 30%, transparent)" }}>
                      Ninguém aqui com esse filtro.
                    </p>
                  ) : (
                    visiveis.map((c) => (
                      <CardView key={c.contactId} card={c} onAbrir={() => setSelecionado(c)} />
                    ))
                  )}
                  {todos.length > visiveis.length && (
                    <button
                      type="button"
                      onClick={() => setAbertas((a) => ({ ...a, [col.estagio]: limite + CARTOES_POR_ETAPA }))}
                      className="rounded-xl px-3 py-2 text-center text-xs font-semibold text-text-muted transition-colors hover:text-foreground"
                      style={{ border: "1px dashed color-mix(in srgb, var(--color-text) 22%, transparent)" }}
                    >
                      Ver mais {Math.min(CARTOES_POR_ETAPA, todos.length - visiveis.length)} de {todos.length - visiveis.length}
                    </button>
                  )}
                  {ocultosPeloCap > 0 && (
                    <p className="px-1 text-center text-[11px] text-text-subtle">
                      + {ocultosPeloCap.toLocaleString("pt-BR")} não exibidos
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      <DetalheDrawer
        card={selecionado}
        colunas={colunas}
        ocupado={ocupado}
        onClose={() => setSelecionado(null)}
        onMover={(etapa, label) => {
          if (selecionado) mover(selecionado.contactId, etapa, label);
          setSelecionado(null);
        }}
      />
    </div>
  );
}

/** Card limpo — nome, de onde veio, engajamento e temperatura. Clica → abre a ficha. */
function CardView({ card, onAbrir }: { card: CardPessoa; onAbrir: () => void }) {
  const temp = TEMP_CFG[card.temperatura] ?? TEMP_CFG.frio!;
  const dias = diasDesde(card.ultimaInteracao);
  const esfriando = dias !== null && dias >= 14 && card.temperatura !== "quente";
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="gip-glass gip-glass-hover w-full p-3 text-left transition-transform hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-semibold text-foreground" title={card.nome}>
          {card.nome}
        </p>
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
          style={{ background: "color-mix(in srgb, var(--color-accent) 16%, transparent)", color: "var(--accent-ink, var(--color-accent))" }}
          title="Índice de engajamento"
        >
          <ChartLineUp size={10} weight="bold" aria-hidden /> {card.score}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted">
        {card.sourceLabel && (
          <span className="inline-flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: card.grupoCor ?? "var(--color-text-subtle)" }}
              aria-hidden
            />
            {card.sourceLabel}
          </span>
        )}
        {card.cidade && <span className="inline-flex items-center gap-0.5">· {card.cidade}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-0.5 font-medium" style={{ color: temp.cor }}>
          {temp.emoji} {temp.label}
        </span>
        {card.ultimaInteracao && (
          <span className={esfriando ? "text-amber-400" : "text-text-subtle"}>
            · {esfriando ? "parado " : ""}
            {tempoRelativo(card.ultimaInteracao)}
          </span>
        )}
      </div>
    </button>
  );
}

/** Painel lateral com a FICHA da pessoa — clica no card e vê tudo + age. */
function DetalheDrawer({
  card,
  colunas,
  ocupado,
  onClose,
  onMover,
}: {
  card: CardPessoa | null;
  colunas: ColunaKanban[];
  ocupado: boolean;
  onClose: () => void;
  onMover: (etapa: string, label: string) => void;
}) {
  const [comoSobe, setComoSobe] = useState(false);
  const temp = card ? (TEMP_CFG[card.temperatura] ?? TEMP_CFG.frio!) : TEMP_CFG.frio!;
  const etapa = card
    ? colunas.find((col) => col.cards.some((x) => x.contactId === card.contactId))
    : undefined;
  const dias = card ? diasDesde(card.ultimaInteracao) : null;
  const esfriando = dias !== null && dias >= 14 && card?.temperatura !== "quente";
  const degrau = card ? proximoDegrau(card.score) : null;
  // Barra na escala da RÉGUA (0 → Multiplicador 50): os marcos viram a classificação visível.
  const pctBarra = card ? Math.min(100, Math.round((card.score / META_MULTIPLICADOR) * 100)) : 0;

  return (
    <Sheet open={!!card} onOpenChange={(aberto) => !aberto && onClose()}>
      <SheetContent side="right" className="gip-glass w-full overflow-y-auto border-l border-white/10 sm:max-w-md">
        {card && (
          <>
            <SheetHeader className="space-y-3 text-left">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "color-mix(in srgb, var(--color-accent) 16%, transparent)" }}
                >
                  <UserCircle size={26} weight="fill" className="text-accent" aria-hidden />
                </span>
                <SheetTitle className="text-xl font-bold text-foreground">{card.nome}</SheetTitle>
              </div>
              <div className="flex flex-wrap gap-2">
                {etapa && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ background: `color-mix(in srgb, ${etapa.cor} 20%, transparent)`, color: "var(--color-text)" }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: etapa.cor }} aria-hidden />
                    {etapa.label}
                  </span>
                )}
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{ background: `color-mix(in srgb, ${temp.cor} 20%, transparent)`, color: "var(--color-text)" }}
                >
                  {temp.emoji} {temp.label}
                </span>
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              {/* De onde veio */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">De onde veio</h3>
                <div className="space-y-1.5 text-sm text-foreground">
                  <p className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: card.grupoCor ?? "var(--color-text-subtle)" }}
                      aria-hidden
                    />
                    {card.sourceLabel ?? "Origem não informada"}
                    {card.grupoNome && <span className="text-text-subtle">· {card.grupoNome}</span>}
                  </p>
                  {card.cidade && (
                    <p className="flex items-center gap-2 text-text-muted">
                      <MapPin size={15} aria-hidden /> {card.cidade}
                    </p>
                  )}
                </div>
              </section>

              {/* Engajamento — a nota + a RÉGUA visível (marcos) + "como sobe" */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Engajamento</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums text-foreground">{card.score}</span>
                  <span className="text-sm text-text-muted">pontos</span>
                </div>
                {/* Barra com os marcos da régua (5 · 20 · 50) desenhados por cima */}
                <div className="relative h-2.5 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(pctBarra, 2)}%`, background: "var(--color-accent)" }} />
                  {[
                    [5, "10%"],
                    [20, "40%"],
                  ].map(([, left]) => (
                    <span
                      key={left as string}
                      className="absolute top-0 h-full w-px bg-white/30"
                      style={{ left: left as string }}
                      aria-hidden
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-text-subtle">
                  <span>Em conversa 5</span>
                  <span>Participante 20</span>
                  <span>Multiplicador 50</span>
                </div>
                {degrau && <p className="text-xs text-text-muted">{degrau.texto}</p>}
                <button
                  type="button"
                  onClick={() => setComoSobe((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:underline"
                >
                  Como sobe a nota?{" "}
                  <CaretDown
                    size={11}
                    weight="bold"
                    aria-hidden
                    className={`transition-transform ${comoSobe ? "rotate-180" : ""}`}
                  />
                </button>
                {comoSobe && (
                  <div className="mt-1 space-y-2.5 rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--color-text) 5%, transparent)" }}>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-text-subtle">
                      O que a pessoa faz conta pontos
                    </p>
                    <div className="space-y-2">
                      {[
                        { acao: "Indicar alguém que se cadastra", obs: "por pessoa", pts: "+10" },
                        { acao: "Autorizar continuar recebendo", obs: null, pts: "+10" },
                        { acao: "Cadastrar pelo QR", obs: null, pts: "+6" },
                        { acao: "Responder uma mensagem", obs: "vale muito mais que receber", pts: "+5" },
                        { acao: "Receber um material", obs: "sozinho não faz subir de etapa", pts: "+1" },
                      ].map((r) => (
                        <div key={r.acao} className="flex items-center gap-3">
                          <span className="flex-1 text-[12.5px] leading-snug text-foreground">
                            {r.acao}
                            {r.obs && <span className="block text-[11px] text-text-subtle">{r.obs}</span>}
                          </span>
                          <span
                            className="shrink-0 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums"
                            style={{ background: "color-mix(in srgb, var(--color-accent) 16%, transparent)", color: "var(--accent-ink, var(--color-accent))" }}
                          >
                            {r.pts}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div
                      className="flex items-start gap-2 rounded-lg p-2.5"
                      style={{ background: "color-mix(in srgb, var(--color-accent) 13%, transparent)" }}
                    >
                      <span className="text-sm leading-none" aria-hidden>⭐</span>
                      <span className="text-[12.5px] leading-snug text-foreground">
                        Quem traz <strong>3 pessoas</strong> vira <strong>Multiplicador</strong> na hora — é o ouro da base.
                      </span>
                    </div>
                  </div>
                )}
              </section>

              {/* Atividade */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">Atividade</h3>
                <p className={`flex items-center gap-2 text-sm ${esfriando ? "text-amber-400" : "text-foreground"}`}>
                  <Clock size={15} aria-hidden />
                  {card.ultimaInteracao
                    ? `Última interação ${tempoRelativo(card.ultimaInteracao)}`
                    : "Sem interação registrada"}
                </p>
                {esfriando && (
                  <p className="text-xs text-amber-400/90">Está esfriando — vale um toque pra reativar.</p>
                )}
              </section>

              {/* Ações */}
              <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={ocupado}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      Mover de etapa <CaretDown size={13} weight="bold" aria-hidden />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {colunas
                      .filter((col) => col.estagio !== etapa?.estagio)
                      .map((col) => (
                        <DropdownMenuItem key={col.estagio} onSelect={() => onMover(col.estagio, col.label)}>
                          <span className="mr-2 h-2 w-2 rounded-full" style={{ background: col.cor }} aria-hidden />
                          {col.label}
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Link
                  href={`/app/contacts/${card.contactId}`}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/12 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-white/5"
                >
                  Abrir ficha completa <ArrowSquareOut size={15} aria-hidden />
                </Link>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
