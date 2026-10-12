/**
 * /app/instagram/etiquetas — Etiquetas usadas pelas automações Instagram (War Room 2.0)
 *
 * Lista as etiquetas (tags) que as automações aplicam nos contatos ao
 * comentar. Permite criar etiquetas pré-definidas e ver quantos contatos
 * as têm. É a seção "Etiquetas" equivalente ao GD Digital.
 *
 * Acesso: manager+
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface EtiquetaInfo {
  nome: string;
  totalContatos: number;
}

// ── Componente principal ───────────────────────────────────────────────────────

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
      const flows: Array<{
        acoes: Array<{ tipo: string; etiqueta?: string; nivel?: string }>;
      }> = json.data?.flows ?? [];

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
          const r = await fetch(
            `/api/v1/contacts?tags=${encodeURIComponent(nome)}&limit=1`,
          );
          const j = await r.json();
          resultado.push({
            nome,
            totalContatos: j.data?.total ?? j.meta?.total ?? 0,
          });
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
    <div className="mx-auto max-w-[1140px] px-4 py-7 space-y-[18px]">
      {/* ── Header card ─────────────────────────────────────────── */}
      <header className="wr-card p-6 sm:p-7">
        <div className="flex items-center gap-2 text-sm mb-1" style={{ color: "#5B606B" }}>
          <Link
            href="/app/instagram"
            className="hover:opacity-70 transition-colors font-medium"
          >
            Instagram
          </Link>
          <span style={{ color: "#9A9D8F" }}>/</span>
          <span className="font-medium">Etiquetas</span>
        </div>
        <h1 className="font-heading text-[36px] font-bold leading-tight">Etiquetas</h1>
        <p className="mt-1.5 text-base" style={{ color: "#4A4F59" }}>
          Etiquetas aplicadas automaticamente nos contatos pelas automações de Instagram.
        </p>
      </header>

      {/* ── Funil político ──────────────────────────────────────── */}
      <section className="wr-card p-5 space-y-4">
        <div>
          <h2
            className="font-heading text-[18px] font-bold"
            style={{ color: "#16181D" }}
          >
            Funil Político
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "#5B606B" }}>
            Usados pela ação <strong>Funil político</strong> nas automações. Mapeiam o engajamento do
            cidadão com o mandato.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {NIVEIS_FUNIL.map((item) => (
            <div
              key={item.nome}
              className="flex items-center gap-3 rounded-[16px] px-4 py-3"
              style={{
                background: `var(--wr-funnel-${item.nivel})`,
                border: "1px solid #F0F0EB",
              }}
            >
              <div
                className="flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold"
                style={{
                  background: "#FFFFFF",
                  color: "#4352C4",
                }}
              >
                {item.nivel}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#2F3DA8" }}>
                  {item.nome}
                </p>
                <p className="text-[11px]" style={{ color: "#3B4280" }}>
                  Nível {item.nivel}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs" style={{ color: "#9A9D8F" }}>
          Para usar, adicione a ação <strong>Funil político</strong> em um flow e selecione o nível
          desejado.
        </p>
      </section>

      {/* ── Etiquetas personalizadas ────────────────────────────── */}
      <section className="space-y-[18px]">
        <div className="flex items-center justify-between">
          <h2
            className="font-heading text-[18px] font-bold"
            style={{ color: "#16181D" }}
          >
            Etiquetas personalizadas
          </h2>
          <button
            onClick={carregar}
            className="text-xs font-medium transition-colors"
            style={{ color: "#4352C4" }}
          >
            Atualizar
          </button>
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
            className="flex-1 rounded-full border px-4 py-2.5 text-sm focus:outline-none focus:ring-2"
            style={{ borderColor: "#DCDCD5", background: "#FFFFFF" }}
          />
          <button
            onClick={adicionarEtiqueta}
            disabled={!novaEtiqueta.trim()}
            className="wr-btn-dark disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>
        <p className="text-xs" style={{ color: "#9A9D8F" }}>
          As etiquetas aparecem aqui quando usadas em flows. Para aplicar em contatos, adicione a
          ação <strong>Adicionar etiqueta</strong> em um{" "}
          <Link
            href="/app/instagram/automacoes"
            className="font-semibold underline underline-offset-4"
            style={{ color: "#4352C4" }}
          >
            flow de automação
          </Link>
          .
        </p>

        {/* Estado de carregamento */}
        {carregando && (
          <div className="wr-card flex items-center justify-center py-12">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: "#4352C4", borderTopColor: "transparent" }}
            />
          </div>
        )}

        {/* Lista vazia */}
        {!carregando && etiquetas.length === 0 && (
          <div className="wr-card flex flex-col items-center gap-4 py-12 text-center">
            <div
              className="flex items-center justify-center w-14 h-14 rounded-full"
              style={{ background: "#F0F0EB" }}
            >
              <span className="text-2xl">🏷️</span>
            </div>
            <div>
              <p
                className="font-heading text-lg font-semibold"
                style={{ color: "#16181D" }}
              >
                Nenhuma etiqueta ainda
              </p>
              <p className="text-sm mt-1 max-w-xs mx-auto" style={{ color: "#5B606B" }}>
                As etiquetas aparecem aqui quando usadas em flows de automação.
              </p>
            </div>
          </div>
        )}

        {/* Lista de etiquetas */}
        {!carregando && etiquetas.length > 0 && (
          <div className="wr-card pt-2 pb-0 px-0">
            {etiquetas.map((et, i) => (
              <div
                key={et.nome}
                className="flex items-center justify-between px-5 py-3.5"
                style={{
                  borderBottom:
                    i < etiquetas.length - 1 ? "1px solid #F0F0EB" : undefined,
                }}
              >
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: "#E4E7F8", color: "#2F3DA8" }}
                >
                  {et.nome}
                </span>
                <span
                  className="text-sm tabular-nums"
                  style={{ color: "#5B606B" }}
                >
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
