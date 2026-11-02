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
import { CheckCircle, MagnifyingGlass, PaperPlaneTilt, Plus, Trash, UserCircle } from "@/lib/ui/icons";
import {
  adicionarMultiplicador,
  removerMultiplicador,
  buscarContatosParaMarcar,
  type ContatoParaMarcar,
} from "@/app/actions/politico/multiplicadores-actions";
import {
  enviarVideoAosMultiplicadores,
  type VideoDaBiblioteca,
} from "@/app/actions/politico/multiplicadores-envio-actions";
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
}

export default function MultiplicadoresClient({ multiplicadores, sugestoes, videos }: Props) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ContatoParaMarcar[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [videoSel, setVideoSel] = useState("");
  const [enviando, setEnviando] = useState(false);

  function onEnviarVideo() {
    if (!videoSel) {
      toast.error("Escolha um vídeo primeiro.");
      return;
    }
    setEnviando(true);
    iniciar(async () => {
      try {
        const r = await enviarVideoAosMultiplicadores(videoSel);
        if (!r.ok) {
          toast.error(r.erro);
          return;
        }
        const base = `Enviado para ${r.enviados} de ${r.total} multiplicador${r.total === 1 ? "" : "es"}.`;
        if (r.pulados.length > 0) toast.warning(`${base} ${r.pulados.length} pulado(s): ${r.pulados.map((p) => `${p.nome} (${p.motivo})`).slice(0, 3).join(", ")}${r.pulados.length > 3 ? "…" : ""}`);
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

      {/* Enviar um vídeo aos multiplicadores (envio 1-a-1 do link pessoal) */}
      <div className="gip-glass p-4">
        <div className="mb-1 flex items-center gap-2">
          <PaperPlaneTilt size={18} weight="bold" className="text-accent" aria-hidden />
          <h2 className="text-base font-semibold text-foreground">Enviar um conteúdo do Instagram aos multiplicadores</h2>
        </div>
        <p className="mb-3 text-sm text-text-muted">
          O sistema manda, no privado de cada um, o <strong className="font-semibold text-foreground">link pessoal dele</strong> desse conteúdo — pronto pra compartilhar. Cada abertura pelo link dele conta como alcance dele. <span className="text-text-subtle">(Só conteúdo do Instagram espalha; ebook/enquete/PDF são pra enviar e criar relacionamento.)</span>
        </p>
        {videos.length === 0 ? (
          <p className="text-sm text-text-subtle">
            Nenhum conteúdo do Instagram na biblioteca ainda. Adicione um post/reel do Instagram na Biblioteca de Materiais.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                className="wr-input flex-1"
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
              <Button onClick={onEnviarVideo} disabled={ocupado || enviando || !videoSel || multiplicadores.length === 0}>
                <PaperPlaneTilt size={15} weight="bold" aria-hidden />
                Enviar aos {multiplicadores.length} multiplicador{multiplicadores.length === 1 ? "" : "es"}
              </Button>
            </div>
            {videoSel && (
              <div
                className="mt-3 rounded-xl p-3 text-[12.5px]"
                style={{ background: "color-mix(in srgb, var(--color-text) 5%, transparent)" }}
              >
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-subtle">
                  Prévia — vão 2 mensagens (pra ele só encaminhar o link)
                </p>
                <p className="whitespace-pre-line text-foreground">
                  {"Olá, [nome]! 👋 Saiu um conteúdo novo do nosso mandato.\n\nÉ só encaminhar a mensagem abaixo 👇 pra sua rede.\n\nObrigado por multiplicar! 🙏"}
                </p>
                <p className="mt-2 mb-1 text-[11px] text-text-subtle">↓ 2ª mensagem — só o link (o que o assessor encaminha):</p>
                <p
                  className="rounded-lg px-2 py-1 font-medium text-foreground"
                  style={{ background: "color-mix(in srgb, var(--color-accent) 12%, transparent)" }}
                >
                  [link do vídeo dele]
                </p>
              </div>
            )}
          </>
        )}
        <p className="mt-2 text-[11px] text-text-subtle">
          Antes do go-live, só os números de teste recebem de fato — a trava de segurança continua valendo.
        </p>
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
