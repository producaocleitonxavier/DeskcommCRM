"use client";

/**
 * Mobilização — o quadro de campanha. Pessoas como cards em colunas por etapa do
 * funil. O operador move à mão (clique, não arrasta — à prova de criança + celular);
 * o motor de engajamento move sozinho. Puxado pela mesma taxonomia do Disparos.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { CommandHero } from "@/components/politico/command-hero";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CaretDown } from "@/lib/ui/icons";
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

/** Etapas escondidas quando "só apoiador+" está ligado (topo do funil). */
const ESCONDE_SE_SO_APOIADOR = new Set(["novo_cadastro", "simpatizante"]);

export default function KanbanClient({ colunas, grupos }: Props) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [soApoiador, setSoApoiador] = useState(true);
  const [gruposSel, setGruposSel] = useState<string[]>([]);
  const [tempsSel, setTempsSel] = useState<string[]>([]);

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

  const temPessoas = colunas.some((c) => c.total > 0);

  return (
    <div className="gip-ambient-bg min-h-full space-y-5 p-4 md:p-6">
      <CommandHero
        eyebrow="OPERAÇÃO · CAMPANHA"
        titulo="Mobilização"
        subtitulo="Seu público andando pelo funil, por etapa. O sistema move sozinho conforme a pessoa se engaja — e você pode mover à mão quando conhecer alguém."
      />

      {/* Filtros */}
      <div className="gip-glass flex flex-wrap items-center gap-x-5 gap-y-3 p-3 sm:p-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={soApoiador}
            onChange={(e) => setSoApoiador(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Só apoiador pra cima
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
          <p className="text-sm font-medium text-foreground">Ninguém no funil ainda.</p>
          <p className="mt-1 text-sm text-text-muted">
            Conforme as pessoas forem entrando e se engajando (palestras, QR, pesquisas, respostas), elas aparecem
            aqui e sobem de etapa sozinhas.
          </p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {colunasVisiveis.map((col) => {
            const visiveis = col.cards.filter(cardPassa);
            const ocultosPeloCap = Math.max(0, col.total - col.cards.length);
            return (
              <div key={col.estagio} className="flex w-[280px] shrink-0 flex-col">
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
                      <CardView key={c.contactId} card={c} colunas={colunas} ocupado={ocupado} onMover={mover} />
                    ))
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
      )}
    </div>
  );
}

function CardView({
  card,
  colunas,
  ocupado,
  onMover,
}: {
  card: CardPessoa;
  colunas: ColunaKanban[];
  ocupado: boolean;
  onMover: (contactId: string, etapa: string, label: string) => void;
}) {
  const temp = TEMP_CFG[card.temperatura] ?? TEMP_CFG.frio!;
  const etapaAtual = colunas.find((col) => col.cards.some((x) => x.contactId === card.contactId))?.estagio;
  return (
    <div className="gip-glass p-3">
      <p className="truncate text-sm font-semibold text-foreground" title={card.nome}>
        {card.nome}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted">
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
        {card.cidade && <span>· {card.cidade}</span>}
        <span className="inline-flex items-center gap-0.5" style={{ color: temp.cor }}>
          {temp.emoji} {temp.label}
        </span>
      </div>
      <div className="mt-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={ocupado}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-white/10"
            >
              Mover etapa <CaretDown size={11} weight="bold" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {colunas
              .filter((col) => col.estagio !== etapaAtual)
              .map((col) => (
                <DropdownMenuItem
                  key={col.estagio}
                  onSelect={() => onMover(card.contactId, col.estagio, col.label)}
                >
                  <span className="mr-2 h-2 w-2 rounded-full" style={{ background: col.cor }} aria-hidden />
                  {col.label}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
