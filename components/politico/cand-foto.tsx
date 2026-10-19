"use client";

/**
 * Foto do candidato (Raio-X / TSE). A foto vem do bucket PÚBLICO `intel-fotos`
 * em {ano}/{sq}.jpg (origem: dataset de fotos do TSE, nomeado por SQ_CANDIDATO).
 * Se não houver foto, cai para as iniciais do nome. Sem foto cadastrada é o
 * caso comum em alguns cargos/anos, então o fallback é silencioso.
 */

import { useState } from "react";

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  const a = p[0]?.[0] ?? "";
  const b = p.length > 1 ? p[p.length - 1]?.[0] ?? "" : "";
  return (a + b).toUpperCase() || "?";
}

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export function CandFoto({ sq, ano, nome, size = 40 }: { sq: string; ano: number; nome: string; size?: number }) {
  const [erro, setErro] = useState(false);
  const url = BASE ? `${BASE}/storage/v1/object/public/intel-fotos/${ano}/${sq}.jpg` : "";
  const estiloBase = { width: size, height: size } as const;

  if (erro || !url) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full font-bold"
        style={{ ...estiloBase, background: "rgba(215,243,106,0.15)", color: "#5C7F23", fontSize: size * 0.36 }}
        aria-hidden
      >
        {iniciais(nome)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={nome}
      onError={() => setErro(true)}
      className="shrink-0 rounded-full object-cover"
      style={{ ...estiloBase, background: "rgba(0,0,0,0.05)" }}
      loading="lazy"
    />
  );
}

export default CandFoto;
