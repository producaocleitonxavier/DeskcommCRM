"use client";

/**
 * Corpo visual da lista de Pessoas (War Room 2.0): filtros (busca + nível +
 * temperatura via URL) e grid de cards. Client component — recebe os dados já
 * buscados pelo server (page.tsx).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, MapPin, Search, Users } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";
import BaseTerritorioHero, { type BaseTerritorioResumo } from "@/components/politico/base-territorio-hero";
import { carimbarCidadesDosLeads, carimbarZonasDosLeads } from "@/app/actions/politico/gabinete-actions";
import type { LeadRow } from "./page";

const ETAPAS = [
  { value: "novo_cadastro", label: "Novo contato", hex: "#C9CEF3", badge: { bg: "#EEF0FB", fg: "#3B4280" }, escuro: false },
  { value: "simpatizante", label: "Simpatizante", hex: "#9AA5EA", badge: { bg: "#DDE1F7", fg: "#2F3DA8" }, escuro: false },
  { value: "apoiador", label: "Apoiador", hex: "#6B79DD", badge: { bg: "#B4BCF0", fg: "#1E2A80" }, escuro: true },
  { value: "militante", label: "Multiplicador", hex: "#4352C4", badge: { bg: "#4352C4", fg: "#FFFFFF" }, escuro: true },
  { value: "voto_certo", label: "Voto certo", hex: "#26318F", badge: { bg: "#26318F", fg: "#FFFFFF" }, escuro: true },
] as const;

const TEMPS = [
  { value: "quente", label: "Quente", dot: "#EF4444" },
  { value: "morno", label: "Morno", dot: "#F59E0B" },
  { value: "frio", label: "Frio", dot: "#3B82F6" },
] as const;

function etapaDe(value: string) {
  return ETAPAS.find((e) => e.value === value) ?? ETAPAS[0];
}

function iniciais(nome: string | null | undefined): string {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/);
  const a = partes[0]?.[0] ?? "";
  const b = partes.length > 1 ? partes[partes.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase() || "?";
}

function tempoRelativo(data: string | null): string {
  if (!data) return "sem atividade";
  const diffMin = Math.floor((Date.now() - new Date(data).getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `há ${diffD} ${diffD === 1 ? "dia" : "dias"}`;
  return `há ${Math.floor(diffD / 30)} meses`;
}

interface Filtros {
  etapa: string;
  busca: string;
  temp: string;
  cidade: string;
  pagina: number;
}

export interface LeadsClientProps {
  leads: LeadRow[];
  total: number;
  contagens: Record<string, number>;
  cidades: { id: string; name: string; n: number }[];
  mapaResumo: BaseTerritorioResumo;
  filtros: Filtros;
  porPagina: number;
}

export default function LeadsClient({ leads, total, contagens, cidades, mapaResumo, filtros, porPagina }: LeadsClientProps) {
  const router = useRouter();
  const [carimbando, setCarimbando] = useState(false);
  const [carimboMsg, setCarimboMsg] = useState<string | null>(null);
  const [carimbandoCidade, setCarimbandoCidade] = useState(false);
  const [carimboCidadeMsg, setCarimboCidadeMsg] = useState<string | null>(null);
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  function href(overrides: Partial<Filtros>): string {
    const merged = { ...filtros, pagina: 1, ...overrides };
    const q = new URLSearchParams();
    if (merged.etapa) q.set("etapa", merged.etapa);
    if (merged.busca) q.set("busca", merged.busca);
    if (merged.temp) q.set("temp", merged.temp);
    if (merged.cidade) q.set("cidade", merged.cidade);
    if (merged.pagina > 1) q.set("pagina", String(merged.pagina));
    const s = q.toString();
    return `/app/politico/leads${s ? `?${s}` : ""}`;
  }

  function Pill({ ativo, children, ...props }: { ativo: boolean; children: React.ReactNode; href: string }) {
    return (
      <Link
        href={props.href}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
        style={
          ativo
            ? { background: "#16181D", color: "#FFFFFF", borderColor: "#16181D" }
            : { background: "var(--color-surface)", color: "var(--color-text-muted)", borderColor: "var(--color-border)" }
        }
      >
        {children}
      </Link>
    );
  }

  return (
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Comando · Pessoas"
        titulo="Pessoas"
        subtitulo="Toda a base em um lugar — filtre por etapa ou temperatura."
        acoes={[{ href: "/app/politico/leads/novo", label: "+ Novo cadastro", primary: true }]}
      />

      {/* ── Carimbar território: cidade (link) e zona (pelo bairro) ─ */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {(carimboCidadeMsg || carimboMsg) && (
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{carimboCidadeMsg ?? carimboMsg}</span>
        )}
        <button
          type="button"
          disabled={carimbandoCidade}
          onClick={async () => {
            if (!window.confirm("Religar a cidade das pessoas (preenche o mapa e o filtro de Cidade a partir do cadastro). Só preenche quem está sem cidade. Pode levar alguns segundos.")) return;
            setCarimboCidadeMsg(null);
            setCarimbandoCidade(true);
            const res = await carimbarCidadesDosLeads();
            setCarimbandoCidade(false);
            if (res.ok) {
              setCarimboCidadeMsg(`${res.carimbados.toLocaleString("pt-BR")} pessoa(s) ganharam cidade.`);
              router.refresh();
            } else {
              setCarimboCidadeMsg(res.erro);
            }
          }}
          className="wr-btn inline-flex items-center gap-2 disabled:opacity-60"
          title="Religa a cidade do cadastro ao mapa e ao filtro de Cidade. Só preenche quem está sem cidade."
        >
          <Building2 className="h-4 w-4" aria-hidden /> {carimbandoCidade ? "Preenchendo cidades…" : "Preencher cidades que faltam"}
        </button>
        <button
          type="button"
          disabled={carimbando}
          onClick={async () => {
            if (!window.confirm("Preencher a zona eleitoral das pessoas pelo bairro (dados do TSE)? Preenche só quem está sem zona. Pode levar alguns segundos.")) return;
            setCarimboMsg(null);
            setCarimbando(true);
            const res = await carimbarZonasDosLeads();
            setCarimbando(false);
            if (res.ok) {
              setCarimboMsg(`${res.carimbados.toLocaleString("pt-BR")} pessoa(s) ganharam zona pelo bairro.`);
              router.refresh();
            } else {
              setCarimboMsg(res.erro);
            }
          }}
          className="wr-btn inline-flex items-center gap-2 disabled:opacity-60"
          title="Deriva a zona eleitoral pelo bairro, usando dados agregados do TSE. Só preenche quem está sem zona."
        >
          <MapPin className="h-4 w-4" aria-hidden /> {carimbando ? "Preenchendo zonas…" : "Preencher zonas pelo bairro"}
        </button>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────── */}
      <div className="wr-card space-y-4 p-4 sm:p-5">
        {/* Busca */}
        <form action="/app/politico/leads" method="get">
          {filtros.etapa && <input type="hidden" name="etapa" value={filtros.etapa} />}
          {filtros.temp && <input type="hidden" name="temp" value={filtros.temp} />}
          {filtros.cidade && <input type="hidden" name="cidade" value={filtros.cidade} />}
          <label
            className="flex min-h-[44px] items-center gap-2.5 rounded-full px-4"
            style={{ background: "var(--color-surface-elevated)" }}
          >
            <Search className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
            <input
              type="search"
              name="busca"
              placeholder="Buscar por nome…"
              defaultValue={filtros.busca}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
              style={{ color: "var(--color-text)" }}
            />
          </label>
        </form>

        {/* Nível do funil */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Nível:</span>
          <Pill ativo={!filtros.etapa} href={href({ etapa: "" })}>
            Todos
            <span className="tabular-nums opacity-70">{(contagens._total ?? 0).toLocaleString("pt-BR")}</span>
          </Pill>
          {ETAPAS.map((e) => (
            <Pill key={e.value} ativo={filtros.etapa === e.value} href={href({ etapa: filtros.etapa === e.value ? "" : e.value })}>
              <span className="h-2 w-2 rounded-full" style={{ background: e.hex }} aria-hidden />
              {e.label}
              <span className="tabular-nums opacity-70">{(contagens[e.value] ?? 0).toLocaleString("pt-BR")}</span>
            </Pill>
          ))}
        </div>

        {/* Temperatura */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Temperatura:</span>
          <Pill ativo={!filtros.temp} href={href({ temp: "" })}>Todas</Pill>
          {TEMPS.map((t) => (
            <Pill key={t.value} ativo={filtros.temp === t.value} href={href({ temp: filtros.temp === t.value ? "" : t.value })}>
              <span className="h-2 w-2 rounded-full" style={{ background: t.dot }} aria-hidden />
              {t.label}
            </Pill>
          ))}
        </div>

        {/* Cidade */}
        {cidades.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>Cidade:</span>
            <select
              value={filtros.cidade}
              onChange={(e) => router.push(href({ cidade: e.target.value }))}
              className="h-9 max-w-[300px] rounded-full px-3.5 text-xs font-medium outline-none"
              style={{
                background: "var(--color-surface-elevated)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
            >
              <option value="">Todas as cidades</option>
              {cidades.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.n.toLocaleString("pt-BR")})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Onde está a base: ranking de cidades + bairros — acima dos cards ── */}
      <BaseTerritorioHero resumo={mapaResumo} />

      {/* ── Lista ───────────────────────────────────────────────── */}
      {leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhuma pessoa encontrada"
          description={
            filtros.etapa || filtros.busca || filtros.temp
              ? "Nenhum resultado para os filtros atuais. Ajuste a busca ou limpe os filtros."
              : "Sua base está vazia. Cadastre a primeira pessoa para começar a mobilização."
          }
          action={{ label: "Cadastrar primeira pessoa", href: "/app/politico/leads/novo" }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {leads.map((lead) => {
              const et = etapaDe(lead.support_level);
              const temp = TEMPS.find((t) => t.value === lead.temperature);
              const nome = lead.contacts?.name ?? "Sem nome";
              return (
                <div key={lead.id} className="wr-card flex flex-col gap-3 p-5 transition-shadow duration-200 hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                      style={{
                        background: `linear-gradient(135deg, ${et.hex} 0%, #26318F 100%)`,
                        color: et.escuro ? "#FFFFFF" : "#16181D",
                      }}
                      aria-hidden
                    >
                      {iniciais(nome)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold leading-tight">{nome}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {lead.contacts?.phone_number ?? "sem telefone"}
                      </div>
                    </div>
                    {temp && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: temp.dot }}
                        title={`Temperatura: ${temp.label}`}
                      />
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{ background: et.badge.bg, color: et.badge.fg }}
                    >
                      {et.label}
                    </span>
                    <Link href={`/app/politico/leads/${lead.id}`} className="wr-btn text-sm">
                      Ver
                    </Link>
                  </div>

                  <div className="border-t pt-2.5 text-xs text-muted-foreground" style={{ borderColor: "var(--color-border)" }}>
                    {lead.pol_territories?.name ? `${lead.pol_territories.name} · ` : ""}
                    Última atividade {tempoRelativo(lead.contacts?.last_activity_at ?? null)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Paginação */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm" style={{ color: "var(--color-text-subtle)" }}>
            <span>
              Mostrando {leads.length} de {total.toLocaleString("pt-BR")} · página {filtros.pagina} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              {filtros.pagina > 1 && (
                <Link href={href({ pagina: filtros.pagina - 1 })} className="wr-btn text-sm">
                  Anterior
                </Link>
              )}
              {filtros.pagina < totalPaginas && (
                <Link href={href({ pagina: filtros.pagina + 1 })} className="wr-btn text-sm">
                  Próxima
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
