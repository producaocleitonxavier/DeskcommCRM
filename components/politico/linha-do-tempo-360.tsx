/**
 * Linha do Tempo do Cidadão 360° — render do feed cronológico (origem, demandas,
 * ofícios, avisos, graduações). Apresentacional e server-safe. À prova de
 * criança: um ícone, um título claro e a data, por linha.
 */
import { UserPlus, Inbox, CheckCircle2, Send, FileText, Bell, ArrowUpRight, StickyNote, type LucideIcon } from "lucide-react";
import type { EventoLinha, TipoEvento } from "@/lib/politico/linha-do-tempo";

const ESTILO: Record<TipoEvento, { Icon: LucideIcon; bg: string; cor: string }> = {
  origem: { Icon: UserPlus, bg: "var(--color-surface-elevated)", cor: "var(--color-text-muted)" },
  demanda: { Icon: Inbox, bg: "#EEF2FF", cor: "#4352C4" },
  resolvida: { Icon: CheckCircle2, bg: "rgba(23,120,79,0.12)", cor: "#17784F" },
  encaminhada: { Icon: Send, bg: "#F0E7FB", cor: "#7C3AED" },
  oficio: { Icon: FileText, bg: "#E4E7F8", cor: "#2F3DA8" },
  aviso: { Icon: Bell, bg: "#FCF1DC", cor: "#8A5A10" },
  funil: { Icon: ArrowUpRight, bg: "rgba(215,243,106,0.18)", cor: "#5E7A10" },
  nota: { Icon: StickyNote, bg: "var(--color-surface-elevated)", cor: "var(--color-text-muted)" },
};

function dataCurta(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export function LinhaDoTempo360({ eventos }: { eventos: EventoLinha[] }) {
  if (eventos.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
        Ainda não há histórico deste cidadão com o gabinete.
      </p>
    );
  }
  return (
    <div className="space-y-3.5">
      {eventos.map((e) => {
        const s = ESTILO[e.tipo];
        const Icon = s.Icon;
        return (
          <div key={e.id} className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: s.bg, color: s.cor }} aria-hidden>
              <Icon style={{ width: 15, height: 15 }} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{e.titulo}</div>
              {e.detalhe && (
                <div className="mt-0.5 text-[13px] leading-snug truncate" style={{ color: "var(--color-text-muted)" }} title={e.detalhe}>
                  {e.detalhe}
                </div>
              )}
              <div className="mt-0.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>{dataCurta(e.data)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
