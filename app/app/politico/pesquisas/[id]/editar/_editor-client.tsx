"use client";

/**
 * Construtor de perguntas da Pesquisa Relâmpago (Fase 1). Porta a UX rica do WR1
 * com melhorias: temas GENÉRICOS (servem qualquer político), nome do mandato
 * DINÂMICO no preview e na sugestão de intenção de voto, guardrail TSE visível,
 * e salvamento por server action. Visual no padrão War Room (tokens do sistema).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, ChevronDown, ChevronUp, X, Save, Smartphone, Loader2, Lightbulb, ShieldAlert,
} from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { salvarPerguntas, type PerguntaInput } from "@/app/actions/politico/pesquisa-actions";

type Tipo = PerguntaInput["response_type"];
interface PerguntaLocal {
  id: string;
  theme: string;
  question: string;
  response_type: Tipo;
  options: string[];
  required: boolean;
}

const TEMAS: { v: string; l: string; e: string; tse?: boolean }[] = [
  { v: "saude", l: "Saúde", e: "🏥" },
  { v: "educacao", l: "Educação", e: "🎓" },
  { v: "seguranca", l: "Segurança", e: "🚔" },
  { v: "infraestrutura", l: "Infraestrutura", e: "🏗️" },
  { v: "assistencia", l: "Assistência Social", e: "🤝" },
  { v: "emprego", l: "Emprego e Renda", e: "💼" },
  { v: "transporte", l: "Transporte", e: "🚌" },
  { v: "meio_ambiente", l: "Meio Ambiente", e: "🌳" },
  { v: "cultura_esporte", l: "Cultura e Esporte", e: "🎭" },
  { v: "intencao_voto", l: "Intenção de Voto", e: "🗳️", tse: true },
  { v: "geral", l: "Geral", e: "💬" },
];
const temaDe = (v: string) => TEMAS.find((t) => t.v === v) ?? TEMAS[TEMAS.length - 1]!;

const TIPOS: { v: Tipo; l: string; d: string }[] = [
  { v: "scale", l: "Escala 1–5", d: "Nada importante → Essencial" },
  { v: "boolean", l: "Sim / Não", d: "Resposta binária" },
  { v: "multi_choice", l: "Múltipla escolha", d: "Opções que você define" },
  { v: "text", l: "Texto livre", d: "Resposta aberta" },
];
const labelTipo = (v: Tipo) => TIPOS.find((t) => t.v === v)?.l ?? v;

function sugestoes(nomeMandato: string | null): Record<string, { q: string; t: Tipo }[]> {
  const nome = nomeMandato?.trim() || "este mandato";
  return {
    saude: [
      { q: "Como você avalia a saúde pública na sua cidade?", t: "scale" },
      { q: "Você já teve dificuldade para conseguir atendimento de saúde?", t: "boolean" },
    ],
    educacao: [
      { q: "Como você avalia a qualidade da educação pública na sua cidade?", t: "scale" },
      { q: "Você tem filhos ou dependentes em escola pública?", t: "boolean" },
    ],
    seguranca: [
      { q: "Como você avalia a segurança no seu bairro?", t: "scale" },
      { q: "Você se sente seguro ao sair de casa à noite?", t: "boolean" },
    ],
    infraestrutura: [
      { q: "Qual o principal problema de infraestrutura no seu bairro?", t: "multi_choice" },
    ],
    transporte: [
      { q: "Como você avalia o transporte público na sua região?", t: "scale" },
    ],
    emprego: [
      { q: "A geração de empregos é uma prioridade para você?", t: "boolean" },
    ],
    intencao_voto: [
      { q: `Se a eleição fosse hoje, você votaria em ${nome}?`, t: "boolean" },
    ],
    geral: [
      { q: "Qual o assunto mais importante para você hoje?", t: "text" },
    ],
  };
}

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function EditorClient({
  surveyId, titulo, descricao, perguntasIniciais, nomeMandato,
}: {
  surveyId: string;
  titulo: string;
  descricao: string;
  perguntasIniciais: PerguntaInput[];
  nomeMandato: string | null;
}) {
  const router = useRouter();
  const [perguntas, setPerguntas] = useState<PerguntaLocal[]>(
    perguntasIniciais.map((p) => ({
      id: uid(),
      theme: p.theme ?? "geral",
      question: p.question,
      response_type: p.response_type,
      options: p.options ?? [],
      required: p.required,
    })),
  );
  const [expandido, setExpandido] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [sugAberta, setSugAberta] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const SUG = sugestoes(nomeMandato);

  function addBranco() {
    const nova: PerguntaLocal = { id: uid(), theme: "geral", question: "", response_type: "boolean", options: [], required: true };
    setPerguntas((p) => [...p, nova]);
    setExpandido(nova.id);
  }
  function addSugestao(theme: string, s: { q: string; t: Tipo }) {
    const nova: PerguntaLocal = { id: uid(), theme, question: s.q, response_type: s.t, options: [], required: true };
    setPerguntas((p) => [...p, nova]);
    setExpandido(nova.id);
    setSugAberta(null);
  }
  function up<K extends keyof PerguntaLocal>(id: string, campo: K, valor: PerguntaLocal[K]) {
    setPerguntas((p) => p.map((q) => (q.id === id ? { ...q, [campo]: valor } : q)));
  }
  function remover(id: string) {
    setPerguntas((p) => p.filter((q) => q.id !== id));
    if (expandido === id) setExpandido(null);
  }
  function mover(idx: number, dir: -1 | 1) {
    setPerguntas((p) => {
      const a = [...p];
      const j = idx + dir;
      if (j < 0 || j >= a.length) return a;
      [a[idx], a[j]] = [a[j]!, a[idx]!];
      return a;
    });
  }

  async function salvar() {
    if (perguntas.some((p) => !p.question.trim())) { setMsg("Preencha o texto de todas as perguntas."); return; }
    setMsg(null);
    setSalvando(true);
    const payload: PerguntaInput[] = perguntas.map((p, i) => ({
      order: i,
      theme: p.theme,
      question: p.question,
      response_type: p.response_type,
      options: p.options,
      required: p.required,
    }));
    const r = await salvarPerguntas(surveyId, payload);
    setSalvando(false);
    if (!r.ok) { setMsg(r.erro); return; }
    router.push("/app/politico/pesquisas");
  }

  return (
    <div className="mx-auto max-w-[860px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Inteligência · Pesquisa"
        titulo={titulo}
        subtitulo={`${perguntas.length} pergunta${perguntas.length !== 1 ? "s" : ""} — monte, reordene e salve.`}
        acoes={[{ href: "/app/politico/pesquisas", label: "← Pesquisas" }]}
        extra={
          <button type="button" onClick={() => setPreview(true)} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold" style={{ background: "rgba(255,255,255,0.12)", color: "#FFF", border: "1px solid rgba(255,255,255,0.25)" }}>
            <Smartphone size={15} /> Ver no celular
          </button>
        }
      />

      {/* Lista de perguntas */}
      <div className="space-y-2.5">
        {perguntas.map((pg, idx) => {
          const tema = temaDe(pg.theme);
          const aberto = expandido === pg.id;
          return (
            <div key={pg.id} className="wr-card overflow-hidden p-0">
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandido(aberto ? null : pg.id)}>
                <div className="flex flex-col items-center">
                  <button type="button" onClick={(e) => { e.stopPropagation(); mover(idx, -1); }} className="opacity-50 hover:opacity-100"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{idx + 1}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); mover(idx, 1); }} className="opacity-50 hover:opacity-100"><ChevronDown className="h-3.5 w-3.5" /></button>
                </div>
                <span style={{ fontSize: 18 }}>{tema.e}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: pg.question ? "var(--color-text)" : "var(--color-text-subtle)" }}>
                    {pg.question || "Clique para escrever a pergunta…"}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{tema.l} · {labelTipo(pg.response_type)}</p>
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); remover(pg.id); }} className="opacity-50 hover:opacity-100" style={{ color: "#E08079" }}><Trash2 className="h-4 w-4" /></button>
                <ChevronDown className="h-4 w-4 transition-transform" style={{ color: "var(--color-text-subtle)", transform: aberto ? "rotate(180deg)" : "none" }} />
              </div>

              {aberto && (
                <div className="space-y-3 border-t px-4 pb-4 pt-3" style={{ borderColor: "var(--color-border)" }}>
                  <div>
                    <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Texto da pergunta</label>
                    <textarea className="wr-input w-full" rows={2} value={pg.question} onChange={(e) => up(pg.id, "question", e.target.value)} placeholder="Escreva a pergunta…" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Tema</label>
                      <select className="wr-input w-full" value={pg.theme} onChange={(e) => up(pg.id, "theme", e.target.value)}>
                        {TEMAS.map((t) => <option key={t.v} value={t.v}>{t.e} {t.l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Tipo de resposta</label>
                      <select className="wr-input w-full" value={pg.response_type} onChange={(e) => up(pg.id, "response_type", e.target.value as Tipo)}>
                        {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l} — {t.d}</option>)}
                      </select>
                    </div>
                  </div>

                  {pg.response_type === "multi_choice" && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Opções</label>
                      <div className="space-y-2">
                        {(pg.options.length === 0 ? [""] : pg.options).map((op, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <input className="wr-input flex-1" value={op} placeholder={`Opção ${oi + 1}`} onChange={(e) => {
                              const novas = pg.options.length === 0 ? [""] : [...pg.options];
                              novas[oi] = e.target.value;
                              up(pg.id, "options", novas);
                            }} />
                            {pg.options.length > 1 && (
                              <button type="button" onClick={() => up(pg.id, "options", pg.options.filter((_, i) => i !== oi))} className="opacity-60 hover:opacity-100" style={{ color: "#E08079" }}><X className="h-3.5 w-3.5" /></button>
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={() => up(pg.id, "options", [...pg.options, ""])} className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--color-primary, #2F3DA8)" }}><Plus className="h-3 w-3" /> Adicionar opção</button>
                      </div>
                    </div>
                  )}

                  {tema.tse && (
                    <div className="flex items-start gap-2 rounded-lg p-2.5 text-[12px]" style={{ background: "rgba(224,128,121,0.10)", border: "1px solid rgba(224,128,121,0.30)", color: "#A3302A" }}>
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span><strong>Intenção de voto:</strong> para <strong>divulgar publicamente</strong> o resultado, a pesquisa precisa de registro no TSE (metodologia). Para <strong>sentir a base internamente</strong>, sem publicar, é livre.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Adicionar + sugestões */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={addBranco} className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-4 text-sm font-bold" style={{ borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}>
          <Plus className="h-4 w-4" /> Pergunta em branco
        </button>
        <div className="wr-card overflow-hidden p-0">
          <button type="button" onClick={() => setSugAberta(sugAberta ? null : "saude")} className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-medium">
            <span className="inline-flex items-center gap-2"><Lightbulb className="h-4 w-4" style={{ color: "#D7B23A" }} /> Usar sugestão</span>
            <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: sugAberta ? "rotate(180deg)" : "none" }} />
          </button>
          {sugAberta && (
            <div className="space-y-2.5 border-t px-4 pb-4 pt-3" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex flex-wrap gap-1.5">
                {TEMAS.filter((t) => SUG[t.v]).map((t) => (
                  <button key={t.v} type="button" onClick={() => setSugAberta(t.v)} className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: sugAberta === t.v ? "var(--color-surface-elevated)" : "transparent", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                    {t.e} {t.l}
                  </button>
                ))}
              </div>
              {(SUG[sugAberta] ?? []).map((s, i) => (
                <button key={i} type="button" onClick={() => addSugestao(sugAberta, s)} className="block w-full rounded-xl p-2.5 text-left" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                  <p className="text-[12px] font-medium" style={{ color: "var(--color-text)" }}>{s.q}</p>
                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>{labelTipo(s.t)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Salvar */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={salvar} disabled={salvando} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {salvando ? "Salvando…" : `Salvar ${perguntas.length} pergunta${perguntas.length !== 1 ? "s" : ""}`}
        </button>
        <Link href="/app/politico/pesquisas" className="wr-btn">Cancelar</Link>
        {msg && <span className="text-sm" style={{ color: "#E08079" }}>{msg}</span>}
      </div>

      {preview && (
        <PreviewMobile perguntas={perguntas} titulo={titulo} descricao={descricao} nomeMandato={nomeMandato} onClose={() => setPreview(false)} />
      )}
    </div>
  );
}

// ─── Preview mobile ──────────────────────────────────────────────────────────
function PreviewMobile({ perguntas, titulo, descricao, nomeMandato, onClose }: {
  perguntas: PerguntaLocal[]; titulo: string; descricao: string; nomeMandato: string | null; onClose: () => void;
}) {
  const [step, setStep] = useState<"intro" | number>("intro");
  const pg = typeof step === "number" ? perguntas[step] : null;
  const tema = pg ? temaDe(pg.theme) : null;
  const total = perguntas.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.82)" }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative">
        <button type="button" onClick={onClose} className="absolute -right-3 -top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "#E08079", color: "#fff" }}><X className="h-4 w-4" /></button>
        <div style={{ width: 360, height: 660, borderRadius: 36, overflow: "hidden", border: "8px solid #15171C", background: "#0A1120" }}>
          <div style={{ height: "100%", overflowY: "auto", padding: 20, color: "#F0F4FA" }}>
            {step === "intro" ? (
              <div className="space-y-4">
                <div>
                  <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "#8FA0C8" }}>Pesquisa oficial</p>
                  <p style={{ fontSize: 14, fontWeight: 900 }}>{nomeMandato?.trim() || "Gabinete"}</p>
                </div>
                <h2 style={{ fontSize: 19, fontWeight: 900, lineHeight: 1.3 }}>{titulo || "Título da pesquisa"}</h2>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: "#9FB0C8" }}>{descricao || "Descrição da pesquisa."}</p>
                <div className="flex gap-2">
                  {[{ l: "Perguntas", v: String(total) }, { l: "Tempo", v: "~2 min" }, { l: "Privado", v: "Sim" }].map((i) => (
                    <div key={i.l} style={{ flex: 1, textAlign: "center", background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "8px 4px" }}>
                      <p style={{ fontSize: 13, fontWeight: 900 }}>{i.v}</p>
                      <p style={{ fontSize: 9, textTransform: "uppercase", color: "#5B6B86" }}>{i.l}</p>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => total > 0 && setStep(0)} style={{ width: "100%", background: "#D7F36A", color: "#16181D", border: "none", borderRadius: 14, padding: 13, fontWeight: 900, fontSize: 13 }}>
                  Responder agora →
                </button>
              </div>
            ) : pg && tema ? (
              <div className="space-y-4">
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#5B6B86", marginBottom: 4 }}>
                    <span>{(step as number) + 1} de {total}</span>
                    <span>{Math.round((((step as number) + 1) / total) * 100)}%</span>
                  </div>
                  <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                    <div style={{ height: 3, borderRadius: 3, width: `${(((step as number) + 1) / total) * 100}%`, background: "#D7F36A" }} />
                  </div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 16 }}>
                  <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#8FA0C8", marginBottom: 10 }}>{tema.e} {tema.l}</p>
                  <p style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.4, marginBottom: 14 }}>{pg.question || "Texto da pergunta"}</p>
                  <WidgetResposta pg={pg} />
                </div>
                <div className="flex gap-2">
                  {(step as number) > 0 && <button type="button" onClick={() => setStep((step as number) - 1)} style={{ flex: 1, background: "rgba(255,255,255,0.06)", color: "#9FB0C8", border: "none", borderRadius: 12, padding: 12, fontWeight: 700, fontSize: 12 }}>← Voltar</button>}
                  <button type="button" onClick={() => (step as number) >= total - 1 ? setStep("intro") : setStep((step as number) + 1)} style={{ flex: 2, background: "#D7F36A", color: "#16181D", border: "none", borderRadius: 12, padding: 12, fontWeight: 900, fontSize: 13 }}>
                    {(step as number) >= total - 1 ? "Enviar ✓" : "Próxima →"}
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ color: "#9FB0C8", fontSize: 13 }}>Adicione perguntas para ver o preview.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WidgetResposta({ pg }: { pg: PerguntaLocal }) {
  if (pg.response_type === "scale") return (
    <div className="flex justify-between">
      {[{ v: 1, e: "😶" }, { v: 2, e: "🙁" }, { v: 3, e: "😐" }, { v: 4, e: "🙂" }, { v: 5, e: "🔥" }].map((o) => (
        <div key={o.v} style={{ textAlign: "center", opacity: 0.8 }}>
          <div style={{ fontSize: 20 }}>{o.e}</div>
          <div style={{ fontSize: 9, color: "#5B6B86" }}>{o.v}</div>
        </div>
      ))}
    </div>
  );
  if (pg.response_type === "boolean") return (
    <div className="flex gap-2">
      {["👍 Sim", "👎 Não"].map((o) => <div key={o} style={{ flex: 1, textAlign: "center", background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: "10px 0", fontWeight: 700, fontSize: 13 }}>{o}</div>)}
    </div>
  );
  if (pg.response_type === "multi_choice") return (
    <div className="space-y-1.5">
      {(pg.options.filter((o) => o.trim()).length ? pg.options.filter((o) => o.trim()) : ["Opção 1", "Opção 2"]).map((o, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "9px 12px", fontSize: 13 }}>
          <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #5B6B86", display: "inline-block" }} /> {o}
        </div>
      ))}
    </div>
  );
  return <div style={{ height: 40, borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />;
}
