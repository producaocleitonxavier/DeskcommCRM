/**
 * Blindagem Jurídica do Mandato — torna VISÍVEL o que a IA já faz sozinha para
 * proteger o mandato (as "7 travas" + guardrail eleitoral). É reasseguramento
 * para quem opera o gabinete e argumento de venda: a inteligência que resolve
 * vem com blindagem jurídica embutida.
 *
 * Presentacional e à prova de criança: linguagem de gente, uma proteção por
 * linha, status claro. O estado real da trava eleitoral chega por prop
 * (`travaEleitoralAtiva`), lido do banco pela página — não é texto decorativo.
 */
import { ShieldCheck, Scale, Megaphone, Eye, Stethoscope, Lock, UserRound, Check } from "lucide-react";

interface Trava {
  Icon: typeof ShieldCheck;
  titulo: string;
  texto: string;
}

const TRAVAS: Trava[] = [
  {
    Icon: ShieldCheck,
    titulo: "Nunca promete",
    texto: "Não garante resultado, prazo nem benefício. O gabinete orienta e encaminha; quem executa é a Prefeitura.",
  },
  {
    Icon: Scale,
    titulo: "Nunca troca favor por voto",
    texto: "Jamais liga um serviço ou ajuda a voto ou apoio político — a trava da Lei 9.504/97 (art. 41-A) age sozinha.",
  },
  {
    Icon: Megaphone,
    titulo: "Não faz campanha",
    texto: "Não pede voto, não declara apoio a candidato e não opina sobre política partidária.",
  },
  {
    Icon: Eye,
    titulo: "Revisa antes de falar",
    texto: "Toda resposta passa por uma verificação automática antes de chegar ao cidadão. Nada sai sem conferência.",
  },
  {
    Icon: Stethoscope,
    titulo: "Não dá parecer técnico",
    texto: "Não dá orientação jurídica, médica nem financeira — encaminha para quem é de direito.",
  },
  {
    Icon: Lock,
    titulo: "Cuida dos dados",
    texto: "Pede só o essencial e protege os dados do cidadão. Nada de informação sensível sem necessidade.",
  },
  {
    Icon: UserRound,
    titulo: "Chama um humano",
    texto: "Nos casos sérios — jurídico, imprensa, urgência — passa para a equipe do gabinete com o resumo do que já aconteceu.",
  },
];

export function BlindagemJuridica({ travaEleitoralAtiva }: { travaEleitoralAtiva: boolean }) {
  return (
    <section aria-label="Blindagem jurídica do mandato" className="wr-card p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(23,120,79,0.12)", color: "#17784F" }}
          >
            <ShieldCheck size={22} />
          </span>
          <div>
            <h2 className="font-heading text-[22px] font-bold leading-tight">Blindagem Jurídica do Mandato</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Proteções que a IA aplica sozinha em toda conversa, para o seu mandato nunca correr risco legal.
            </p>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
          style={
            travaEleitoralAtiva
              ? { background: "rgba(23,120,79,0.12)", color: "#17784F" }
              : { background: "rgba(245,158,11,0.12)", color: "#B45309" }
          }
        >
          <Check size={14} />
          {travaEleitoralAtiva ? "Ativa e verificada" : "Parcial — confira a trava eleitoral"}
        </span>
      </header>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {TRAVAS.map(({ Icon, titulo, texto }) => (
          <li
            key={titulo}
            className="flex items-start gap-3 rounded-[14px] p-3.5"
            style={{ border: "1px solid var(--color-border)", background: "var(--color-surface-elevated)" }}
          >
            <span className="mt-0.5 shrink-0" style={{ color: "#17784F" }}>
              <Icon size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold">{titulo}</p>
              <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--color-text-muted)" }}>
                {texto}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[12px] leading-snug" style={{ color: "var(--color-text-subtle)" }}>
        Base: Lei 9.504/97 (art. 41-A) e as regras do TSE. Estas travas são automáticas — não dependem de a equipe lembrar
        de ativá-las a cada conversa.
      </p>
    </section>
  );
}
