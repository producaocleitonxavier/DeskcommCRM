"use client";

/**
 * Boas-vindas + Setup do Mandato — a TELA CHEIA obrigatória da primeira entrada
 * do ADMIN (chefia). Mostra um acolhimento (logo + "Bem-vindo") com um botão
 * "Seguir"; ao seguir, abre o assistente de configuração (o mesmo SetupWizard da
 * tela interna, reusado). Fica FORA do /app de propósito: sem menu, sem escape,
 * até concluir — mas sem pegar o usuário novo de surpresa.
 *
 * Assessores convidados NUNCA chegam aqui (o portão só manda admin não
 * configurado), então caem direto no sistema já configurado pela chefia.
 */
import { useState } from "react";
import { ArrowRight } from "lucide-react";

import SetupWizard from "@/app/app/politico/configuracao/_wizard-client";

export default function BoasVindasEConfig({
  inicial,
  marcaNome,
}: {
  inicial: { nome: string; cargo: string; cidade: string; subtitulo: string };
  marcaNome: string;
}) {
  const [comecou, setComecou] = useState(false);

  if (comecou) return <SetupWizard inicial={inicial} />;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[560px] flex-col items-center justify-center px-6 py-12 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/elmo-hero.png"
        alt={marcaNome}
        className="h-36 w-auto object-contain sm:h-44"
        style={{ filter: "drop-shadow(0 10px 42px rgba(212,165,55,0.45))" }}
      />
      <div
        className="mt-3 text-2xl font-extrabold tracking-wide"
        style={{
          backgroundImage: "linear-gradient(90deg,#E7C260,#F3D37A,#C9A23A)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        {marcaNome}
      </div>

      <h1 className="font-heading mt-7 text-[28px] font-bold leading-tight sm:text-3xl" style={{ color: "var(--color-text)" }}>
        Bem-vindo(a) ao nosso sistema
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
        Antes de ter acesso, precisamos fazer a configuração necessária para o
        melhor uso da ferramenta para o seu mandato.
      </p>

      <button
        type="button"
        onClick={() => setComecou(true)}
        className="mt-8 inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-bold transition-opacity hover:opacity-90"
        style={{ background: "#D7F36A", color: "#16181D" }}
      >
        Seguir <ArrowRight size={16} />
      </button>
    </div>
  );
}
