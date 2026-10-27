/**
 * /app/instagram/etiquetas — Explicador do FUNIL POLÍTICO (War Room 2.0)
 *
 * Página didática (à prova de criança): os 3 níveis do apoiador — o que cada um
 * significa e como a pessoa sobe. A captação coloca todo novo apoiador como
 * Simpatizante sozinho; ele sobe conforme interage. Sem jargão, sem criar nada.
 * Visual: padrão War Room dark.
 */

"use client";

import { ArrowDown, Sparkles, Heart, Megaphone, type LucideIcon } from "lucide-react";
import { CommandHero } from "@/components/politico/command-hero";

interface Nivel {
  n: number;
  nome: string;
  icone: LucideIcon;
  oQueE: string;
  comoChega: string;
}

const NIVEIS: Nivel[] = [
  {
    n: 1,
    nome: "Simpatizante",
    icone: Sparkles,
    oQueE: "Acabou de chegar. Comentou, mandou DM ou se cadastrou — demonstrou interesse no seu trabalho.",
    comoChega: "Entra sozinho pela captação do Instagram (ou por um cadastro). É o primeiro passo de todo mundo.",
  },
  {
    n: 2,
    nome: "Apoiador",
    icone: Heart,
    oQueE: "Já tem vínculo de verdade. Passou o WhatsApp, responde suas mensagens e acompanha de perto.",
    comoChega: "Sobe quando a pessoa interage — responde no Direct, passa o contato, comparece, engaja.",
  },
  {
    n: 3,
    nome: "Embaixador",
    icone: Megaphone,
    oQueE: "Multiplica o seu trabalho. Indica outras pessoas e defende o seu mandato pra rede dele.",
    comoChega: "Sobe quando traz gente nova (indicações) e vira voz ativa — o apoiador mais valioso.",
  },
];

export default function FunilPoliticoPage() {
  return (
    <div className="mx-auto max-w-[760px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Instagram · Funil Político"
        titulo="Funil Político"
        subtitulo="A jornada de cada apoiador, em 3 níveis. Quanto mais a pessoa se envolve, mais alto ela sobe."
      />

      {/* Jornada — 3 níveis em cartões conectados */}
      <div className="space-y-3">
        {NIVEIS.map((nivel, i) => {
          const Icone = nivel.icone;
          return (
            <div key={nivel.n}>
              <section
                className="wr-card overflow-hidden p-0"
                style={{ borderColor: `var(--wr-funnel-${nivel.n})` }}
              >
                {/* faixa colorida do nível */}
                <div
                  className="flex items-center gap-3 px-5 py-3.5"
                  style={{ background: `var(--wr-funnel-${nivel.n})` }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{ background: "#FFFFFF", color: "#26318F" }}
                  >
                    {nivel.n}
                  </span>
                  <h2 className="flex items-center gap-2 font-heading text-[18px] font-bold" style={{ color: "#1B2566" }}>
                    <Icone className="h-5 w-5" aria-hidden /> {nivel.nome}
                  </h2>
                </div>
                {/* corpo */}
                <div className="space-y-3 p-5">
                  <div>
                    <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
                      O que é
                    </p>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>{nivel.oQueE}</p>
                  </div>
                  <div>
                    <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
                      Como a pessoa chega aqui
                    </p>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{nivel.comoChega}</p>
                  </div>
                </div>
              </section>
              {/* seta entre os níveis */}
              {i < NIVEIS.length - 1 && (
                <div className="flex justify-center py-1.5">
                  <ArrowDown className="h-5 w-5" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* nota de rodapé — tudo automático */}
      <section
        className="rounded-[16px] p-4"
        style={{ background: "rgba(215,243,106,0.08)", border: "1px solid rgba(215,243,106,0.25)" }}
      >
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          <strong style={{ color: "#D7F36A" }}>Você não precisa mexer em nada.</strong> A captação do Instagram já coloca
          cada nova pessoa como <strong style={{ color: "var(--color-text)" }}>Simpatizante</strong> automaticamente — e,
          conforme ela interage, o sistema a vai subindo de nível sozinho.
        </p>
      </section>
    </div>
  );
}
