"use client";

/**
 * Saúde dos Números — visual. Apresentacional: recebe a leitura já pronta da
 * página servidor. Um card por número, um chip grande de estado, "enviou X hoje"
 * e, quando o motor segurou o número, o diagnóstico que ELE escreveu. À prova de
 * criança: bate o olho e entende em meio segundo. Só leitura.
 */

import Link from "next/link";
import { CheckCircle2, PauseCircle, Hourglass, HelpCircle, ShieldCheck } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import type { NumeroSaude, SaudeDoNumero } from "@/lib/campanhas/saude-dos-numeros";

const ESTILO: Record<
  SaudeDoNumero,
  { rotulo: string; emoji: string; cor: string; bg: string; Icon: typeof CheckCircle2 }
> = {
  saudavel: {
    rotulo: "Saudável",
    emoji: "🟢",
    cor: "#4ADE80",
    bg: "rgba(34,197,94,0.16)",
    Icon: CheckCircle2,
  },
  em_espera: {
    rotulo: "Em espera",
    emoji: "🟡",
    cor: "#F87171",
    bg: "rgba(239,68,68,0.16)",
    Icon: PauseCircle,
  },
  aguardando_liberacao: {
    rotulo: "Aguardando liberação",
    emoji: "⏳",
    cor: "#FBBF24",
    bg: "rgba(245,158,11,0.16)",
    Icon: Hourglass,
  },
  sem_dados: {
    rotulo: "Ainda sem leitura",
    emoji: "⚪",
    cor: "var(--color-text-muted)",
    bg: "var(--color-surface-elevated)",
    Icon: HelpCircle,
  },
};

/** A frase de "o que isso quer dizer / o que fazer", por estado — sem jargão. */
function explicar(n: NumeroSaude): string {
  switch (n.saude) {
    case "saudavel":
      return "Enviando normalmente. Nada a fazer — o sistema vigia sozinho.";
    case "em_espera":
      if (n.motivo === "block_rate")
        return "O WhatsApp começou a bloquear este número. O sistema pausou o envio sozinho para proteger o número. Verifique a conexão; o envio volta quando a situação normalizar.";
      if (n.motivo === "response_rate")
        return "Pouca gente que recebeu respondeu. O sistema pausou para você revisar a abordagem antes de continuar.";
      return "O sistema pausou o envio deste número por segurança. A fila está guardada — nada se perde.";
    case "aguardando_liberacao":
      return "Número novo: ele só começa a disparar depois que você liberar (go-live). Até lá, responder quem escreve funciona normalmente.";
    case "sem_dados":
      return "Assim que este número enviar ou receber a primeira mensagem, a saúde dele aparece aqui.";
  }
}

function desdeTexto(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SaudeDosNumerosClient({
  numeros,
  fuso,
}: {
  numeros: NumeroSaude[];
  fuso: string;
}) {
  const emEspera = numeros.filter((n) => n.saude === "em_espera").length;
  const aguardando = numeros.filter((n) => n.saude === "aguardando_liberacao").length;
  const saudaveis = numeros.filter((n) => n.saude === "saudavel").length;

  const resumo =
    numeros.length === 0
      ? "Nenhum número conectado ainda."
      : emEspera > 0
        ? `${emEspera} número(s) em espera — o sistema pausou para proteger.`
        : aguardando > 0
          ? `${aguardando} número(s) aguardando liberação · ${saudaveis} saudável(is).`
          : "Todos os números saudáveis. Pode disparar tranquilo.";

  return (
    <div className="gip-ambient-bg mx-auto max-w-[1140px] space-y-[18px] px-4 py-7">
      <CommandHero
        eyebrow="Disparos · Entregabilidade"
        titulo="Saúde dos Números"
        subtitulo="Como está cada número de WhatsApp agora — e se o sistema segurou algum para não queimar. Só leitura: aqui você vê, não mexe."
        acoes={[
          { href: "/app/campaigns", label: "Voltar aos Disparos" },
          { href: "/app/connections", label: "Ajustar proteção" },
          { href: "/app/campaigns/cobaia", label: "Laboratório de teste" },
        ]}
        extra={
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: "rgba(215,243,106,0.16)", color: "#D7F36A" }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Freio automático ativo
          </span>
        }
      />

      {/* Resumo de uma linha — o estado geral em meio segundo. */}
      <div
        className="gip-glass rounded-2xl px-5 py-4 text-sm font-medium"
        style={{ color: "var(--color-text)" }}
        data-testid="saude-resumo"
      >
        {resumo}
      </div>

      {numeros.length === 0 ? (
        <div className="gip-glass rounded-2xl px-5 py-8 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
          Conecte um número de WhatsApp em <Link href="/app/connections" className="underline">Conexões</Link> para
          acompanhar a saúde dele aqui.
        </div>
      ) : (
        <div className="grid gap-[14px] sm:grid-cols-2">
          {numeros.map((n) => {
            const e = ESTILO[n.saude];
            const desde = desdeTexto(n.desde);
            const pctTeto =
              n.tetoDiario && n.tetoDiario > 0
                ? Math.min(100, Math.round((n.enviadasHoje / n.tetoDiario) * 100))
                : null;
            return (
              <div key={n.id} className="gip-glass flex flex-col gap-3 rounded-2xl p-5" data-testid="saude-card">
                {/* Cabeçalho do card: nome do número + chip de estado */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold" style={{ color: "var(--color-text)" }}>
                      {n.rotulo}
                    </p>
                    {n.telefone && n.telefone !== n.rotulo ? (
                      <p className="truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                        {n.telefone}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                    style={{ background: e.bg, color: e.cor }}
                  >
                    <span aria-hidden>{e.emoji}</span>
                    {e.rotulo}
                  </span>
                </div>

                {/* Enviadas hoje × teto */}
                <div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span style={{ color: "var(--color-text-muted)" }}>Enviadas hoje</span>
                    <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                      {n.enviadasHoje.toLocaleString("pt-BR")}
                      {n.tetoDiario ? (
                        <span style={{ color: "var(--color-text-muted)" }}>
                          {" "}
                          de {n.tetoDiario.toLocaleString("pt-BR")}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {pctTeto !== null ? (
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-elevated)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pctTeto}%`,
                          background: pctTeto >= 90 ? "#C0392B" : "var(--color-accent)",
                        }}
                      />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                      Sem teto diário definido para este número.
                    </p>
                  )}
                </div>

                {/* Diagnóstico do motor, quando há hold */}
                {n.diagnostico ? (
                  <p
                    className="rounded-lg px-3 py-2 text-xs leading-relaxed"
                    style={{ background: e.bg, color: "var(--color-text)" }}
                  >
                    {n.diagnostico}
                  </p>
                ) : null}

                {/* O que isso quer dizer / o que fazer */}
                <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
                  {explicar(n)}
                  {desde && n.saude === "em_espera" ? (
                    <span style={{ color: "var(--color-text-muted)" }}> · desde {desde}</span>
                  ) : null}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Legenda — o que cada estado significa, didático */}
      <div className="gip-glass rounded-2xl px-5 py-4" data-testid="saude-legenda">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
          O que cada estado quer dizer
        </p>
        <ul className="space-y-1.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
          <li>🟢 <strong>Saudável</strong> — enviando normalmente, o sistema vigia sozinho.</li>
          <li>🟡 <strong>Em espera</strong> — o número começou a ser bloqueado e o sistema pausou o envio sozinho para não queimar. A fila fica guardada.</li>
          <li>⏳ <strong>Aguardando liberação</strong> — número novo; só dispara depois do go-live.</li>
          <li>⚪ <strong>Ainda sem leitura</strong> — o número ainda não enviou nem recebeu nada.</li>
        </ul>
        <p className="mt-3 text-xs" style={{ color: "var(--color-text-muted)" }}>
          "Enviadas hoje" conta no horário de Brasília ({fuso}). Esta tela só mostra — para ajustar
          limites e proteção, use <Link href="/app/connections" className="underline">Conexões</Link>.
        </p>
      </div>
    </div>
  );
}
