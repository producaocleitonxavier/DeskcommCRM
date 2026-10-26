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
import { useContactList } from "@/hooks/contacts/useContactList";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
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
  Search,
  UserPlus,
  X,
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
  const [limite, setLimite] = useState("5000");
  const [porDia, setPorDia] = useState("50");
  // Disparo nominal: pessoas específicas escolhidas por nome (entram como incluídas).
  const [especificos, setEspecificos] = useState<Array<{ id: string; nome: string }>>([]);
  const [buscaPessoa, setBuscaPessoa] = useState("");

  const listaDeCanais = canais.data ?? [];
  // Preseleciona quando só há um número.
  useEffect(() => {
    if (!canal && listaDeCanais.length === 1) setCanal(listaDeCanais[0]!.id);
  }, [canal, listaDeCanais]);

  // Busca de pessoas para o disparo nominal (só consulta quando há texto).
  const pessoas = useContactList({ search: buscaPessoa.trim() || undefined, limit: 8 });
  const resultadosPessoas = (pessoas.data?.pages.flatMap((p) => p.data) ?? []).filter(
    (c) => !especificos.some((e) => e.id === c.id),
  );

  // O <main> do shell tem overflow-auto mas NÃO rola internamente (quem rola é o
  // documento), então position:sticky não ativa dentro dele. Seguimos o scroll à
  // mão: o celular desliza por transform pra ficar sempre ~24px do topo, preso ao
  // intervalo da coluna (aside esticada).
  const asideRef = useRef<HTMLElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      const aside = asideRef.current;
      const phone = phoneRef.current;
      if (!aside || !phone || aside.offsetParent === null) {
        if (phone) phone.style.transform = "";
        return;
      }
      const r = aside.getBoundingClientRect();
      const topDesejado = 24;
      const maxShift = Math.max(0, aside.offsetHeight - phone.offsetHeight);
      const shift = Math.max(0, Math.min(topDesejado - r.top, maxShift));
      phone.style.transform = `translateY(${shift}px)`;
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const filtro = useMemo(
    () => ({
      origens: origensSel,
      niveis_de_apoio: niveis,
      temperaturas: temps,
      incluir_contatos: especificos.map((e) => e.id),
      limite: Number(limite) || 5000,
    }),
    [origensSel, niveis, temps, especificos, limite],
  );
  const temPublico =
    origensSel.length > 0 || niveis.length > 0 || temps.length > 0 || especificos.length > 0;

  const vel = VELOCIDADES.find((v) => v.id === velocidade) ?? VELOCIDADES[0];
  const materialTitulo = materiais.find((m) => m.id === material)?.titulo ?? null;
  // Prévia: se há pessoa específica escolhida, mostra o NOME dela; senão, exemplo.
  const nomeExemplo = especificos.length > 0 ? primeiroNome(especificos[0]!.nome) : "Maria";
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
      teto_diario: Number(porDia) || 50,
      material_id: material || null,
    });
    router.push(`/app/campaigns/${criada.id}`);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Operação · Comunicação"
        titulo="Novo disparo"
        subtitulo="Monte em 4 passos simples: quem recebe, o que você diz, o que entrega e no ritmo seguro. No fim vira um rascunho — você confere e inicia depois."
        acoes={[{ href: "/app/campaigns", label: "← Voltar" }]}
      />

      <div className="mt-[18px] grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-[18px]">
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

        {/* Pessoas específicas — disparo nominal */}
        <Campo rotulo={t("Pessoas específicas")} dica={t("opcional — busque pelo nome")}>
          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            {t("Precisa mandar pra alguém específico (uma liderança, um contato-chave)? Busque pelo nome e adicione. Pode ser junto com os filtros acima — ou só estas pessoas.")}
          </p>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
              <Search className="h-4 w-4" style={{ color: "var(--color-text-subtle)" }} />
            </span>
            <input
              value={buscaPessoa}
              onChange={(e) => setBuscaPessoa(e.target.value)}
              placeholder={t("Buscar pessoa pelo nome ou telefone…")}
              className="wr-input pl-9"
            />
            {buscaPessoa.trim() !== "" && resultadosPessoas.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)", boxShadow: "0 12px 30px -12px rgba(0,0,0,0.35)" }}>
                {resultadosPessoas.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setEspecificos((xs) => [...xs, { id: c.id, nome: rotuloDoContato(c, t) }]);
                      setBuscaPessoa("");
                    }}
                    className="wr-hover flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                    style={{ color: "var(--color-text)" }}
                  >
                    <UserPlus className="h-4 w-4 shrink-0" style={{ color: "var(--color-accent)" }} />
                    <span className="truncate">{rotuloDoContato(c, t)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {especificos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {especificos.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium" style={{ background: "rgba(215,243,106,0.14)", color: "#8AA62E" }}>
                  {e.nome}
                  <button type="button" onClick={() => setEspecificos((xs) => xs.filter((x) => x.id !== e.id))} aria-label={t("Remover")}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
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
          rows={5}
          placeholder={t("Ex.: Oi {{nome}}! Preparamos um material sobre proteção digital. Posso te enviar? Responde SIM 👍")}
          className="block w-full resize-y rounded-xl border px-4 py-3 text-sm"
          style={{
            minHeight: 130,
            lineHeight: 1.55,
            background: "var(--color-surface)",
            borderColor: "var(--color-border)",
            color: "var(--color-text)",
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setTexto((s) => s + "{{nome}}")} className="wr-btn text-xs">
            + {t("nome da pessoa")}
          </button>
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            {t("vira o primeiro nome de cada contato")}
          </span>
        </div>

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
                <p className="mt-1.5 text-[11px] font-bold tabular-nums" style={{ color: velocidade === v.id ? "var(--color-accent)" : "var(--color-text-muted)" }}>
                  1 {t("msg a cada")} {v.intervalo}s
                </p>
              </button>
            ))}
          </div>
        </Campo>

        <Campo rotulo={t("Quantos por dia?")} dica={t("o motor manda só essa quantidade por dia, dia após dia, até terminar a lista")}>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={5000} value={porDia} onChange={(e) => setPorDia(e.target.value)} className="wr-input" style={{ maxWidth: 120 }} />
            <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("por dia")}</span>
          </div>
          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            {t("Começa em 50 (bem seguro). Pode aumentar ou diminuir à vontade. Ex.: 3.000 pessoas a 50/dia = terminam em ~60 dias, sozinho.")}
          </p>
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

      {/* Prévia no celular (mobile) — no desktop é o aparelho fixo à direita */}
      <div className="lg:hidden">
        <PhoneMockup texto={texto} materialTitulo={materialTitulo} nome={nomeExemplo} />
      </div>

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

        <aside ref={asideRef} className="hidden lg:block">
          <div ref={phoneRef} style={{ willChange: "transform" }}>
            <PhoneMockup texto={texto} materialTitulo={materialTitulo} nome={nomeExemplo} />
          </div>
        </aside>
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

/** Prévia WhatsApp: {{nome}} → nome de exemplo, *negrito* → bold, escapando HTML. */
function previewWhatsapp(texto: string, nome = "Maria"): string {
  const escapado = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escapado
    .replace(/\{\{\s*nome\s*\}\}/g, escaparHtml(nome))
    .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}

/** Primeiro nome para a prévia. Ex.: "LEONARDO VINICIUS…" → "Leonardo". */
function primeiroNome(nomeCompleto: string): string {
  const w = nomeCompleto.trim().split(/\s+/)[0] ?? "";
  if (!w) return "Maria";
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ── Aparelho — prévia ultrapremium do disparo ─────────────────────────────── */

function PhoneMockup({ texto, materialTitulo, nome }: { texto: string; materialTitulo: string | null; nome: string }) {
  const t = useT();
  const temTexto = texto.trim().length > 0;
  return (
    <div className="wr-anim-in">
      <div
        className="wr-float relative mx-auto"
        style={{
          width: 300,
          borderRadius: 44,
          padding: 11,
          background: "linear-gradient(155deg,#33363d 0%,#0a0b0e 60%)",
          boxShadow: "0 34px 70px -22px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05), 0 0 60px -14px rgba(215,243,106,0.18)",
        }}
      >
        <div className="relative overflow-hidden" style={{ borderRadius: 34, background: "#0B141A", height: 604 }}>
          {/* Ilha dinâmica */}
          <div className="absolute left-1/2 top-[9px] z-30 -translate-x-1/2 rounded-full" style={{ width: 92, height: 26, background: "#000" }} />
          {/* Barra de status */}
          <div className="relative z-20 flex items-center justify-between px-5 pt-3 text-[11px] font-semibold" style={{ color: "#fff" }}>
            <span>9:41</span>
            <span className="flex items-center gap-1.5">
              <span className="flex items-end gap-[2px]">
                {[4, 6, 8, 10].map((h) => (
                  <span key={h} style={{ width: 2.5, height: h, background: "#fff", borderRadius: 1, display: "inline-block" }} />
                ))}
              </span>
              <span className="relative inline-flex items-center" style={{ width: 20, height: 10, border: "1px solid rgba(255,255,255,0.8)", borderRadius: 2.5 }}>
                <span style={{ position: "absolute", right: -3, top: 3, width: 2, height: 4, background: "rgba(255,255,255,0.8)", borderRadius: 1 }} />
                <span style={{ position: "absolute", left: 1.5, top: 1.5, bottom: 1.5, width: "78%", background: "#4ADE80", borderRadius: 1 }} />
              </span>
            </span>
          </div>
          {/* Cabeçalho WhatsApp */}
          <div className="relative z-20 mt-2 flex items-center gap-2.5 px-3 py-2.5" style={{ background: "#1F2C33", boxShadow: "0 1px 0 rgba(0,0,0,0.3)" }}>
            <span className="text-lg leading-none" style={{ color: "#8696A0" }}>‹</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full font-heading text-sm font-bold" style={{ background: "linear-gradient(135deg,#D7F36A,#8AA62E)", color: "#14181F" }}>C</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold" style={{ color: "#E9EDEF" }}>Cleiton Xavier</div>
              <div className="text-[10px]" style={{ color: "#4ADE80" }}>online</div>
            </div>
          </div>
          {/* Conversa */}
          <div
            className="relative space-y-2 overflow-y-auto px-3 py-3"
            style={{
              height: 500,
              background: "#0B141A",
              backgroundImage: "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          >
            <Bolha lado="out" atraso="0.15s">
              <span dangerouslySetInnerHTML={{ __html: temTexto ? previewWhatsapp(texto, nome) : "<span style='opacity:.45'>Sua mensagem aparece aqui conforme você escreve…</span>" }} />
              <Hora checks />
            </Bolha>
            {materialTitulo && temTexto && (
              <>
                <Bolha lado="in" atraso="0.9s">
                  Sim <Hora />
                </Bolha>
                <Bolha lado="out" atraso="1.5s">
                  <DocCard titulo={materialTitulo} />
                  <span className="mt-1.5 block" dangerouslySetInnerHTML={{ __html: `📘 Aqui está o material <strong>${escaparHtml(materialTitulo)}</strong>. Qualquer dúvida, é só chamar! 🙂` }} />
                  <Hora checks />
                </Bolha>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs" style={{ color: "var(--color-text-subtle)" }}>
        {materialTitulo ? t("Prévia — o convite, o “SIM” e o material chegando") : t("Prévia — é assim que a pessoa vê")}
      </p>
    </div>
  );
}

function Bolha({ lado, atraso, children }: { lado: "in" | "out"; atraso: string; children: ReactNode }) {
  const out = lado === "out";
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        className="wr-anim-in relative max-w-[82%] px-2.5 py-1.5 text-[13px] leading-snug"
        style={{
          animationDelay: atraso,
          background: out ? "#005C4B" : "#1F2C33",
          color: "#E9EDEF",
          borderRadius: 10,
          borderTopRightRadius: out ? 3 : 10,
          borderTopLeftRadius: out ? 10 : 3,
          boxShadow: "0 1px 1px rgba(0,0,0,0.25)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Hora({ checks }: { checks?: boolean }) {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 align-bottom text-[9px]" style={{ color: "rgba(233,237,239,0.5)" }}>
      18:42
      {checks && <span style={{ color: "#53BDEB" }}>✓✓</span>}
    </span>
  );
}

function DocCard({ titulo }: { titulo: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg p-2" style={{ background: "rgba(0,0,0,0.22)" }}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded" style={{ background: "#E53935", color: "#fff", fontSize: 9, fontWeight: 800 }}>PDF</span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold" style={{ color: "#E9EDEF" }}>{titulo}</span>
        <span className="block text-[10px]" style={{ color: "rgba(233,237,239,0.5)" }}>PDF · documento</span>
      </span>
    </div>
  );
}
