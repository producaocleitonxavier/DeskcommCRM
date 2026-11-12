"use client";

/**
 * Boletim Semanal de Inteligência — cliente. Layout premium, à prova de criança:
 * gera sob demanda, mostra "a semana em 3 frases", sentimento com variação,
 * a justaposição MÍDIA (pautas) × POVO (dores/demandas), menções, adversários e
 * ações — e exporta em PDF. Escopo adaptativo ao mandato vem pronto do servidor.
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Sparkles, RefreshCw, Printer, TrendingUp, TrendingDown, Minus,
  Newspaper, HeartHandshake, Users, Lightbulb, MapPin, Loader2, ExternalLink,
  History, CalendarClock, Clock,
} from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import {
  gerarBoletimSemanal, listarBoletins, lerBoletimSalvo,
  type BoletimSemanal, type BoletimHistItem,
} from "@/app/actions/politico/boletim";
import { formatarDuracao } from "@/lib/politico/atendimento-metricas";

const VERDE = "#17784F";
const VERMELHO = "#A3302A";
const ACCENT = "var(--color-accent)";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const fmtData = (iso: string | null) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); } catch { return "—"; }
};
const corSent = (s: string | null) => (s === "positivo" ? VERDE : s === "negativo" ? VERMELHO : "var(--color-text-muted)");
const labelSent = (s: string | null) => (s === "positivo" ? "positivo" : s === "negativo" ? "negativo" : "neutro");

export default function BoletimClient({
  mandatoNome, cargo, escopoRotulo, lugar, abrangencia,
}: {
  mandatoNome: string | null;
  cargo: string | null;
  escopoRotulo: string;
  lugar: string;
  abrangencia: "municipal" | "estadual" | "nacional";
}) {
  const [bol, setBol] = useState<BoletimSemanal | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, startGerar] = useTransition();
  const [hist, setHist] = useState<BoletimHistItem[]>([]);
  const [abrindoId, setAbrindoId] = useState<string | null>(null);

  const abrangLabel = abrangencia === "nacional" ? "Nacional" : abrangencia === "estadual" ? "Estadual" : "Municipal";

  const carregarHistorico = useCallback(async () => {
    const r = await listarBoletins();
    if (r.ok) setHist(r.itens);
  }, []);

  // Carrega o histórico ao abrir a tela (edições que o cron de segunda gravou).
  useEffect(() => { void carregarHistorico(); }, [carregarHistorico]);

  function gerar() {
    setErro(null);
    startGerar(async () => {
      const r = await gerarBoletimSemanal({ atualizarAntes: true });
      if (r.ok) { setBol(r); void carregarHistorico(); }
      else { setErro(r.erro); setBol(null); }
    });
  }

  function abrirEdicao(id: string) {
    setErro(null);
    setAbrindoId(id);
    startGerar(async () => {
      const r = await lerBoletimSalvo(id);
      if (r.ok) { setBol(r); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); }
      else setErro(r.erro);
      setAbrindoId(null);
    });
  }

  function imprimir() {
    if (!bol) return;
    const win = window.open("", "_blank", "width=860,height=1000");
    if (!win) return;
    const origin = window.location.origin;
    const pautasHtml = bol.pautas.length
      ? bol.pautas.map((p) => `<div class="row"><span>${esc(p.topico)}</span><span class="n">${p.total}${p.neg ? ` <small style="color:${VERMELHO}">(${p.neg} neg)</small>` : ""}</span></div>`).join("")
      : `<p class="muted">Nenhuma notícia citou você nesta semana.</p>`;
    const doresHtml = bol.dores.length
      ? bol.dores.map((d) => `<div class="row"><span>${esc(d.grupo)}</span><span class="n">${d.total}</span></div>`).join("")
      : `<p class="muted">Sem demandas novas registradas na semana.</p>`;
    const mencoesHtml = bol.mencoes.length
      ? bol.mencoes.map((m) => `<li><b style="color:${corSent(m.sentimento)}">${labelSent(m.sentimento)}</b> &middot; ${esc(m.titulo)} ${m.fonte ? `<i>(${esc(m.fonte)})</i>` : ""}</li>`).join("")
      : "";
    const paraFazerHtml = bol.paraFazer && bol.paraFazer.length
      ? bol.paraFazer.map((t) => `<li>${esc(t)}</li>`).join("")
      : `<li class="muted">Nada parado e ninguém sem resposta — semana em dia.</li>`;
    const at = bol.atendimento;
    const atendimentoHtml = at && at.conversas > 0
      ? `<div class="row"><span>Pessoas que procuraram o gabinete</span><span class="n">${at.conversas}</span></div>` +
        `<div class="row"><span>Respondidas</span><span class="n">${at.respondidas}</span></div>` +
        `<div class="row"><span>Sem resposta</span><span class="n">${at.semResposta}</span></div>` +
        `<div class="row"><span>Primeira resposta em (metade dos casos)</span><span class="n">${esc(formatarDuracao(at.medianaPrimeiraRespostaSeg))}</span></div>`
      : `<p class="muted">Ninguém escreveu para o gabinete pelo WhatsApp nesta semana.</p>`;
    const atrasoHtml = bol.atrasadas && bol.atrasadas.porOrgao.length
      ? bol.atrasadas.porOrgao.map((o) => `<div class="row"><span>${esc(o.orgao)}</span><span class="n">${o.total}</span></div>`).join("")
      : `<p class="muted">Nenhuma demanda fora do prazo.</p>`;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Boletim Semanal — ${esc(lugar)}</title>
<style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#263445;margin:0;padding:32px;max-width:820px;margin:0 auto}
  .head{background:#14233A;border-top:5px solid #C4E64A;border-radius:10px;padding:18px 20px 16px;margin-bottom:18px}
  .brandrow{display:flex;align-items:center;gap:8px;margin-bottom:4px}
  .logo{height:26px;width:auto} .brand{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#D7F36A}
  h1{font-size:23px;margin:6px 0 3px;color:#fff} .meta{font-size:12px;color:#B9C7DA}
  .resumo{background:#EEF3F9;border-left:4px solid #C4E64A;border-radius:8px;padding:14px 16px;font-size:14px;line-height:1.6;margin-bottom:18px}
  h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.07em;color:#14233A;margin:18px 0 8px;border-left:4px solid #C4E64A;padding:1px 0 1px 8px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:3px 0;border-bottom:1px solid #f1f2f4}
  .n{font-weight:700;white-space:nowrap;color:#14233A} .muted{color:#9aa0ae;font-size:12px}
  ul{margin:4px 0;padding-left:18px} li{font-size:12.5px;line-height:1.6;margin-bottom:3px}
  .sent{display:flex;align-items:baseline;gap:8px} .idx{font-size:34px;font-weight:800}
  .foot{margin-top:22px;font-size:10px;color:#5B6B80;border-top:2px solid #14233A;padding-top:8px;line-height:1.5}
</style></head><body>
  <div class="head"><div class="brandrow"><img class="logo" src="${origin}/gipchat-elmo.png" alt="GIP"/><div class="brand">GIP &middot; Guerrilheiros Intelig&ecirc;ncia Pol&iacute;tica</div></div>
  <h1>Boletim Semanal do Mandato</h1>
  <div class="meta">${esc(escopoRotulo)} &middot; ${fmtData(bol.periodoDe)} a ${fmtData(bol.periodoAte)}${mandatoNome ? ` &middot; ${esc(mandatoNome)}` : ""}</div></div>
  ${bol.resumoIa ? `<div class="resumo">${esc(bol.resumoIa)}</div>` : ""}
  <div class="grid">
    <div><h2>O que o povo pediu (${bol.doresNovas} novas, ${bol.doresResolvidas} resolvidas)</h2>${doresHtml}</div>
    <div><h2>Fora do prazo, por órgão (${bol.atrasadas?.total ?? 0})</h2>${atrasoHtml}</div>
  </div>
  <div class="grid">
    <div><h2>Para fazer esta semana</h2><ul>${paraFazerHtml}</ul></div>
    <div><h2>Atendimento da semana</h2>${atendimentoHtml}</div>
  </div>
  <h2>Na imprensa, citando você</h2>${pautasHtml}${mencoesHtml ? `<ul>${mencoesHtml}</ul>` : ""}
  <p class="foot">Boletim feito com o que o gabinete registrou na semana (demandas e atendimento) e com as notícias que citaram o mandato. O resumo de abertura é escrito por IA. Documento de apoio; confira antes de decidir.</p>
</body></html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  }

  return (
    <div className="gip-ambient-bg mx-auto max-w-[960px] px-4 py-7 space-y-5">
      <CommandHero
        eyebrow="Inteligência · Boletim"
        titulo="Boletim Semanal"
        subtitulo="O raio-x da semana num lugar só — e o que fazer. O escopo se adapta ao seu mandato."
        extra={
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: "rgba(255,255,255,0.12)", color: "#FFF", border: "1px solid rgba(255,255,255,0.25)" }}>
            <MapPin size={13} /> {abrangLabel} · {lugar}
          </span>
        }
      />

      {/* Edições anteriores — o cron de segunda grava cada semana aqui. */}
      {hist.length > 0 && (
        <div className="gip-glass p-4">
          <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
            <History size={14} /> Edições anteriores
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {hist.map((h) => {
              const ativo = abrindoId === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => abrirEdicao(h.id)}
                  disabled={gerando}
                  className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition hover:brightness-[1.03] disabled:opacity-60"
                  style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--color-text)" }}>
                      <CalendarClock size={13} style={{ color: "#5C7F23" }} />
                      {fmtData(h.periodoDe)} a {fmtData(h.periodoAte)}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                      {h.origem === "cron" ? <><Clock size={11} /> semana automática</> : "gerado à mão"}
                    </span>
                  </span>
                  <span className="shrink-0 font-heading text-lg font-black tabular-nums" style={{ color: h.indice >= 0 ? VERDE : VERMELHO }}>
                    {ativo ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{h.indice >= 0 ? "+" : ""}{h.indice}</>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!bol && (
        <div className="gip-glass p-7 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "color-mix(in srgb, var(--color-accent) 18%, transparent)", color: "#5C7F23" }}>
            <Newspaper size={24} />
          </div>
          <p className="mx-auto max-w-md text-sm" style={{ color: "var(--color-text-muted)" }}>
            Reúne a semana inteira: sentimento, o que a <strong>mídia</strong> falou, o que o <strong>povo pediu</strong> no gabinete,
            os adversários e as ações recomendadas — com um resumo da IA e PDF para levar à reunião.
          </p>
          <button type="button" onClick={gerar} disabled={gerando} className="wr-btn-dark mx-auto mt-5 inline-flex items-center gap-2 disabled:opacity-60">
            {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {gerando ? "Reunindo a semana…" : "Gerar boletim da semana"}
          </button>
          {erro && <p className="mt-3 text-sm" style={{ color: "#E08079" }}>{erro}</p>}
        </div>
      )}

      {bol && (
        <section className="gip-glass p-6" id="boletim">
          {/* Cabeçalho marca GIP */}
          <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/gipchat-elmo.png" alt="GIP" style={{ height: 28, width: "auto" }} />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#5C7F23" }}>GIP · Guerrilheiros Inteligência Política</p>
                <h2 className="font-heading text-lg font-bold leading-tight" style={{ color: "var(--color-text)" }}>Boletim da semana · {lugar}</h2>
                <p className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{fmtData(bol.periodoDe)} a {fmtData(bol.periodoAte)}{cargo ? ` · ${cargo}` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={gerar} disabled={gerando} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                {gerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Atualizar
              </button>
              <button type="button" onClick={imprimir} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
                <Printer className="h-3.5 w-3.5" /> Imprimir
              </button>
            </div>
          </div>

          {/* A semana em 3 frases */}
          {bol.resumoIa && (
            <div className="mb-5 rounded-xl p-4" style={{ background: "color-mix(in srgb, var(--color-accent) 12%, transparent)", border: "1px solid rgba(92,127,35,0.28)" }}>
              <p className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "#5C7F23" }}>
                <Sparkles size={13} /> A semana em poucas frases
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>{bol.resumoIa}</p>
            </div>
          )}

          {/* Os 4 números da semana — todos do trabalho do gabinete */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi rotulo="Demandas novas" valor={bol.doresNovas} cor={VERDE} />
            <Kpi rotulo="Resolvidas" valor={bol.doresResolvidas} cor={VERDE} />
            <Kpi rotulo="Fora do prazo" valor={bol.atrasadas?.total ?? "—"} cor={(bol.atrasadas?.total ?? 0) > 0 ? "#92600A" : "var(--color-text)"} />
            <Kpi rotulo="Conversas sem resposta" valor={bol.atendimento?.semResposta ?? "—"} cor={(bol.atendimento?.semResposta ?? 0) > 0 ? "#92600A" : "var(--color-text)"} />
          </div>

          {/* MÍDIA × POVO — a justaposição que só nós temos */}
          <div className="mb-5 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl p-4" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
              <p className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--color-text)" }}>
                <Newspaper size={14} style={{ color: "#3B7DC4" }} /> Na imprensa <span className="font-normal" style={{ color: "var(--color-text-subtle)" }}>— citando você</span>
              </p>
              {bol.pautas.length ? (
                <div className="space-y-1.5">
                  {bol.pautas.map((p) => (
                    <div key={p.topico} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate capitalize" style={{ color: "var(--color-text)" }}>{p.topico}</span>
                      <span className="shrink-0 tabular-nums font-bold" style={{ color: "var(--color-text)" }}>
                        {p.total}{p.neg > 0 && <span className="ml-1 text-[11px] font-semibold" style={{ color: VERMELHO }}>({p.neg} neg)</span>}
                      </span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Nenhuma notícia citou você nesta semana. O noticiário da cidade fica no Radar da imprensa.</p>}
            </div>

            <div className="rounded-2xl p-4" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
              <p className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--color-text)" }}>
                <HeartHandshake size={14} style={{ color: "#C2568C" }} /> Nas ruas <span className="font-normal" style={{ color: "var(--color-text-subtle)" }}>— o que o povo pediu</span>
              </p>
              {bol.dores.length ? (
                <div className="space-y-1.5">
                  {bol.dores.map((d) => (
                    <div key={d.grupo} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate" style={{ color: "var(--color-text)" }}>{d.grupo}</span>
                      <span className="shrink-0 tabular-nums font-bold" style={{ color: "var(--color-text)" }}>{d.total}</span>
                    </div>
                  ))}
                  {bol.doresBairros.length > 0 && (
                    <p className="pt-1.5 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                      Bairros: {bol.doresBairros.map((b) => `${b.bairro} (${b.total})`).join(" · ")}
                    </p>
                  )}
                </div>
              ) : <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Nenhuma demanda nova registrada no gabinete nesta semana.</p>}
            </div>
          </div>

          {/* Menções que importam */}
          {bol.mencoes.length > 0 && (
            <div className="mb-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Notícias que citaram você</p>
              <div className="space-y-1.5">
                {bol.mencoes.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                    <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: m.sentimento === "negativo" ? "#FDEBE9" : m.sentimento === "positivo" ? "#E4F3EA" : "var(--color-surface-2)", color: corSent(m.sentimento) }}>
                      {labelSent(m.sentimento)}
                    </span>
                    <span className="min-w-0 flex-1" style={{ color: "var(--color-text)" }}>
                      {m.titulo}
                      {m.fonte && <span className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}> · {m.fonte}</span>}
                    </span>
                    {m.url && !m.url.startsWith("igc:") && (
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0" style={{ color: "var(--color-text-subtle)" }}><ExternalLink size={13} /></a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Para fazer + Atendimento — só em edições que já têm estes dados */}
          {(bol.paraFazer || bol.atendimento) && (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl p-4" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
                <p className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--color-text)" }}>
                  <Lightbulb size={14} style={{ color: "#C9A23A" }} /> Para fazer esta semana
                </p>
                {bol.paraFazer && bol.paraFazer.length > 0 ? (
                  <ul className="space-y-2">
                    {bol.paraFazer.map((t, i) => (
                      <li key={i} className="flex gap-2 text-[13px]" style={{ color: "var(--color-text)" }}>
                        <span aria-hidden style={{ color: "var(--color-text-subtle)" }}>{i + 1}.</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Nada parado e ninguém sem resposta — semana em dia.</p>}
              </div>

              <div className="rounded-2xl p-4" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
                <p className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--color-text)" }}>
                  <Users size={14} style={{ color: "#3B7DC4" }} /> Atendimento da semana
                </p>
                {bol.atendimento && bol.atendimento.conversas > 0 ? (
                  <div className="space-y-1.5 text-sm">
                    <Linha rotulo="Pessoas que procuraram o gabinete" valor={String(bol.atendimento.conversas)} />
                    <Linha rotulo="Respondidas" valor={String(bol.atendimento.respondidas)} />
                    <Linha rotulo="Sem resposta" valor={String(bol.atendimento.semResposta)} />
                    <Linha rotulo="Primeira resposta em (metade dos casos)" valor={formatarDuracao(bol.atendimento.medianaPrimeiraRespostaSeg)} />
                  </div>
                ) : <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Ninguém escreveu para o gabinete pelo WhatsApp nesta semana.</p>}
                {bol.atrasadas && bol.atrasadas.porOrgao.length > 0 && (
                  <p className="pt-2.5 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                    Fora do prazo por órgão: {bol.atrasadas.porOrgao.map((o) => `${o.orgao} (${o.total})`).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          )}

          <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--color-text-subtle)" }}>
            Feito com o que o gabinete registrou na semana: <strong>demandas</strong>, <strong>atendimento</strong> e as notícias que citaram você.
            Resumo de abertura escrito por IA; confira antes de decidir.
          </p>
        </section>
      )}
    </div>
  );
}

function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  const d = atual - anterior;
  if (d === 0) return <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: "var(--color-text-subtle)" }}><Minus size={12} /> estável</span>;
  const sobe = d > 0;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: sobe ? VERDE : VERMELHO }}>
      {sobe ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {d > 0 ? "+" : ""}{d}
    </span>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate" style={{ color: "var(--color-text)" }}>{rotulo}</span>
      <span className="shrink-0 tabular-nums font-bold" style={{ color: "var(--color-text)" }}>{valor}</span>
    </div>
  );
}

function Kpi({ rotulo, valor, cor }: { rotulo: string; valor: number | string; cor: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>{rotulo}</p>
      <p className="mt-1 font-heading text-3xl font-black tabular-nums" style={{ color: cor }}>{valor}</p>
    </div>
  );
}
