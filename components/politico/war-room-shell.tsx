"use client";

/**
 * WarRoomShell — escopa o tema "Sala de Guerra" (dark tático) ao módulo político.
 *
 * As CORES vêm dos overrides da classe `.war-room` no globals.css, que redefine
 * DIRETAMENTE os tokens que o Tailwind/shadcn lê (--background, --card, --border,
 * --muted-foreground, …) e os primitivos (--color-*) com valores dark fixos — à
 * prova do `@theme inline` e sem depender da cascata de `data-theme`.
 *
 * `data-theme="dark"` fica no PRÓPRIO wrapper (não no <html>, que pertence ao
 * theme provider do app) só para ativar os utilitários `dark:` das páginas
 * antigas; como é no div, não conflita com o provider nem afeta o resto do app.
 *
 * SEÇÃO NAVY (tema claro): as telas de INTELIGÊNCIA/TERRITÓRIO são de análise e
 * impressão — ali os cards ficam MARINHOS (texto branco + ícone verde), enquanto
 * as telas de trabalho (Gabinete/Pessoas/Demandas) seguem claras. É decidido aqui
 * por rota (um lugar só) via `.wr-navy-section`, lido por usePathname — disponível
 * no SSR do client component, então sem flash.
 */

import { usePathname } from "next/navigation";

import { peleDaTela } from "@/lib/navigation/menu-do-gabinete";

/** Rotas de análise/impressão (Inteligência + Território) que recebem o fundo
 * MARINHO no tema claro. As telas de TRABALHO ficam de fora (claras). Exportada
 * p/ o AppShell preencher a TELA inteira de navy nessas rotas também. */
export const ROTAS_NAVY = [
  // Território
  "/app/politico/raio-x",
  "/app/politico/comparativo",
  "/app/politico/radar-zonal",
  "/app/politico/cadeiras",
  "/app/politico/mapa-eleitoral",
  "/app/politico/projecao",
  "/app/politico/rankings",
  // Inteligência
  "/app/politico/boletim",
  "/app/politico/pesquisas",
  "/app/politico/social",
  "/app/politico/narrativas",
  "/app/politico/adversarios",
  "/app/politico/alertas",
  "/app/politico/decisao",
  "/app/politico/briefing",
  "/app/politico/motor-viral",
  // Operação / Modo Campanha — telas ESTRATÉGICAS (peso + "defesa" + contorno
  // premium, decisão do cliente 07/nov). Casam com Disparos (base, já navy).
  "/app/politico/grupos-origem",
  "/app/politico/multiplicadores",
  "/app/politico/materiais",
  "/app/politico/kanban", // Mobilização (quadro da campanha)
  "/app/politico/funil-invisivel", // Termômetro de Base
  // Voz do Mandato: VOLTA pro marinho (07/nov) — pertence à SALA DE OPERAÇÃO
  // (Atendimento: Inbox/Radar/Respostas/Casos, todos marinho). A seção é uma
  // unidade e tem uma pele só. Regra: GABINETE=branco, resto=marinho.
  "/app/politico/voz",
];

/**
 * A tela política `pathname` é marinho? Quem manda é a ÁREA do menu a que ela
 * pertence (uma pele por seção); só telas fora das áreas caem na lista acima.
 */
export function ehTelaPoliticaNavy(pathname: string): boolean {
  const pele = peleDaTela(pathname);
  if (pele) return pele === "marinho";
  return ROTAS_NAVY.some((r) => pathname.startsWith(r));
}

export default function WarRoomShell({
  children,
  claro = false,
}: {
  children: React.ReactNode;
  /** Tema CLARO (Marinho) escopado à org — só quando `organizations.settings.tema = "claro"`. */
  claro?: boolean;
}) {
  const pathname = usePathname() ?? "";
  const navy = claro && ehTelaPoliticaNavy(pathname);
  return (
    <div
      className={`war-room min-h-dvh${claro ? " wr-claro" : ""}${navy ? " wr-navy-section" : ""}`}
      data-theme={claro ? "light" : "dark"}
    >
      {children}
    </div>
  );
}
