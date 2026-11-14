/**
 * /app/politico/requerimentos — os documentos que o gabinete apresenta à Casa
 * (requerimento de comissão, indicação, pedido de informação, moção…), cada um
 * como registro próprio. É a segunda aba da porta "Ofícios e Requerimentos".
 *
 * Mesma trava da tela de Ofícios (papel + porta "Ofícios" no menu da pessoa).
 * `?demanda=<id>&subtipo=visita_tecnica` abre já um documento novo a partir de
 * uma demanda/visita — é o atalho do botão "Requerimento" das Visitas Técnicas.
 */
import { carregarDocumentos, pontoDePartidaDaDemanda } from "@/app/actions/politico/documentos";
import { exigirAcessoPolitico } from "@/lib/politico/acesso";

import RequerimentosClient from "./_client";

export const dynamic = "force-dynamic";

export default async function RequerimentosPage({
  searchParams,
}: {
  searchParams: Promise<{ demanda?: string; subtipo?: string; tipos?: string }>;
}) {
  await exigirAcessoPolitico("oficios");
  const sp = await searchParams;
  const painel = await carregarDocumentos();
  if (!painel.ok) {
    return (
      <div className="mx-auto max-w-[860px] px-4 py-10 text-sm" style={{ color: "var(--color-text-muted)" }}>
        {painel.erro}
      </div>
    );
  }
  const partida = sp.demanda ? await pontoDePartidaDaDemanda(sp.demanda) : null;
  return (
    <RequerimentosClient
      painel={painel}
      partida={partida && partida.ok ? partida.partida : null}
      avisoDePartida={partida && !partida.ok ? "Não achei a visita de onde você veio. Você pode criar o documento do zero." : null}
      subtipoInicial={typeof sp.subtipo === "string" ? sp.subtipo.slice(0, 60) : null}
      abrirTipos={sp.tipos === "1"}
    />
  );
}
