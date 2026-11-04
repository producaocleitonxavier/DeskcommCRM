"use client";

/**
 * Modo Evento — tela cheia para o assessor erguer o celular. QR grande, contador
 * de cadastros AO VIVO (poll a cada 5s), e botão ligar/pausar o ponto. Visual
 * premium escuro (marca GIP). Nada aqui envia nada — só mostra e conta.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Power, Users } from "lucide-react";

interface Ponto {
  id: string;
  nome: string;
  codigo: string;
  ativo: boolean;
}

export default function EventoClient({
  ponto,
  inicial,
  nomeParlamentar,
  cargo,
}: {
  ponto: Ponto;
  inicial: number;
  nomeParlamentar: string | null;
  cargo: string | null;
}) {
  const [count, setCount] = useState(inicial);
  const [ativo, setAtivo] = useState(ponto.ativo);
  const [bump, setBump] = useState(false);
  const anterior = useRef(inicial);
  const imagemUrl = `/api/v1/qr-origens/${ponto.id}/imagem`;
  const nome = (nomeParlamentar ?? "").trim() || "o mandato";

  const poll = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/qr-origens/${ponto.id}/cadastros`, { credentials: "same-origin" });
      const j = await r.json();
      const n = Array.isArray(j?.data) ? j.data.length : null;
      if (typeof n === "number") {
        setCount((atual) => {
          if (n > anterior.current) {
            setBump(true);
            setTimeout(() => setBump(false), 700);
          }
          anterior.current = n;
          return n;
        });
      }
    } catch {
      /* silencioso — a tela não pode quebrar no meio do evento */
    }
  }, [ponto.id]);

  useEffect(() => {
    void poll();
    const t = setInterval(() => void poll(), 5000);
    return () => clearInterval(t);
  }, [poll]);

  async function alternar() {
    const novo = !ativo;
    setAtivo(novo);
    try {
      await fetch(`/api/v1/qr-origens/${ponto.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: novo }),
      });
    } catch {
      setAtivo(!novo);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center overflow-y-auto px-5 py-6 text-center"
      style={{
        background:
          "radial-gradient(90% 60% at 50% 0%, rgba(215,243,106,0.10), transparent 60%)," +
          "radial-gradient(70% 50% at 50% 110%, rgba(231,194,90,0.10), transparent 60%)," +
          "linear-gradient(180deg,#0e1108,#15180f)",
        color: "#f3efe4",
      }}
    >
      {/* Topo: sair + nome do ponto */}
      <div className="flex w-full max-w-md items-center justify-between">
        <Link
          href="/app/captacao-qr"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold"
          style={{ background: "rgba(255,255,255,0.08)", color: "#d8d4c6" }}
        >
          <ArrowLeft className="h-4 w-4" /> Sair
        </Link>
        <span className="truncate text-sm font-semibold" style={{ color: "#aeb79b" }}>
          📍 {ponto.nome}
        </span>
      </div>

      {/* Identidade */}
      <div className="mt-6">
        <p className="text-[13px] font-bold uppercase tracking-[0.18em]" style={{ color: "#e7c25a" }}>
          Cadastre-se com
        </p>
        <h1 className="mt-1 font-heading text-3xl font-bold leading-tight" style={{ color: "#fbf8ee" }}>
          {nome}
        </h1>
        {cargo && <p className="mt-0.5 text-sm" style={{ color: "#aeb79b" }}>{cargo}</p>}
      </div>

      {/* QR grande */}
      <div className="relative mt-6">
        <div
          className="rounded-3xl bg-white p-4 shadow-2xl"
          style={{ opacity: ativo ? 1 : 0.35, transition: "opacity .2s" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagemUrl} alt={`QR ${ponto.nome}`} width={260} height={260} className="h-[260px] w-[260px]" />
        </div>
        {!ativo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full px-4 py-2 text-sm font-bold" style={{ background: "#0e1108", color: "#e7c25a", border: "1px solid rgba(231,194,90,0.4)" }}>
              Pausado — toque em “Ativar” abaixo
            </span>
          </div>
        )}
      </div>

      <p className="mt-5 max-w-sm text-[15px] leading-snug" style={{ color: "#ddd9cb" }}>
        📲 <b style={{ color: "#fff" }}>Aponte a câmera</b> do celular para o código e <b style={{ color: "#fff" }}>mande a mensagem</b> que abrir. Pronto — você está cadastrado!
      </p>

      {/* Contador ao vivo */}
      <div
        className="mt-7 flex items-center gap-3 rounded-2xl px-6 py-4"
        style={{
          background: "rgba(215,243,106,0.08)",
          border: "1px solid rgba(215,243,106,0.25)",
          transform: bump ? "scale(1.06)" : "scale(1)",
          transition: "transform .3s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <Users className="h-6 w-6" style={{ color: "#D7F36A" }} />
        <div className="text-left">
          <div className="font-heading text-4xl font-bold leading-none" style={{ color: "#D7F36A" }}>
            {count.toLocaleString("pt-BR")}
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "#aeb79b" }}>
            {count === 1 ? "cadastrado neste ponto" : "cadastrados neste ponto"}
          </div>
        </div>
      </div>

      {/* Ligar/pausar */}
      <button
        type="button"
        onClick={() => void alternar()}
        className="mt-7 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold"
        style={
          ativo
            ? { background: "rgba(255,255,255,0.08)", color: "#d8d4c6", border: "1px solid rgba(255,255,255,0.14)" }
            : { background: "#D7F36A", color: "#16181D" }
        }
      >
        <Power className="h-4 w-4" />
        {ativo ? "Pausar captação" : "Ativar captação"}
      </button>

      <p className="mt-4 text-[11px]" style={{ color: "#7f876e" }}>
        código <span className="font-mono">{ponto.codigo}</span> · atualiza sozinho a cada poucos segundos
      </p>
    </div>
  );
}
