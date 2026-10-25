"use client";
/**
 * Novo disparo — fluxo GUIADO (War Room 2.0, redesign premium).
 *
 * Regra do cliente: "como se uma criança conseguisse fazer". Então: 4 passos
 * numerados, tudo CLICÁVEL (origem/estágio/temperatura/material/número/velocidade
 * em chips e cards), sem jargão de CRM de vendas, prévia do WhatsApp ao vivo, e
 * ritmo em 3 velocidades prontas (o número cru fica no Avançado). Animação sutil
 * reforça o entendimento (entrada escalonada, contagem que sobe, seleção que
 * responde ao toque). Cria um RASCUNHO — o envio é confirmado depois.
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { CommandHero } from "@/components/politico/command-hero";
import { useCriarCampanha, usePreviaDaAudiencia } from "@/hooks/campanhas/useCampanhas";
import { channelLabel, useChannelSessions } from "@/hooks/channels/useChannelSessions";
import { useT } from "@/hooks/i18n/useT";
import {
  Users,
  MessageSquare,
  BookOpen,
  Send,
  Check,
  Eye,
  Gauge,
  ChevronDown,
  Sparkles,
} from "lucide-react";

type Origem = { value: string; label: string; total: number };
type Material = { id: string; titulo: string; tipo: string };

const ESTAGIOS: ReadonlyArray<readonly [string, string]> = [
  ["novo_cadastro", "Novo cadastro"],
  ["simpatizante", "Simpatizante"],
  ["apoiador", "Apoiador"],
  ["militante", "Multiplicador"],
  ["voto_certo", "Voto certo"],
];
const TEMPS: ReadonlyArray<readonly [string, string]> = [
  ["frio", "Frio"],
  ["morno", "Morno"],
  ["quente", "Quente"],
];
const VELOCIDADES = [
  { id: "calmo", label: "Calmo", emoji: "🐢", desc: "Protege o número. Ideal para a base fria.", intervalo: 90, teto: 40 },
  { id: "normal", label: "Normal", emoji: "🚶", desc: "Equilíbrio entre rapidez e segurança.", intervalo: 45, teto: 150 },
  { id: "rapido", label: "Rápido", emoji: "🏃", desc: "Número aquecido ou quem já respondeu.", intervalo: 20, teto: 400 },
] as const;

export function NovaCampanha({
  materiais = [],
  origens = [],
}: {
  materiais?: Material[];
  origens?: Origem[];
}) {
  const t = useT();
  const router = useRouter();
  const canais = useChannelSessions();
  const criar = useCriarCampanha();
  const previa = usePreviaDaAudiencia();

  const [nome, setNome] = useState("");
  const [origensSel, setOrigensSel] = useState<string[]>([]);
  const [niveis, setNiveis] = useState<string[]>([]);
  const [temps, setTemps] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const [material, setMaterial] = useState("");
  const [canal, setCanal] = useState("");
  const [velocidade, setVelocidade] = useState<string>("calmo");
  // Avançado
  const [avancado, setAvancado] = useState(false);
  const [baseLegal, setBaseLegal] = useState<"consent" | "legitimate_interest">("consent");
  const [liaRef, setLiaRef] = useState("");
  const [limite, setLimite] = useState("500");

  const listaDeCanais = canais.data ?? [];
  // Preseleciona quando só há um número.
  useEffect(() => {
    if (!canal && listaDeCanais.length === 1) setCanal(listaDeCanais[0]!.id);
  }, [canal, listaDeCanais]);

  const filtro = useMemo(
    () => ({
      origens: origensSel,
      niveis_de_apoio: niveis,
      temperaturas: temps,
      limite: Number(limite) || 500,
    }),
    [origensSel, niveis, temps, limite],
  );
  const temPublico = origensSel.length > 0 || niveis.length > 0 || temps.length > 0;

  const vel = VELOCIDADES.find((v) => v.id === velocidade) ?? VELOCIDADES[0];
  const podeCriar =
    nome.trim() !== "" &&
    canal !== "" &&
    texto.trim() !== "" &&
    temPublico &&
    (baseLegal !== "legitimate_interest" || liaRef.trim() !== "");

  async function salvar() {
    const criada = await criar.mutateAsync({
      name: nome.trim(),
      channel_session_id: canal,
      message_body: texto.trim(),
      base_legal: baseLegal,
      lia_ref: liaRef.trim() || null,
      audience_filter: filtro,
      intervalo_segundos: vel.intervalo,
      teto_diario: vel.teto,
      material_id: material || null,
    });
    router.push(`/app/campaigns/${criada.id}`);
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Operação · Comunicação"
        titulo="Novo disparo"
        subtitulo="Monte em 4 passos simples: quem recebe, o que você diz, o que entrega e no ritmo seguro. No fim vira um rascunho — você confere e inicia depois."
        acoes={[{ href: "/app/campaigns", label: "← Voltar" }]}
      />

      {/* Nome */}
      <section className="wr-card wr-anim-in p-5 sm:p-6" style={{ animationDelay: "0.02s" }}>
        <label className="block space-y-2">
          <span className="font-heading text-[15px] font-bold" style={{ color: "var(--color-text)" }}>
            {t("Como você quer chamar este disparo?")}
          </span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={t("Ex.: Material de proteção digital — base de palestras")}
            className="wr-input"
          />
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            {t("Só pra você encontrar depois. O destinatário não vê.")}
          </span>
        </label>
      </section>

      {/* PASSO 1 — Público */}
      <Passo numero={1} icone={Users} titulo={t("Quem vai receber?")} atraso="0.06s">
        <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
          {t("Escolha pelo menos um filtro. Dá pra combinar origem, estágio e temperatura.")}
        </p>

        <Campo rotulo={t("De onde essas pessoas vieram?")} dica={t("a origem do cadastro")}>
          {origens.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
              {t("Nenhuma origem na base ainda.")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {origens.map((o) => (
                <Chip
                  key={o.value}
                  ativo={origensSel.includes(o.value)}
                  onClick={() => setOrigensSel(alternar(origensSel, o.value))}
                >
                  {o.label}
                  <span className="ml-1 opacity-60">· {o.total.toLocaleString("pt-BR")}</span>
                </Chip>
              ))}
            </div>
          )}
        </Campo>

        <Campo rotulo={t("Em que ponto da jornada?")} dica={t("o estágio no funil")}>
          <div className="flex flex-wrap gap-2">
            {ESTAGIOS.map(([v, l]) => (
              <Chip key={v} ativo={niveis.includes(v)} onClick={() => setNiveis(alternar(niveis, v))}>
                {t(l)}
              </Chip>
            ))}
          </div>
        </Campo>

        <Campo rotulo={t("Quão engajadas?")} dica={t("opcional")}>
          <div className="flex flex-wrap gap-2">
            {TEMPS.map(([v, l]) => (
              <Chip key={v} ativo={temps.includes(v)} onClick={() => setTemps(alternar(temps, v))}>
                {t(l)}
              </Chip>
            ))}
          </div>
        </Campo>

        {/* Prévia do público */}
        <div className="mt-1 rounded-xl p-4" style={{ background: "rgba(215,243,106,0.07)", border: "1px solid rgba(215,243,106,0.2)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {previa.data ? (
                <div className="flex items-baseline gap-2">
                  <ContadorQueSobe alvo={previa.data.elegiveis} />
                  <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {t("pessoas vão receber")}
                  </span>
                </div>
              ) : (
                <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {t("Clique para ver quantas pessoas o filtro pega.")}
                </span>
              )}
              {previa.data && previa.data.excluidos > 0 && (
                <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>
                  {previa.data.excluidos} {t("ficam de fora (opt-out, sem telefone, etc.)")}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={!temPublico || previa.isPending}
              onClick={() => previa.mutate({ audience_filter: filtro, message_body: texto })}
              className="wr-btn-dark inline-flex items-center gap-2 px-5 disabled:opacity-50"
            >
              <Eye className="h-4 w-4" />
              {previa.isPending ? t("Contando…") : t("Ver quantas")}
            </button>
          </div>
        </div>
      </Passo>

      {/* PASSO 2 — Mensagem */}
      <Passo numero={2} icone={MessageSquare} titulo={t("O que você vai dizer?")} atraso="0.1s">
        <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
          {t("Convide a pessoa a responder SIM. Quando ela responder, o material é entregue sozinho.")}
        </p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder={t("Ex.: Oi {{nome}}! Preparamos um material sobre proteção digital. Posso te enviar? Responde SIM 👍")}
          className="wr-input resize-y"
          style={{ minHeight: 110 }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setTexto((s) => s + "{{nome}}")} className="wr-btn text-xs">
            + {t("nome da pessoa")}
          </button>
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            {t("vira o primeiro nome de cada contato")}
          </span>
        </div>

        {/* Prévia WhatsApp */}
        {texto.trim() && (
          <div className="wr-anim-in mt-1">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
              {t("Prévia no WhatsApp")}
            </span>
            <div className="mt-2 rounded-2xl p-4" style={{ background: "#0B141A" }}>
              <div
                className="max-w-[85%] rounded-xl rounded-tl-sm px-3 py-2 text-sm"
                style={{ background: "#1F2C33", color: "#E9EDEF", boxShadow: "0 1px 1px rgba(0,0,0,0.3)" }}
                dangerouslySetInnerHTML={{ __html: previewWhatsapp(texto) }}
              />
            </div>
          </div>
        )}
      </Passo>

      {/* PASSO 3 — Material */}
      <Passo numero={3} icone={BookOpen} titulo={t("Vai entregar um material?")} atraso="0.14s" opcional>
        <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
          {t("Quando a pessoa responder SIM, mandamos este material sozinho — sem passar pelo gabinete.")}
        </p>
        {materiais.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
            {t("Nenhum material cadastrado.")}{" "}
            <a href="/app/politico/materiais/novo" className="underline" style={{ color: "var(--color-accent)" }}>
              {t("Cadastrar um ebook")}
            </a>
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <CardEscolha ativo={material === ""} onClick={() => setMaterial("")} titulo={t("Nenhum material")} sub={t("só a mensagem")} />
            {materiais.map((m) => (
              <CardEscolha
                key={m.id}
                ativo={material === m.id}
                onClick={() => setMaterial(m.id)}
                titulo={m.titulo}
                sub={m.tipo ? m.tipo.toUpperCase() : "material"}
                icone={<BookOpen className="h-4 w-4" />}
              />
            ))}
          </div>
        )}
      </Passo>

      {/* PASSO 4 — Envio */}
      <Passo numero={4} icone={Send} titulo={t("De qual número e em que ritmo?")} atraso="0.18s">
        <Campo rotulo={t("Por qual número o disparo sai?")}>
          {listaDeCanais.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>{t("Nenhuma conexão de WhatsApp.")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {listaDeCanais.map((ch) => (
                <Chip key={ch.id} ativo={canal === ch.id} onClick={() => setCanal(ch.id)}>
                  {channelLabel(ch, t)}
                </Chip>
              ))}
            </div>
          )}
        </Campo>

        <Campo rotulo={t("Velocidade do envio")} dica={t("mais devagar = mais seguro pro número")}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {VELOCIDADES.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVelocidade(v.id)}
                className="wr-lift rounded-xl border p-3 text-left transition-colors"
                style={
                  velocidade === v.id
                    ? { borderColor: "var(--color-accent)", background: "rgba(215,243,106,0.08)" }
                    : { borderColor: "var(--color-border)" }
                }
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{v.emoji}</span>
                  <span className="font-heading text-sm font-bold" style={{ color: "var(--color-text)" }}>{t(v.label)}</span>
                  {velocidade === v.id && <Check className="ml-auto h-4 w-4" style={{ color: "var(--color-accent)" }} />}
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>{t(v.desc)}</p>
              </button>
            ))}
          </div>
        </Campo>
      </Passo>

      {/* Avançado */}
      <section className="wr-card wr-anim-in p-5 sm:p-6" style={{ animationDelay: "0.22s" }}>
        <button
          type="button"
          onClick={() => setAvancado((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="inline-flex items-center gap-2 font-heading text-sm font-bold" style={{ color: "var(--color-text-muted)" }}>
            <Gauge className="h-4 w-4" /> {t("Opções avançadas")}
          </span>
          <ChevronDown className="h-4 w-4 transition-transform" style={{ color: "var(--color-text-subtle)", transform: avancado ? "rotate(180deg)" : "none" }} />
        </button>
        {avancado && (
          <div className="wr-anim-in mt-4 space-y-4">
            <Campo rotulo={t("Base legal do envio")} dica={t("por que essas pessoas podem receber")}>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="bl" checked={baseLegal === "consent"} onChange={() => setBaseLegal("consent")} />
                  {t("Consentimento — pediram para receber")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="bl" checked={baseLegal === "legitimate_interest"} onChange={() => setBaseLegal("legitimate_interest")} />
                  {t("Interesse legítimo — com avaliação (LIA)")}
                </label>
                {baseLegal === "legitimate_interest" && (
                  <input value={liaRef} onChange={(e) => setLiaRef(e.target.value)} placeholder={t("Referência da LIA, ex.: LIA-2026-01")} className="wr-input" />
                )}
              </div>
            </Campo>
            <Campo rotulo={t("Máximo de pessoas neste disparo")}>
              <input type="number" min={1} max={5000} value={limite} onChange={(e) => setLimite(e.target.value)} className="wr-input" style={{ maxWidth: 160 }} />
            </Campo>
          </div>
        )}
      </section>

      {/* Criar */}
      <div className="wr-anim-in flex flex-col items-center gap-2 pt-1" style={{ animationDelay: "0.26s" }}>
        {criar.isError && (
          <p className="text-sm font-semibold" style={{ color: "#F87171" }}>{t("Não deu para criar. Confira os campos e tente de novo.")}</p>
        )}
        <button
          type="button"
          disabled={!podeCriar || criar.isPending}
          onClick={salvar}
          className="wr-btn-dark inline-flex items-center gap-2 px-8 py-3 text-base disabled:opacity-50"
        >
          <Sparkles className="h-5 w-5" />
          {criar.isPending ? t("Criando…") : t("Criar disparo")}
        </button>
        <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
          {t("Cria um rascunho. Nada é enviado antes de você conferir e iniciar.")}
        </span>
      </div>
    </div>
  );
}

/* ── Blocos ───────────────────────────────────────────────────────────────── */

function Passo({
  numero,
  icone: Icone,
  titulo,
  atraso,
  opcional,
  children,
}: {
  numero: number;
  icone: typeof Users;
  titulo: string;
  atraso: string;
  opcional?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <section className="wr-card wr-anim-in space-y-4 p-5 sm:p-6" style={{ animationDelay: atraso }}>
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold"
          style={{ background: "var(--color-accent)", color: "#14181F" }}
        >
          {numero}
        </span>
        <div className="flex items-center gap-2">
          <Icone className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
          <h2 className="font-heading text-[18px] font-bold" style={{ color: "var(--color-text)" }}>{titulo}</h2>
        </div>
        {opcional && (
          <span className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>
            {t("opcional")}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>{rotulo}</span>
        {dica && <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>· {dica}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="wr-lift inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors"
      style={
        ativo
          ? { background: "var(--color-accent)", color: "#14181F", borderColor: "transparent" }
          : { borderColor: "var(--color-border)", color: "var(--color-text-muted)" }
      }
    >
      {children}
    </button>
  );
}

function CardEscolha({
  ativo,
  onClick,
  titulo,
  sub,
  icone,
}: {
  ativo: boolean;
  onClick: () => void;
  titulo: string;
  sub: string;
  icone?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="wr-lift flex items-center gap-3 rounded-xl border p-3 text-left transition-colors"
      style={
        ativo
          ? { borderColor: "var(--color-accent)", background: "rgba(215,243,106,0.08)" }
          : { borderColor: "var(--color-border)" }
      }
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(215,243,106,0.12)", color: "var(--color-accent)" }}>
        {icone ?? <span className="text-xs">—</span>}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-heading text-sm font-bold" style={{ color: "var(--color-text)" }}>{titulo}</span>
        <span className="block text-xs" style={{ color: "var(--color-text-subtle)" }}>{sub}</span>
      </span>
      {ativo && <Check className="ml-auto h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />}
    </button>
  );
}

/** Contador que sobe suavemente até o alvo — dá vida ao "quantas pessoas". */
function ContadorQueSobe({ alvo }: { alvo: number }) {
  const [n, setN] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const inicio = ref.current;
    const t0 = performance.now();
    const dur = 600;
    let raf = 0;
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const atual = Math.round(inicio + (alvo - inicio) * eased);
      setN(atual);
      if (p < 1) raf = requestAnimationFrame(passo);
      else ref.current = alvo;
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo]);
  return (
    <span className="font-heading text-3xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>
      {n.toLocaleString("pt-BR")}
    </span>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function alternar(lista: string[], valor: string): string[] {
  return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];
}

/** Prévia WhatsApp: {{nome}} → "Maria", *negrito* → bold, escapando HTML. */
function previewWhatsapp(texto: string): string {
  const escapado = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escapado
    .replace(/\{\{\s*nome\s*\}\}/g, "Maria")
    .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}
