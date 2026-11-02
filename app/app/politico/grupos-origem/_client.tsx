"use client";

/**
 * Grupos de origem (camaleão). O cliente organiza as ORIGENS dos seus contatos
 * em grupos do SEU mandato. Clique, não arrasta (à prova de criança + celular).
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CommandHero } from "@/components/politico/command-hero";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CaretDown, PencilSimple, Trash } from "@/lib/ui/icons";
import {
  apagarGrupo,
  criarGrupo,
  moverOrigemParaGrupo,
  renomearGrupo,
} from "@/app/actions/politico/grupos-origem-actions";
import type { GrupoDeOrigem, OrigemComContagem } from "@/lib/politico/origens-grupos";

interface Props {
  grupos: GrupoDeOrigem[];
  aClassificar: OrigemComContagem[];
}

export default function GruposOrigemClient({ grupos, aClassificar }: Props) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [novoNome, setNovoNome] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nomeEdit, setNomeEdit] = useState("");

  const totalOrigens = grupos.reduce((s, g) => s + g.origens.length, 0) + aClassificar.length;

  function rodar(p: Promise<{ ok: boolean; erro?: string }>, okMsg?: string) {
    iniciar(async () => {
      const r = await p;
      if (!r.ok) {
        toast.error(r.erro ?? "Não foi possível concluir.");
        return;
      }
      if (okMsg) toast.success(okMsg);
      router.refresh();
    });
  }

  function onCriar() {
    const nome = novoNome.trim();
    if (!nome) return;
    setNovoNome("");
    rodar(criarGrupo(nome), "Grupo criado.");
  }

  function salvarNome(id: string) {
    const nome = nomeEdit.trim();
    setEditando(null);
    if (!nome) return;
    rodar(renomearGrupo(id, nome), "Nome atualizado.");
  }

  // O menu "Mover para": lista os outros grupos + "Tirar do grupo" quando já está num.
  function MoverMenu({ origem, grupoAtual }: { origem: OrigemComContagem; grupoAtual: string | null }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={ocupado}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-white/10"
          >
            Mover <CaretDown size={11} weight="bold" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {grupos
            .filter((g) => g.id !== grupoAtual)
            .map((g) => (
              <DropdownMenuItem key={g.id} onSelect={() => rodar(moverOrigemParaGrupo(origem.source, g.id))}>
                {g.nome}
              </DropdownMenuItem>
            ))}
          {grupos.filter((g) => g.id !== grupoAtual).length === 0 && (
            <DropdownMenuItem disabled>Crie um grupo primeiro</DropdownMenuItem>
          )}
          {grupoAtual !== null && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => rodar(moverOrigemParaGrupo(origem.source, null))}>
                Tirar do grupo
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function Chip({ origem, grupoAtual }: { origem: OrigemComContagem; grupoAtual: string | null }) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-1.5"
        style={{
          background: "color-mix(in srgb, var(--color-surface-elevated) 55%, transparent)",
          border: "1px solid color-mix(in srgb, var(--color-text) 9%, transparent)",
        }}
      >
        <span className="text-sm font-medium text-foreground">{origem.label}</span>
        <span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold tabular-nums text-accent">
          {origem.total.toLocaleString("pt-BR")}
        </span>
        <MoverMenu origem={origem} grupoAtual={grupoAtual} />
      </div>
    );
  }

  return (
    <div className="gip-ambient-bg min-h-full space-y-6 p-4 md:p-6">
      <CommandHero
        eyebrow="OPERAÇÃO · CAMPANHA"
        titulo="Grupos de origem"
        subtitulo="Organize de onde seus contatos vieram em grupos do seu mandato. Cada mandato é diferente — arrume do seu jeito."
      />

      {/* Criar grupo */}
      <div className="gip-glass flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <input
          className="wr-input flex-1"
          placeholder="Nome do novo grupo (ex.: Palestras, Emendas-Escolas, Formaturas)"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCriar();
          }}
          maxLength={60}
        />
        <Button onClick={onCriar} disabled={ocupado || !novoNome.trim()}>
          Criar grupo
        </Button>
      </div>

      {totalOrigens === 0 ? (
        <div className="gip-glass p-8 text-center">
          <p className="text-sm font-medium text-foreground">Nenhuma origem na base ainda.</p>
          <p className="mt-1 text-sm text-text-muted">
            Conforme as pessoas forem entrando (palestras, QR, eventos, indicações), as origens aparecem aqui
            sozinhas, prontas pra você agrupar.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <div key={g.id} className="gip-glass p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                {editando === g.id ? (
                  <input
                    autoFocus
                    className="wr-input max-w-xs"
                    value={nomeEdit}
                    onChange={(e) => setNomeEdit(e.target.value)}
                    onBlur={() => salvarNome(g.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") salvarNome(g.id);
                      if (e.key === "Escape") setEditando(null);
                    }}
                    maxLength={60}
                  />
                ) : (
                  <button
                    type="button"
                    className="group inline-flex items-center gap-2 text-base font-semibold text-foreground"
                    onClick={() => {
                      setNomeEdit(g.nome);
                      setEditando(g.id);
                    }}
                    title="Clique para renomear"
                  >
                    {g.nome}
                    <PencilSimple size={14} className="text-text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    <span className="rounded-full bg-white/10 px-2 text-xs font-medium text-text-muted">
                      {g.origens.length}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={ocupado}
                  className="rounded-md p-1 text-text-muted transition-colors hover:bg-destructive/15 hover:text-destructive"
                  title="Apagar grupo (as origens voltam para A classificar)"
                  onClick={() => {
                    if (window.confirm(`Apagar o grupo "${g.nome}"? As origens voltam para "A classificar".`)) {
                      rodar(apagarGrupo(g.id), "Grupo apagado.");
                    }
                  }}
                >
                  <Trash size={16} aria-hidden />
                </button>
              </div>
              {g.origens.length === 0 ? (
                <p className="text-sm text-text-muted">Vazio — mova origens de "A classificar" para cá.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {g.origens.map((o) => (
                    <Chip key={o.source} origem={o} grupoAtual={g.id} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* A classificar */}
          {aClassificar.length > 0 && (
            <div className="gip-glass p-4">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">A classificar</h2>
                <span className="rounded-full bg-amber-500/15 px-2 text-xs font-medium text-amber-400">
                  {aClassificar.length}
                </span>
              </div>
              <p className="mb-3 text-sm text-text-muted">
                Origens que ainda não estão em nenhum grupo. Clique em "Mover" em cada uma.
              </p>
              <div className="flex flex-wrap gap-2">
                {aClassificar.map((o) => (
                  <Chip key={o.source} origem={o} grupoAtual={null} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
