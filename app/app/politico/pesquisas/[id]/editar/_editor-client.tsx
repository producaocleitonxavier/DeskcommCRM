"use client";

/**
 * Construtor de perguntas da Pesquisa Relâmpago. Visual premium no padrão War Room:
 * ícones lucide sóbrios por tema (nada de emoji), card de pergunta com respiro,
 * placeholder de exemplo conforme o tema, e sugestões que ABREM no tema da
 * pesquisa. Temas GENÉRICOS (servem qualquer político), nome do mandato DINÂMICO,
 * guardrail TSE visível, salvamento por server action.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, ChevronDown, ChevronUp, X, Save, Smartphone, Loader2, Lightbulb, ShieldAlert,
} from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { salvarPerguntas, type PerguntaInput } from "@/app/actions/politico/pesquisa-actions";
import { TEMAS_PESQUISA, temaPesquisaDe } from "../../_temas";

type Tipo = PerguntaInput["response_type"];
interface PerguntaLocal {
  id: string;
  theme: string;
  question: string;
  response_type: Tipo;
  options: string[];
  required: boolean;
}

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
      { q: "Como você avalia a iluminação e a pavimentação da sua rua?", t: "scale" },
    ],
    assistencia: [
      { q: "Os programas sociais atendem bem a sua comunidade?", t: "scale" },
      { q: "Você conhece alguém que precisa de apoio social e não recebe?", t: "boolean" },
    ],
    emprego: [
      { q: "A geração de empregos é uma prioridade para você?", t: "boolean" },
      { q: "Como você avalia as oportunidades de trabalho na sua região?", t: "scale" },
    ],
    transporte: [
      { q: "Como você avalia o transporte público na sua região?", t: "scale" },
      { q: "Você depende do transporte público no dia a dia?", t: "boolean" },
    ],
    meio_ambiente: [
      { q: "Como você avalia a limpeza e as áreas verdes do seu bairro?", t: "scale" },
      { q: "A coleta de lixo na sua rua funciona bem?", t: "boolean" },
    ],
    cultura_esporte: [
      { q: "Falta espaço de cultura e esporte no seu bairro?", t: "boolean" },
      { q: "Como você avalia as opções de lazer na sua região?", t: "scale" },
    ],
    intencao_voto: [
      { q: `Se a eleição fosse hoje, você votaria em ${nome}?`, t: "boolean" },
      { q: "Qual o assunto mais importante para decidir o seu voto?", t: "text" },
    ],
    geral: [
      { q: "Qual o assunto mais importante para você hoje?", t: "text" },
      { q: "De forma geral, como você avalia a sua cidade?", t: "scale" },
    ],
  };
}

function uid() { return Math.random().toString(36).slice(2, 10); }

export default function EditorClient({
  surveyId, titulo, descricao, temaPesquisa, perguntasIniciais, nomeMandato,
}: {
  surveyId: string;
  titulo: string;
  descricao: string;
  temaPesquisa: string;
  perguntasIniciais: PerguntaInput[];
  nomeMandato: string | null;
}) {
  const router = useRouter();
  const [perguntas, setPerguntas] = useState<PerguntaLocal[]>(
    perguntasIniciais.map((p) => ({
      id: uid(),
      theme: p.theme ?? temaPesquisa,
      question: p.question,
      response_type: p.response_type,
      options: p.options ?? [],
      required: p.required,
    })),
  );
  const [expandido, setExpandido] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [sugAberta, setSugAberta] = useState(false);
  const [sugTema, setSugTema] = useState(temaPesquisa);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const SUG = sugestoes(nomeMandato);
  const temaCabecalho = temaPesquisaDe(temaPesquisa);

  function addBranco() {
    const nova: PerguntaLocal = { id: uid(), theme: temaPesquisa, question: "", response_type: "scale", options: [], required: true };
    setPerguntas((p) => [...p, nova]);
    setExpandido(nova.id);
  }
  function addSugestao(theme: string, s: { q: string; t: Tipo }) {
    const nova: PerguntaLocal = { id: uid(), theme, question: s.q, response_type: s.t, options: [], required: true };
    setPerguntas((p) => [...p, nova]);
    setExpandido(nova.id);
    setSugAberta(false);
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

      {/* Tema da pesquisa (guarda-chuva) */}
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center" style={{ borderRadius: 7, background: `${temaCabecalho.cor}26`, color: temaCabecalho.cor }}>
          <temaCabecalho.Icon size={15} strokeWidth={2.2} />
        </span>
        <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Tema da pesquisa: <strong style={{ color: "var(--color-text)" }}>{temaCabecalho.l}</strong>
        </span>
      </div>

      {/* Lista de perguntas */}
      <div className="space-y-2.5">
        {perguntas.map((pg, idx) => {
          const tema = temaPesquisaDe(pg.theme);
          const aberto = expandido === pg.id;
          return (
            <div key={pg.id} className="wr-card overflow-hidden p-0">
              <div className="flex items-center gap-3 px-3.5 py-3 cursor-pointer" onClick={() => setExpandido(aberto ? null : pg.id)}>
                <div className="flex flex-col items-center">
                  <button type="button" onClick={(e) => { e.stopPropagation(); mover(idx, -1); }} className="opacity-50 hover:opacity-100"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{idx + 1}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); mover(idx, 1); }} className="opacity-50 hover:opacity-100"><ChevronDown className="h-3.5 w-3.5" /></button>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ borderRadius: 9, background: `${tema.cor}22`, color: tema.cor }}>
                  <tema.Icon size={18} strokeWidth={2} />
                </span>
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
                <div className="space-y-4 border-t px-4 pb-4 pt-4" style={{ borderColor: "var(--color-border)" }}>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Pergunta</label>
                    <textarea className="wr-input w-full" rows={2} value={pg.question} onChange={(e) => up(pg.id, "question", e.target.value)} placeholder={tema.exemplo} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Tema</label>
                      <select className="wr-input w-full" value={pg.theme} onChange={(e) => up(pg.id, "theme", e.target.value)}>
                        {TEMAS_PESQUISA.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Tipo de resposta</label>
                      <select className="wr-input w-full" value={pg.response_type} onChange={(e) => up(pg.id, "response_type", e.target.value as Tipo)}>
                        {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l} — {t.d}</option>)}
                      </select>
                    </div>
                  </div>

                  {pg.response_type === "multi_choice" && (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Opções</label>
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
          <button type="button" onClick={() => setSugAberta((v) => !v)} className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-semibold">
            <span className="inline-flex items-center gap-2"><Lightbulb className="h-4 w-4" style={{ color: "#D7B23A" }} /> Usar sugestão</span>
            <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: sugAberta ? "rotate(180deg)" : "none" }} />
          </button>
          {sugAberta && (
            <div className="space-y-3 border-t px-4 pb-4 pt-3.5" style={{ borderColor: "var(--color-border)" }}>
              <p className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>Perguntas prontas por tema. O tema da sua pesquisa já vem selecionado.</p>
              <div className="flex flex-wrap gap-1.5">
                {TEMAS_PESQUISA.filter((t) => SUG[t.v]).map((t) => {
                  const on = sugTema === t.v;
                  return (
                    <button key={t.v} type="button" onClick={() => setSugTema(t.v)} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors" style={{ background: on ? `${t.cor}1F` : "transparent", border: `1px solid ${on ? t.cor : "var(--color-border)"}`, color: on ? t.cor : "var(--color-text-muted)" }}>
                      <t.Icon size={12} strokeWidth={2.2} /> {t.l}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2">
                {(SUG[sugTema] ?? []).map((s, i) => (
                  <button key={i} type="button" onClick={() => addSugestao(sugTema, s)} className="flex w-full items-center gap-2 rounded-xl p-3 text-left transition-colors hover:brightness-110" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                    <Plus className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--color-text-subtle)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{s.q}</span>
                      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>{labelTipo(s.t)}</span>
                    </span>
                  </button>
                ))}
              </div>
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
  const tema = pg ? temaPesquisaDe(pg.theme) : null;
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
                  <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: "#8FA0C8", marginBottom: 10 }}>{tema.l}</p>
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
