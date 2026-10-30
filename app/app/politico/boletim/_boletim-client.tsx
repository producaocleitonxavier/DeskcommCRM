"use client";

/**
 * Boletim Semanal de Inteligência — cliente. Layout premium, à prova de criança:
 * gera sob demanda, mostra "a semana em 3 frases", sentimento com variação,
 * a justaposição MÍDIA (pautas) × POVO (dores/demandas), menções, adversários e
 * ações — e exporta em PDF. Escopo adaptativo ao mandato vem pronto do servidor.
 */
import { useState, useTransition } from "react";
import {
  Sparkles, RefreshCw, Printer, TrendingUp, TrendingDown, Minus,
  Newspaper, HeartHandshake, Users, Lightbulb, MapPin, Loader2, ExternalLink,
} from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { gerarBoletimSemanal, type BoletimSemanal } from "@/app/actions/politico/boletim";

const VERDE = "#17784F";
const VERMELHO = "#A3302A";
const ACCENT = "#D7F36A";

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

  const abrangLabel = abrangencia === "nacional" ? "Nacional" : abrangencia === "estadual" ? "Estadual" : "Municipal";

  function gerar() {
    setErro(null);
    startGerar(async () => {
      const r = await gerarBoletimSemanal({ atualizarAntes: true });
      if (r.ok) setBol(r);
      else { setErro(r.erro); setBol(null); }
    });
  }

  function imprimir() {
    if (!bol) return;
    const win = window.open("", "_blank", "width=860,height=1000");
    if (!win) return;
    const origin = window.location.origin;
    const variacao = bol.sentimento.indice - bol.sentimento.indiceAnterior;
    const pautasHtml = bol.pautas.length
      ? bol.pautas.map((p) => `<div class="row"><span>${esc(p.topico)}</span><span class="n">${p.total}${p.neg ? ` <small style="color:${VERMELHO}">(${p.neg} neg)</small>` : ""}</span></div>`).join("")
      : `<p class="muted">Sem pautas captadas.</p>`;
    const doresHtml = bol.dores.length
      ? bol.dores.map((d) => `<div class="row"><span>${esc(d.grupo)}</span><span class="n">${d.total}</span></div>`).join("")
      : `<p class="muted">Sem demandas novas registradas na semana.</p>`;
    const mencoesHtml = bol.mencoes.length
      ? bol.mencoes.map((m) => `<li><b style="color:${corSent(m.sentimento)}">${labelSent(m.sentimento)}</b> &middot; ${esc(m.titulo)} ${m.fonte ? `<i>(${esc(m.fonte)})</i>` : ""}</li>`).join("")
      : `<li class="muted">Sem menções na semana.</li>`;
    const advHtml = bol.adversarios.length
      ? bol.adversarios.map((a) => `<div class="row"><span>${esc(a.nome)} <small class="muted">(${esc(a.risco)})</small></span><span class="n">${a.sinais7d} sinais</span></div>`).join("")
      : `<p class="muted">Nenhum adversário cadastrado.</p>`;
    const acoesHtml = bol.acoes.length
      ? bol.acoes.map((a) => `<li><b>${esc(a.title)}</b> — ${esc(a.acao || a.descricao)}</li>`).join("")
      : `<li class="muted">Nenhuma ação pendente.</li>`;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Boletim Semanal — ${esc(lugar)}</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1d23;margin:0;padding:32px;max-width:820px;margin:0 auto}
  .brandrow{display:flex;align-items:center;gap:8px;margin-bottom:4px}
  .logo{height:26px;width:auto} .brand{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5C7F23}
  h1{font-size:22px;margin:6px 0 2px} .meta{font-size:12px;color:#6b7280;margin-bottom:16px}
  .resumo{background:#F3F7E8;border:1px solid #D7E6A8;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;margin-bottom:18px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:18px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:3px 0;border-bottom:1px solid #f1f2f4}
  .n{font-weight:700;white-space:nowrap} .muted{color:#9aa0ae;font-size:12px}
  ul{margin:4px 0;padding-left:18px} li{font-size:12.5px;line-height:1.6;margin-bottom:3px}
  .sent{display:flex;align-items:baseline;gap:8px} .idx{font-size:34px;font-weight:800}
  .foot{margin-top:22px;font-size:10px;color:#9aa0ae;border-top:1px solid #eee;padding-top:8px;line-height:1.5}
</style></head><body>
  <div class="brandrow"><img class="logo" src="${origin}/gipchat-elmo.png" alt="GIP"/><div class="brand">GIP &middot; Guerrilheiros Intelig&ecirc;ncia Pol&iacute;tica</div></div>
  <h1>Boletim Semanal de Intelig&ecirc;ncia</h1>
  <div class="meta">${esc(escopoRotulo)} &middot; ${fmtData(bol.periodoDe)} a ${fmtData(bol.periodoAte)}${mandatoNome ? ` &middot; ${esc(mandatoNome)}` : ""}</div>
  ${bol.resumoIa ? `<div class="resumo">${esc(bol.resumoIa)}</div>` : ""}
  <div class="sent">
    <span class="idx" style="color:${bol.sentimento.indice >= 0 ? VERDE : VERMELHO}">${bol.sentimento.indice >= 0 ? "+" : ""}${bol.sentimento.indice}</span>
    <span class="muted">índice de sentimento (-100 a +100) &middot; ${variacao >= 0 ? "+" : ""}${variacao} vs. semana passada &middot; ${bol.sentimento.total} menções (${bol.sentimento.positivos} pos / ${bol.sentimento.neutros} neu / ${bol.sentimento.negativos} neg)</span>
  </div>
  <div class="grid">
    <div><h2>Na mídia (pautas)</h2>${pautasHtml}</div>
    <div><h2>Nas ruas (demandas: ${bol.doresNovas} novas, ${bol.doresResolvidas} resolvidas)</h2>${doresHtml}</div>
  </div>
  <h2>Menções que importam</h2><ul>${mencoesHtml}</ul>
  <div class="grid">
    <div><h2>Radar de adversários</h2>${advHtml}</div>
    <div><h2>Ações da semana</h2><ul>${acoesHtml}</ul></div>
  </div>
  <p class="foot">Boletim gerado por IA a partir da escuta de mídia (Google News) + Instagram, dos sinais de sentimento e das demandas do gabinete. Os contatos e demandas são da sua operação. Documento de apoio; confira antes de decidir.</p>
</body></html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  }

  return (
    <div className="mx-auto max-w-[960px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
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

      {!bol && (
        <div className="wr-card p-7 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(215,243,106,0.18)", color: "#5C7F23" }}>
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
        <section className="wr-card p-6" id="boletim">
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
            <div className="mb-5 rounded-xl p-4" style={{ background: "rgba(215,243,106,0.12)", border: "1px solid rgba(92,127,35,0.28)" }}>
              <p className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "#5C7F23" }}>
                <Sparkles size={13} /> A semana em poucas frases
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>{bol.resumoIa}</p>
            </div>
          )}

          {/* Sentimento + KPIs */}
          <div className="mb-5 grid gap-3 sm:grid-cols-4">
            <div className="wr-card p-4 sm:col-span-1" style={{ background: "var(--color-surface-elevated)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Sentimento</p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-heading text-3xl font-black tabular-nums" style={{ color: bol.sentimento.indice >= 0 ? VERDE : VERMELHO }}>
                  {bol.sentimento.indice >= 0 ? "+" : ""}{bol.sentimento.indice}
                </span>
                <Variacao atual={bol.sentimento.indice} anterior={bol.sentimento.indiceAnterior} />
              </div>
              <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                {bol.sentimento.total} menções · {bol.sentimento.positivos}✓ {bol.sentimento.negativos}✕
              </p>
            </div>
            <Kpi rotulo="Demandas novas" valor={bol.doresNovas} cor={VERDE} />
            <Kpi rotulo="Resolvidas" valor={bol.doresResolvidas} cor={VERDE} />
            <Kpi rotulo="Ações pendentes" valor={bol.acoes.length} cor={bol.acoes.length ? "#92600A" : "var(--color-text)"} />
          </div>

          {/* MÍDIA × POVO — a justaposição que só nós temos */}
          <div className="mb-5 grid gap-3 lg:grid-cols-2">
            <div className="wr-card p-4" style={{ background: "var(--color-surface-elevated)" }}>
              <p className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--color-text)" }}>
                <Newspaper size={14} style={{ color: "#3B7DC4" }} /> Na mídia <span className="font-normal" style={{ color: "var(--color-text-subtle)" }}>— o que falaram</span>
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
              ) : <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Sem pautas captadas nesta semana.</p>}
            </div>

            <div className="wr-card p-4" style={{ background: "var(--color-surface-elevated)" }}>
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
              <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Menções que importam</p>
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

          {/* Adversários + Ações */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="wr-card p-4" style={{ background: "var(--color-surface-elevated)" }}>
              <p className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--color-text)" }}>
                <Users size={14} style={{ color: "#A3302A" }} /> Radar de adversários
              </p>
              {bol.adversarios.length ? (
                <div className="space-y-1.5">
                  {bol.adversarios.map((a) => (
                    <div key={a.nome} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate" style={{ color: "var(--color-text)" }}>{a.nome}</span>
                      <span className="shrink-0 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                        <span className="capitalize">{a.risco}</span> · {a.sinais7d} sinais
                      </span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Cadastre adversários na Opinião Pública para monitorar aqui.</p>}
            </div>

            <div className="wr-card p-4" style={{ background: "var(--color-surface-elevated)" }}>
              <p className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: "var(--color-text)" }}>
                <Lightbulb size={14} style={{ color: "#C9A23A" }} /> Ações da semana
              </p>
              {bol.acoes.length ? (
                <div className="space-y-2">
                  {bol.acoes.slice(0, 5).map((a, i) => (
                    <div key={i}>
                      <p className="text-[13px] font-semibold" style={{ color: "var(--color-text)" }}>{a.title}</p>
                      <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>{a.acao || a.descricao}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Nenhuma ação pendente — semana tranquila.</p>}
            </div>
          </div>

          <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--color-text-subtle)" }}>
            Cruza a <strong>escuta de mídia</strong> (Google News + Instagram) com as <strong>demandas do gabinete</strong> — o que o SAM não enxerga.
            Última menção captada: {fmtData(bol.ultimaMencaoEm)}. Gerado por IA; confira antes de decidir.
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

function Kpi({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div className="wr-card p-4" style={{ background: "var(--color-surface-elevated)" }}>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>{rotulo}</p>
      <p className="mt-1 font-heading text-3xl font-black tabular-nums" style={{ color: cor }}>{valor}</p>
    </div>
  );
}
