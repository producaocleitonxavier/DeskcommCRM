/**
 * /app/instagram/etiquetas — Explicador dos NÍVEIS DE RELACIONAMENTO (War Room 2.0)
 *
 * Página didática (à prova de criança): os 4 níveis — o que cada um significa e
 * como a pessoa sobe. A captação coloca toda pessoa nova como Novo contato; ela
 * sobe conforme interage. Sem jargão, sem criar nada. Rótulos: lib/politico/niveis.ts.
 * Visual: padrão War Room dark.
 */

"use client";

import { UserPlus, Sparkles, Heart, Megaphone, type LucideIcon } from "lucide-react";
import { CommandHero } from "@/components/politico/command-hero";
import { rotuloDoNivel } from "@/lib/politico/niveis";

interface Nivel {
  n: number;
  nome: string;
  icone: LucideIcon;
  oQueE: string;
  comoChega: string;
}

// Os MESMOS 4 níveis de relacionamento do sistema (engajamento.ts) — explicador
// do lado do Instagram, sem inventar escada paralela. Definidos pelo que a pessoa FAZ.
const NIVEIS: Nivel[] = [
  {
    n: 1,
    nome: rotuloDoNivel("novo_cadastro"),
    icone: UserPlus,
    oQueE: "Acabou de chegar à base — comentou, mandou DM ou se cadastrou. Ainda não interagiu de verdade.",
    comoChega: "Entra sozinho pela captação do Instagram (ou por um cadastro). É o primeiro passo de todo mundo.",
  },
  {
    n: 2,
    nome: rotuloDoNivel("simpatizante"),
    icone: Sparkles,
    oQueE: "Já conversa com o gabinete — respondeu uma mensagem, passou o WhatsApp.",
    comoChega: "Sobe sozinho na primeira resposta (ele agiu de volta). É o começo do vínculo.",
  },
  {
    n: 3,
    nome: rotuloDoNivel("apoiador"),
    icone: Heart,
    oQueE: "Participa de verdade — foi a um evento, respondeu uma pesquisa, pediu um material.",
    comoChega: "Sobe conforme participa mais ao longo do tempo (responde no Direct, comparece, pede material).",
  },
  {
    n: 4,
    nome: rotuloDoNivel("militante"),
    icone: Megaphone,
    oQueE: "Multiplica o seu trabalho — traz gente nova (indicações) e vira voz ativa. O mais valioso.",
    comoChega: "Sobe quando indica outras pessoas — a indicação é o sinal mais forte de todos.",
  },
];

export default function FunilPoliticoPage() {
  return (
    <div className="mx-auto max-w-[760px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Instagram · Níveis de relacionamento"
        titulo="Níveis de relacionamento"
        subtitulo="A jornada de cada pessoa com o mandato, em 4 níveis — a mesma régua do resto do sistema. Quanto mais a pessoa se envolve, mais alto ela sobe."
      />

      {/* Jornada — 4 níveis em cartões leves conectados por uma trilha fina */}
      <div className="space-y-0">
        {NIVEIS.map((nivel, i) => {
          const Icone = nivel.icone;
          const cor = `var(--wr-funnel-${nivel.n})`;
          return (
            <div key={nivel.n}>
              <section className="wr-card p-5" style={{ borderLeft: `3px solid ${cor}` }}>
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{ background: cor, color: "#FFFFFF" }}
                  >
                    {nivel.n}
                  </span>
                  <h2 className="flex items-center gap-2 font-heading text-[17px] font-bold" style={{ color: "var(--color-text)" }}>
                    <Icone className="h-[18px] w-[18px]" style={{ color: cor }} aria-hidden /> {nivel.nome}
                  </h2>
                </div>
                <div className="mt-3.5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
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
              {/* trilha fina entre os níveis */}
              {i < NIVEIS.length - 1 && (
                <div className="flex justify-center">
                  <span aria-hidden style={{ width: 2, height: 18, background: "var(--color-border)" }} />
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
          <strong style={{ color: "#D7F36A" }}>Você não precisa mexer em nada.</strong> A captação do Instagram traz
          cada pessoa pra base como <strong style={{ color: "var(--color-text)" }}>{rotuloDoNivel("novo_cadastro")}</strong> e, na primeira
          resposta, já sobe pra <strong style={{ color: "var(--color-text)" }}>{rotuloDoNivel("simpatizante")}</strong> — daí o sistema a vai
          subindo de nível sozinho conforme ela interage.
        </p>
      </section>
    </div>
  );
}
