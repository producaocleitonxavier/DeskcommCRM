/**
 * /app/instagram/etiquetas — Etiquetas usadas pelas automações Instagram (War Room 2.0)
 *
 * Lista as etiquetas (tags) que as automações aplicam nos contatos. Permite criar
 * etiquetas e ver quantos contatos as têm. Acesso: admin (gate no layout).
 * Visual: padrão War Room dark.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Tag } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";

interface EtiquetaInfo {
  nome: string;
  totalContatos: number;
}

export default function EtiquetasInstagramPage() {
  const [etiquetas, setEtiquetas] = useState<EtiquetaInfo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novaEtiqueta, setNovaEtiqueta] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/v1/ig-automation-flows?limit=100");
      if (!res.ok) throw new Error("Erro");
      const json = await res.json();
      const flows: Array<{ acoes: Array<{ tipo: string; etiqueta?: string; nivel?: string }> }> = json.data?.flows ?? [];

      const nomes = new Set<string>();
      for (const flow of flows) {
        for (const acao of flow.acoes ?? []) {
          if (acao.tipo === "add_etiqueta" && acao.etiqueta) nomes.add(acao.etiqueta);
          if (acao.tipo === "add_funil_politico" && acao.nivel) nomes.add(acao.nivel);
        }
      }

      const resultado: EtiquetaInfo[] = [];
      await Promise.all(
        Array.from(nomes).map(async (nome) => {
          const r = await fetch(`/api/v1/contacts?tags=${encodeURIComponent(nome)}&limit=1`);
          const j = await r.json();
          resultado.push({ nome, totalContatos: j.data?.total ?? j.meta?.total ?? 0 });
        }),
      );

      resultado.sort((a, b) => b.totalContatos - a.totalContatos);
      setEtiquetas(resultado);
    } catch {
      // silencioso — mostra vazio
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const NIVEIS_FUNIL = [
    { nome: "Simpatizante", nivel: 1 },
    { nome: "Apoiador", nivel: 2 },
    { nome: "Embaixador", nivel: 3 },
  ];

  function adicionarEtiqueta() {
    if (!novaEtiqueta.trim()) return;
    setEtiquetas((prev) => [
      { nome: novaEtiqueta.trim(), totalContatos: 0 },
      ...prev.filter((et) => et.nome !== novaEtiqueta.trim()),
    ]);
    setNovaEtiqueta("");
  }

  return (
    <div className="mx-auto max-w-[1140px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Instagram · Etiquetas"
        titulo="Etiquetas"
        subtitulo="Etiquetas aplicadas automaticamente nos contatos pelas automações de Instagram."
      />

      {/* ── Funil político ──────────────────────────────────────── */}
      <section className="wr-card space-y-4 p-5">
        <div>
          <h2 className="font-heading text-[18px] font-bold" style={{ color: "var(--color-text)" }}>Funil Político</h2>
          <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Usados pela ação <strong>Funil político</strong> nas automações. Mapeiam o engajamento do cidadão com o mandato.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {NIVEIS_FUNIL.map((item) => (
            <div
              key={item.nome}
              className="flex items-center gap-3 rounded-[16px] px-4 py-3"
              style={{ background: `var(--wr-funnel-${item.nivel})`, border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold" style={{ background: "#FFFFFF", color: "#26318F" }}>
                {item.nivel}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#1E2A80" }}>{item.nome}</p>
                <p className="text-[11px]" style={{ color: "#2F3DA8" }}>Nível {item.nivel}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
          Para usar, adicione a ação <strong>Funil político</strong> em um flow e selecione o nível desejado.
        </p>
      </section>

      {/* ── Etiquetas personalizadas ────────────────────────────── */}
      <section className="space-y-[18px]">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-[18px] font-bold" style={{ color: "var(--color-text)" }}>Etiquetas personalizadas</h2>
          <button onClick={carregar} className="text-xs font-medium transition-colors" style={{ color: "var(--color-accent)" }}>Atualizar</button>
        </div>

        {/* Criar nova */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Nome da etiqueta (ex: Interessado, Lead Quente)"
            value={novaEtiqueta}
            onChange={(e) => setNovaEtiqueta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") adicionarEtiqueta();
            }}
            className="wr-input flex-1"
          />
          <button onClick={adicionarEtiqueta} disabled={!novaEtiqueta.trim()} className="wr-btn-dark disabled:opacity-50">
            Adicionar
          </button>
        </div>
        <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
          As etiquetas aparecem aqui quando usadas em flows. Para aplicar em contatos, adicione a ação{" "}
          <strong>Adicionar etiqueta</strong> em um{" "}
          <Link href="/app/instagram/automacoes" className="font-semibold underline underline-offset-4" style={{ color: "var(--color-accent)" }}>
            flow de automação
          </Link>
          .
        </p>

        {/* Estado de carregamento */}
        {carregando && (
          <div className="wr-card flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--color-accent)", borderTopColor: "transparent" }} />
          </div>
        )}

        {/* Lista vazia */}
        {!carregando && etiquetas.length === 0 && (
          <div className="wr-card">
            <EmptyState
              icon={Tag}
              title="Nenhuma etiqueta ainda"
              description="As etiquetas aparecem aqui quando usadas em flows de automação."
            />
          </div>
        )}

        {/* Lista de etiquetas */}
        {!carregando && etiquetas.length > 0 && (
          <div className="wr-card overflow-hidden p-0">
            {etiquetas.map((et, i) => (
              <div
                key={et.nome}
                className="flex items-center justify-between px-5 py-3.5"
                style={{ borderBottom: i < etiquetas.length - 1 ? "1px solid var(--color-border)" : undefined }}
              >
                <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgba(67,82,196,0.22)", color: "#B4BCF0" }}>
                  {et.nome}
                </span>
                <span className="text-sm tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                  {et.totalContatos} contato{et.totalContatos !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
