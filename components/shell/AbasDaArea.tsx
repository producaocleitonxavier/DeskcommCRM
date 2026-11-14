"use client";

/**
 * BARRA DE ABAS DA ÁREA — no gabinete político, telas irmãs (ex.: Conversas ·
 * Precisa de gente · Demandas paradas · Respostas prontas) aparecem como abas no
 * topo umas das outras. É o que permitiu tirar 33 itens do menu lateral sem
 * perder nenhuma tela. Quem decide o agrupamento é `lib/navigation/menu-do-gabinete`.
 *
 * Só desenha quando a tela atual pertence a uma área com 2+ abas QUE ESTE
 * usuário enxerga. Fora do gabinete, ou em tela sem irmãs, não desenha nada.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ContadorDeCasos } from "@/components/shell/ContadorDeCasos";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { portaDaTela } from "@/lib/navigation/menu-do-gabinete";
import { portasDoUsuario } from "@/lib/navigation/registry";

export function AbasDaArea({ navy = false }: { /** Tela marinho: abas em verde (pedido de 13/nov). */ navy?: boolean }) {
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();
  const portas = portasDoUsuario(
    user.is_platform_admin && !user.support,
    activeOrg?.role ?? null,
    activeOrg?.interface_settings,
    activeOrg?.modulos_ligados ?? [],
    activeOrg?.capacidades_ligadas ?? [],
  );
  const achado = portas ? portaDaTela(pathname, portas) : null;
  // Só na tela principal de cada aba: dentro de um detalhe (ex.: /demandas/123) a
  // barra distrairia de quem já tem o "voltar".
  const mostra = !!achado && achado.porta.abas.length >= 2 && pathname === achado.aba.href;
  const ref = useRef<HTMLElement>(null);
  // Conversa aberta no celular: a barra sai da frente para sobrar tela para LER
  // (o "‹ Conversas" da própria conversa já volta). Quem avisa é a tela de
  // Conversas, por um atributo na raiz — a seleção não muda o endereço da página.
  const [conversaAberta, setConversaAberta] = useState(false);
  useEffect(() => {
    const raiz = document.documentElement;
    const ler = () => setConversaAberta(raiz.hasAttribute("data-conversa-aberta"));
    ler();
    const olho = new MutationObserver(ler);
    olho.observe(raiz, { attributes: true, attributeFilter: ["data-conversa-aberta"] });
    return () => olho.disconnect();
  }, []);
  // Telas de altura cheia (Conversas) calculam a própria altura a partir da tela.
  // A barra avisa quanto ocupa em `--abas-da-area`, para elas descontarem — sem
  // isso a caixa de mensagem ia para baixo da dobra.
  useEffect(() => {
    const raiz = document.documentElement;
    if (!mostra || !ref.current) {
      raiz.style.removeProperty("--abas-da-area");
      return;
    }
    const medir = () => {
      const el = ref.current;
      if (!el) return;
      if (getComputedStyle(el).display === "none") {
        raiz.style.setProperty("--abas-da-area", "0px");
        return;
      }
      const margem = parseFloat(getComputedStyle(el).marginBottom || "0") || 0;
      raiz.style.setProperty("--abas-da-area", `${Math.ceil(el.getBoundingClientRect().height + margem)}px`);
    };
    medir();
    // No celular a barra rola de lado: sem isto a aba acesa ficava fora da vista.
    const acesa = ref.current.querySelector<HTMLElement>('[aria-current="page"]');
    const trilho = acesa?.parentElement;
    if (acesa && trilho) trilho.scrollLeft = Math.max(0, acesa.offsetLeft - (trilho.clientWidth - acesa.offsetWidth) / 2);
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("resize", medir);
      raiz.style.removeProperty("--abas-da-area");
    };
  }, [mostra, pathname, conversaAberta]);
  if (!mostra || !achado) return null;

  return (
    <nav ref={ref} aria-label={`Telas de ${achado.porta.label}`} className={`mx-auto mb-4 w-full${conversaAberta ? " hidden md:block" : ""}`} style={{ maxWidth: "1140px" }} data-abas-da-area>
      {/* Todas as abas à vista, sem rolagem lateral: no celular elas quebram em mais
          de uma linha (pedido de 13/nov — a barra de rolagem escondia abas). */}
      <div
        className="flex flex-wrap gap-1 rounded-3xl p-1"
        style={{ background: "rgba(127,127,127,0.10)", border: navy ? "1px solid rgba(215,243,106,0.35)" : "1px solid var(--color-border)" }}
      >
        {achado.porta.abas.map((a) => {
          const ativa = a.href === achado.aba.href;
          return (
            <Link
              key={a.href}
              href={a.href}
              aria-current={ativa ? "page" : undefined}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors sm:px-4 sm:text-sm"
              style={
                navy
                  ? ativa
                    ? { background: "#D7F36A", color: "#16181D" }
                    : { color: "#D7F36A" }
                  : ativa
                    ? { background: "var(--tab-active-bg, #14233A)", color: "var(--tab-active-fg, #D7F36A)" }
                    : { color: "var(--color-text-muted)" }
              }
            >
              {a.label}
              {a.href === "/app/ai/cases" && <ContadorDeCasos compacto={false} />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default AbasDaArea;
