"use client";

/**
 * Corpo visual do Portal da Transparência público (War Room 2.0). Tema escuro
 * branded (espelha as páginas de captação). Mapa de entregas via next/dynamic
 * (Leaflet é client-only). Read-only: nenhum dado pessoal de cidadão aqui —
 * só obras e emendas que o mandato marcou como públicas.
 */

import { useMemo } from "react";
import dynamic from "next/dynamic";

const MapaObrasPublico = dynamic(() => import("@/components/politico/mapa-obras-publico"), {
  ssr: false,
  loading: () => <div className="h-[460px] w-full rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }} />,
});

export interface ObraPublica {
  id: string;
  titulo: string;
  objeto: string | null;
  status: string;
  percentual: number | null;
  areaTematica: string | null;
  municipio: string | null;
  bairro: string | null;
  latitude: number | null;
  longitude: number | null;
  valorCents: number;
  dataPrevista: string | null;
}

export interface EmendaPublica {
  id: string;
  numero: string | null;
  ano: number | null;
  entidade: string | null;
  objeto: string | null;
  areaTematica: string | null;
  municipio: string | null;
  bairro: string | null;
  valorPagoCents: number;
  valorIndicadoCents: number;
  status: string;
  dataPagamento: string | null;
}

interface Props {
  politicoNome: string | null;
  politicoCargo: string | null;
  logoUrl: string | null;
  plataformaNome: string | null;
  obras: ObraPublica[];
  emendas: EmendaPublica[];
}

const STATUS_OBRA: Record<string, { label: string; cor: string }> = {
  planejada: { label: "Planejada", cor: "#60A5FA" },
  em_andamento: { label: "Em andamento", cor: "#D7F36A" },
  paralisada: { label: "Paralisada", cor: "#ef4444" },
  concluida: { label: "Concluída", cor: "#22C55E" },
};
const AREA_LABEL: Record<string, string> = {
  saude: "Saúde",
  educacao: "Educação",
  seguranca: "Segurança",
  assistencia_social: "Assistência social",
  infraestrutura: "Infraestrutura",
  mobilidade: "Mobilidade",
  cultura: "Cultura",
  esporte: "Esporte",
  meio_ambiente: "Meio ambiente",
  agricultura: "Agricultura",
  tecnologia: "Tecnologia",
  outro: "Outro",
};

function moeda(cents: number): string {
  return (Number(cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtData(d: string | null): string {
  if (!d) return "";
  return new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function local(bairro: string | null, municipio: string | null): string {
  return [bairro, municipio].filter(Boolean).join(" · ");
}

export default function PortalTransparenciaClient({ politicoNome, politicoCargo, logoUrl, plataformaNome, obras, emendas }: Props) {
  const titulo = politicoNome || "Gabinete";
  const obrasComGeo = useMemo(() => obras.filter((o) => o.latitude != null && o.longitude != null), [obras]);

  const investidoObras = obras.reduce((s, o) => s + (o.valorCents || 0), 0);
  const aplicadoEmendas = emendas.reduce((s, e) => s + (e.valorPagoCents || 0), 0);
  const totalInvestido = investidoObras + aplicadoEmendas;
  const concluidas = obras.filter((o) => o.status === "concluida").length;

  const vazio = obras.length === 0 && emendas.length === 0;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(170deg,#0E1116 0%,#14181F 55%,#1A2410 100%)", color: "#E8E8E4" }}>
      <div className="mx-auto max-w-[1040px] px-4 py-10 sm:py-14">
        {/* Cabeçalho do mandato */}
        <header className="flex flex-col items-center text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={titulo} className="h-24 w-auto max-w-[280px] object-contain" />
          ) : (
            <>
              <h1 className="font-heading text-3xl font-extrabold leading-tight sm:text-4xl" style={{ color: "#FFFFFF" }}>{titulo}</h1>
              {politicoCargo ? <div className="mt-1 text-[12px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#D7F36A" }}>{politicoCargo}</div> : null}
            </>
          )}
          <div className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ background: "rgba(215,243,106,0.12)", color: "#D7F36A", border: "1px solid rgba(215,243,106,0.3)" }}>
            Portal da Transparência
          </div>
          <p className="mt-3 max-w-xl text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            Acompanhe onde os recursos públicos estão sendo aplicados: obras no território e emendas destinadas, com valores e situação atualizados pelo gabinete.
          </p>
        </header>

        {vazio ? (
          <div className="mt-12 rounded-2xl p-8 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>Ainda não há entregas publicadas neste portal.</p>
          </div>
        ) : (
          <>
            {/* Resumo */}
            <section className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi valor={moeda(totalInvestido)} label="Total aplicado" destaque />
              <Kpi valor={String(obras.length)} label="Obras acompanhadas" />
              <Kpi valor={String(concluidas)} label="Obras concluídas" />
              <Kpi valor={String(emendas.length)} label="Emendas destinadas" />
            </section>

            {/* Mapa de entregas */}
            {obrasComGeo.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-3 font-heading text-xl font-bold" style={{ color: "#FFFFFF" }}>Mapa de entregas</h2>
                <MapaObrasPublico
                  obras={obrasComGeo.map((o) => ({
                    id: o.id,
                    titulo: o.titulo,
                    status: o.status,
                    percentual: o.percentual,
                    lat: o.latitude as number,
                    lng: o.longitude as number,
                    bairro: o.bairro,
                    municipio: o.municipio,
                  }))}
                />
              </section>
            )}

            {/* Obras */}
            {obras.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-3 font-heading text-xl font-bold" style={{ color: "#FFFFFF" }}>Obras e fiscalização</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {obras.map((o) => {
                    const st = STATUS_OBRA[o.status] ?? { label: o.status, cor: "#D7F36A" };
                    return (
                      <article key={o.id} className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-heading text-base font-bold leading-snug" style={{ color: "#FFFFFF" }}>{o.titulo}</h3>
                          <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold" style={{ background: `${st.cor}22`, color: st.cor, border: `1px solid ${st.cor}55` }}>{st.label}</span>
                        </div>
                        {o.objeto ? <p className="mt-1.5 text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>{o.objeto}</p> : null}
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                          {o.areaTematica ? <span>{AREA_LABEL[o.areaTematica] ?? o.areaTematica}</span> : null}
                          {local(o.bairro, o.municipio) ? <span>{local(o.bairro, o.municipio)}</span> : null}
                          {o.valorCents > 0 ? <span style={{ color: "#D7F36A", fontWeight: 600 }}>{moeda(o.valorCents)}</span> : null}
                        </div>
                        {typeof o.percentual === "number" && o.status !== "concluida" && (
                          <div className="mt-3">
                            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                              <div className="h-full rounded-full" style={{ width: `${o.percentual}%`, background: st.cor }} />
                            </div>
                            <div className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>{o.percentual}% executado</div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Emendas */}
            {emendas.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-3 font-heading text-xl font-bold" style={{ color: "#FFFFFF" }}>Emendas destinadas</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {emendas.map((e) => (
                    <article key={e.id} className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      <h3 className="font-heading text-base font-bold leading-snug" style={{ color: "#FFFFFF" }}>{e.entidade || e.objeto || "Emenda"}</h3>
                      {e.objeto && e.entidade ? <p className="mt-1.5 text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>{e.objeto}</p> : null}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                        {e.areaTematica ? <span>{AREA_LABEL[e.areaTematica] ?? e.areaTematica}</span> : null}
                        {local(e.bairro, e.municipio) ? <span>{local(e.bairro, e.municipio)}</span> : null}
                        {e.dataPagamento ? <span>Pago em {fmtData(e.dataPagamento)}</span> : null}
                      </div>
                      <div className="mt-3 flex items-end justify-between">
                        <div>
                          <div className="font-heading text-xl font-bold" style={{ color: "#D7F36A" }}>{moeda(e.valorPagoCents > 0 ? e.valorPagoCents : e.valorIndicadoCents)}</div>
                          <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>{e.valorPagoCents > 0 ? "valor pago" : "valor destinado"}</div>
                        </div>
                        {e.numero ? <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>nº {e.numero}{e.ano ? `/${e.ano}` : ""}</span> : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Rodapé */}
        <footer className="mt-14 border-t pt-6 text-center" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Informações publicadas e atualizadas pelo gabinete de {titulo}.
            {plataformaNome ? ` Plataforma ${plataformaNome}.` : ""}
          </p>
        </footer>
      </div>
    </div>
  );
}

function Kpi({ valor, label, destaque }: { valor: string; label: string; destaque?: boolean }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: destaque ? "rgba(215,243,106,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${destaque ? "rgba(215,243,106,0.3)" : "rgba(255,255,255,0.1)"}` }}>
      <div className="font-heading text-xl font-bold leading-tight sm:text-2xl" style={{ color: destaque ? "#D7F36A" : "#FFFFFF" }}>{valor}</div>
      <div className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>{label}</div>
    </div>
  );
}
