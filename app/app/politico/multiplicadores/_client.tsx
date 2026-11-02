"use client";

/**
 * Multiplicadores — quem divulga pra você. Marque seus assessores/lideranças e
 * veja o placar: quanto cada um ALCANÇOU (abriram o link dele), quantos TROUXE, e
 * quem ainda está SEM ALCANCE (justo: medimos o alcance gerado, não acusamos
 * "não divulgou" — a rede dele pode ser pequena). Essa é a "certeza" no olhar.
 * Clique, não decora (à prova de criança + celular).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { CommandHero } from "@/components/politico/command-hero";
import { Button } from "@/components/ui/button";
import { CheckCircle, MagnifyingGlass, Plus, Trash, UserCircle } from "@/lib/ui/icons";
import {
  adicionarMultiplicador,
  removerMultiplicador,
  buscarContatosParaMarcar,
  type ContatoParaMarcar,
} from "@/app/actions/politico/multiplicadores-actions";
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
}

export default function MultiplicadoresClient({ multiplicadores, sugestoes }: Props) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ContatoParaMarcar[]>([]);
  const [buscando, setBuscando] = useState(false);

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
    <div className="gip-ambient-bg min-h-full space-y-6 p-4 md:p-6">
      <CommandHero
        eyebrow="OPERAÇÃO · CAMPANHA"
        titulo="Multiplicadores"
        subtitulo="Marque seus assessores e lideranças e acompanhe quem está espalhando o seu conteúdo — e quem ainda não."
      />

      {/* Explicador didático: o que é e as 2 formas de virar multiplicador */}
      <div className="gip-glass p-4 text-sm leading-snug text-text-muted">
        <strong className="text-foreground">Multiplicador</strong> é quem traz gente pra você. Alguém vira
        multiplicador de duas formas:{" "}
        <span className="whitespace-nowrap">
          ① <strong className="text-foreground">indica</strong> alguém que se cadastra
        </span>{" "}
        <span className="text-text-subtle">(pelo código/QR pessoal — o ouro)</span>, ou{" "}
        <span className="whitespace-nowrap">
          ② <strong className="text-foreground">compartilha o link pessoal</strong> de um vídeo
        </span>{" "}
        e a rede abre. O sistema conta sozinho.
      </div>

      {/* Adicionar multiplicador */}
      <div className="gip-glass space-y-3 p-4">
        <h2 className="text-base font-semibold text-foreground">Adicionar multiplicador</h2>
        <div className="relative">
          <MagnifyingGlass
            size={16}
            weight="bold"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle"
            aria-hidden
          />
          <input
            className="wr-input pl-9"
            placeholder="Busque pelo nome do assessor, liderança ou apoiador…"
            value={busca}
            onChange={(e) => onBuscar(e.target.value)}
          />
        </div>

        {busca.trim().length >= 2 && (
          <div className="space-y-1.5">
            {buscando ? (
              <p className="text-sm text-text-subtle">Buscando…</p>
            ) : resultados.length === 0 ? (
              <p className="text-sm text-text-subtle">Ninguém novo com esse nome.</p>
            ) : (
              resultados.map((c) => (
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
                    <Plus size={14} weight="bold" aria-hidden /> Adicionar
                  </Button>
                </div>
              ))
            )}
          </div>
        )}

        {sugestoes.length > 0 && (
          <div className="space-y-1.5 border-t border-white/10 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
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
                  <Plus size={14} weight="bold" aria-hidden /> Adicionar
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Placar */}
      <div className="gip-glass p-4">
        <h2 className="mb-1 text-base font-semibold text-foreground">Placar dos multiplicadores</h2>
        <p className="mb-3 text-sm text-text-muted">
          Quanto cada um <strong className="font-semibold text-foreground">alcançou</strong> (pessoas que abriram o link dele) e quantos <strong className="font-semibold text-foreground">trouxe</strong>. “Sem alcance” = o link dele ainda não teve aberturas — seu sinal pra dar um empurrão.
        </p>
        {multiplicadores.length === 0 ? (
          <div className="rounded-xl p-6 text-center">
            <p className="text-sm font-medium text-foreground">Nenhum multiplicador marcado ainda.</p>
            <p className="mt-1 text-sm text-text-muted">
              Use a busca acima pra marcar seus assessores e lideranças. Aí você acompanha quem espalha o conteúdo.
            </p>
          </div>
        ) : (
          <ol className="space-y-2">
            {multiplicadores.map((m) => {
              const quando = tempoRelativo(m.ultimaAtividadeISO);
              return (
                <li
                  key={m.contactId}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: "color-mix(in srgb, var(--color-surface-elevated) 45%, transparent)" }}
                >
                  <UserCircle size={22} weight="fill" className="shrink-0 text-text-subtle" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{m.nome}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted">
                      {m.trouxe > 0 && <span className="font-semibold text-accent">trouxe {m.trouxe}</span>}
                      {m.alcancou > 0 && <span>alcançou {m.alcancou}</span>}
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
                    onClick={() => rodar(removerMultiplicador(m.contactId), "Removido da lista.")}
                    className="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:bg-destructive/15 hover:text-destructive"
                    title="Remover da lista de multiplicadores"
                  >
                    <Trash size={16} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
