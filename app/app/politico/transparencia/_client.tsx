"use client";

/**
 * Painel de gestão do Portal da Transparência. Liga/desliga o portal público,
 * mostra o link para divulgar e orienta como publicar obras/emendas. Didático:
 * explica o opt-in (nada aparece sem o operador marcar) para quem opera a tool.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, Copy, ExternalLink, Building2, HandCoins, ShieldCheck } from "lucide-react";

import { salvarPortalAtivo, type PortalConfig } from "@/app/actions/politico/transparencia-actions";

export default function TransparenciaClient({ config }: { config: PortalConfig }) {
  const router = useRouter();
  const [ativo, setAtivo] = useState(config.portalAtivo);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const link = typeof window !== "undefined" ? `${window.location.origin}/transparencia/${config.orgId}` : `/transparencia/${config.orgId}`;
  const totalPublico = config.obrasPublicas + config.emendasPublicas;

  async function alternar() {
    const novo = !ativo;
    setAtivo(novo); // otimista
    setSalvando(true);
    setErro(null);
    const res = await salvarPortalAtivo(novo);
    setSalvando(false);
    if (!res.ok) {
      setAtivo(!novo); // reverte
      setErro(res.erro ?? "Não foi possível salvar.");
      return;
    }
    router.refresh();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-[840px] px-4 py-7 space-y-5">
      <header>
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "rgba(215,243,106,0.16)", color: "#7E8F2B" }} aria-hidden>
            <Globe className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-heading text-[26px] font-bold leading-tight" style={{ color: "var(--color-text)" }}>Portal da Transparência</h1>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Sua vitrine pública de prestação de contas: obras e emendas, com valores e mapa de entregas.</p>
          </div>
        </div>
      </header>

      {/* Liga/desliga + link */}
      <section className="wr-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>
              {ativo ? "Portal no ar" : "Portal desativado"}
            </h2>
            <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-subtle)" }}>
              {ativo
                ? "Qualquer pessoa com o link vê as obras e emendas que você publicou."
                : "Enquanto desativado, o link responde “página não encontrada”."}
            </p>
          </div>
          <button
            type="button"
            onClick={alternar}
            disabled={salvando}
            role="switch"
            aria-checked={ativo}
            className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60"
            style={{ background: ativo ? "#D7F36A" : "var(--color-border)" }}
          >
            <span className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform" style={{ transform: ativo ? "translateX(22px)" : "translateX(4px)" }} />
          </button>
        </div>

        {erro && <div role="alert" className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>}

        {/* Link público */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="wr-input flex-1 text-xs" style={{ minWidth: 220, opacity: ativo ? 1 : 0.6 }} />
          <button type="button" onClick={copiar} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={{ background: "#D7F36A", color: "#16181D" }}>
            <Copy className="h-4 w-4" aria-hidden /> {copiado ? "Copiado!" : "Copiar link"}
          </button>
          {ativo && (
            <Link href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
              <ExternalLink className="h-4 w-4" aria-hidden /> Abrir
            </Link>
          )}
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--color-text-subtle)" }}>
          Dica: divulgue este link na bio das redes, em panfletos e no fim de mandato — é a prova pública do seu trabalho.
        </p>
      </section>

      {/* O que está público */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="wr-card p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "rgba(245,158,11,0.16)", color: "#B45309" }} aria-hidden>
              <Building2 style={{ width: 18, height: 18 }} />
            </span>
            <div>
              <div className="font-heading text-2xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{config.obrasPublicas}</div>
              <div className="text-xs" style={{ color: "var(--color-text-subtle)" }}>obras públicas</div>
            </div>
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--color-text-subtle)" }}>
            Para publicar uma obra, abra a obra e marque <strong style={{ color: "var(--color-text-muted)" }}>Visibilidade: Pública</strong>. Com latitude/longitude, ela aparece no mapa de entregas.
          </p>
          <Link href="/app/politico/obras" className="mt-2 inline-block text-xs font-semibold" style={{ color: "#4352C4" }}>Ir para Obras →</Link>
        </div>

        <div className="wr-card p-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "rgba(215,243,106,0.18)", color: "#7E8F2B" }} aria-hidden>
              <HandCoins style={{ width: 18, height: 18 }} />
            </span>
            <div>
              <div className="font-heading text-2xl font-bold tabular-nums" style={{ color: "var(--color-text)" }}>{config.emendasPublicas}</div>
              <div className="text-xs" style={{ color: "var(--color-text-subtle)" }}>emendas públicas</div>
            </div>
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--color-text-subtle)" }}>
            Para publicar uma emenda, abra a emenda, clique em <strong style={{ color: "var(--color-text-muted)" }}>Editar</strong> e ative <strong style={{ color: "var(--color-text-muted)" }}>Mostrar no Portal</strong>.
          </p>
          <Link href="/app/politico/emendas" className="mt-2 inline-block text-xs font-semibold" style={{ color: "#4352C4" }}>Ir para Emendas →</Link>
        </div>
      </section>

      {ativo && totalPublico === 0 && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FCF1DC", color: "#8A5A10" }}>
          O portal está no ar, mas você ainda não marcou nenhuma obra ou emenda como pública — por enquanto os visitantes veem uma página vazia.
        </div>
      )}

      {/* Privacidade */}
      <section className="wr-card p-5">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="h-5 w-5 shrink-0" style={{ color: "#17784F" }} aria-hidden />
          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            <strong style={{ color: "var(--color-text-muted)" }}>Nada é publicado sem a sua escolha.</strong> Só aparecem no portal as obras e emendas que você marcar como públicas. Dados de pessoas da sua base de contatos <strong style={{ color: "var(--color-text-muted)" }}>nunca</strong> aparecem aqui.
          </p>
        </div>
      </section>
    </div>
  );
}
