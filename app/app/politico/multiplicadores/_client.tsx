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
import { CheckCircle, MagnifyingGlass, Megaphone, PaperPlaneTilt, Plus, Trash, UserCircle } from "@/lib/ui/icons";
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
  const [enviando, setEnviando] = useState(false);
  const [convidando, setConvidando] = useState(false);
  const [canalSel, setCanalSel] = useState(canalAtual ?? "");

  const assessores = multiplicadores.filter((m) => m.tipo === "assessor");
  const divulgadores = multiplicadores.filter((m) => m.tipo === "divulgador");

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

      {/* Número dedicado de disparo dos multiplicadores (anti-ban, pré-setado) */}
      <div className="gip-glass flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Número de disparo dos multiplicadores</h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-text-muted">
            Separe o disparo dos multiplicadores num número dedicado pra não arriscar o número do gabinete (quando você
            tiver um 2º número). Por ora, deixe no automático.
          </p>
        </div>
        <select
          className="wr-input w-full sm:w-72"
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
            placeholder="Busque por nome ou telefone (assessor, liderança ou apoiador)…"
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
          O sistema manda, no privado de cada um, o <strong className="font-semibold text-foreground">link pessoal dele</strong> desse conteúdo — pronto pra compartilhar. Cada abertura pelo link dele conta como alcance dele. <span className="text-text-subtle">(Instagram e enquete espalham — a enquete chega com o módulo de Pesquisa; ebook/PDF são pra enviar 1:1 e criar relacionamento.)</span>
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

      {/* Convidar apoiadores a serem divulgadores (porta do divulgador) */}
      <div className="gip-glass p-4">
        <div className="mb-1 flex items-center gap-2">
          <Megaphone size={18} weight="bold" className="text-accent" aria-hidden />
          <h2 className="text-base font-semibold text-foreground">Convidar apoiadores a serem divulgadores</h2>
        </div>
        <p className="mb-3 text-sm text-text-muted">
          O sistema convida seus <strong className="font-semibold text-foreground">apoiadores</strong> a receberem conteúdos exclusivos e ajudar a espalhar. Quem responde <strong className="font-semibold text-foreground">SIM</strong> vira divulgador sozinho — e entra neste placar. <span className="text-text-subtle">(Só apoiador pra cima; não enche a base de quem não quer.)</span>
        </p>
        {elegiveis === 0 ? (
          <p className="text-sm text-text-subtle">
            Nenhum apoiador elegível agora. Conforme as pessoas se engajam e viram apoiadores, elas aparecem aqui pra convidar.
          </p>
        ) : (
          <Button onClick={onConvidar} disabled={ocupado || convidando}>
            <Megaphone size={15} weight="bold" aria-hidden />
            Convidar {elegiveis} apoiador{elegiveis === 1 ? "" : "es"}
          </Button>
        )}
        {potenciais > 0 && (
          <p className="mt-2 text-[12px] font-medium text-accent">
            ⭐ {potenciais} marcado{potenciais === 1 ? "" : "s"} como potencial multiplicador —{" "}
            {potenciais === 1 ? "será convidado" : "serão convidados"} primeiro.
          </p>
        )}
        <p className="mt-2 text-[11px] text-text-subtle">
          Antes do go-live, só os números de teste recebem o convite — a trava de segurança continua valendo.
        </p>
      </div>

      {/* Placar — SEPARADO Assessores × Divulgadores (saber quem é quem) */}
      <SecaoPlacar
        titulo="Assessores"
        subtitulo="Marcados por você (equipe). Quanto cada um alcançou e quantos trouxe."
        vazio="Nenhum assessor marcado ainda. Use a busca acima pra marcar seus assessores e lideranças."
        linhas={assessores}
        ocupado={ocupado}
        onRemover={(id) => rodar(removerMultiplicador(id), "Removido da lista.")}
      />
      <SecaoPlacar
        titulo="Divulgadores"
        subtitulo="Apoiadores que aceitaram o convite e viraram divulgadores."
        vazio="Nenhum divulgador ainda — eles entram pelo convite + aceite (quem responde SIM)."
        linhas={divulgadores}
        ocupado={ocupado}
        onRemover={(id) => rodar(removerMultiplicador(id), "Removido da lista.")}
      />
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
}: {
  titulo: string;
  subtitulo: string;
  vazio: string;
  linhas: MultiplicadorRow[];
  ocupado: boolean;
  onRemover: (contactId: string) => void;
}) {
  return (
    <div className="gip-glass p-4">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
        <span className="rounded-full bg-white/10 px-2 text-xs font-semibold tabular-nums text-text-muted">
          {linhas.length}
        </span>
      </div>
      <p className="mb-3 text-sm text-text-muted">{subtitulo}</p>
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
