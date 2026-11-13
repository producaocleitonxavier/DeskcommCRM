import type { Metadata } from "next";
import { NavHub } from "@/components/shell/NavHub";
import { ENDERECOS_DAS_SECOES, SecoesDoGabinete } from "@/components/shell/SecoesDoGabinete";
import { hubSections } from "@/lib/navigation/registry";
import { destinosDaInterface } from "@/lib/navigation/interface";
import { ehGabinete } from "@/lib/navigation/menu-do-gabinete";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configurações" };

/**
 * Hub de Organização.
 *
 * A lista de cards que vivia aqui era uma segunda navegação escrita à mão, e
 * divergia do sidebar — Funis, Conexões e Audit Log apareciam como se fossem
 * configuração, quando são CRM, Canais e Análise. Agora o conteúdo vem do
 * registro, e o que sobra aqui é o que de fato é organização: sua conta, sua
 * empresa, e quem tem acesso ao quê.
 *
 * O card-ponte para "Canal oficial (Meta) e templates" que a `main` manteve
 * aqui NÃO foi perdido no merge — ele foi promovido. A ponte existia porque
 * conectar canal tinha duas respostas dependendo do WhatsApp, e quem já sabia
 * procurar em Configurações precisava continuar achando. Com o registro, o
 * grupo CANAIS fica visível no sidebar para todo admin e o ⌘K acha "canal
 * oficial" por nome — a pergunta passa a ter um lugar só, que é o que a ponte
 * tentava ensinar apontando para outro.
 */
/**
 * Cartões herdados do sistema comercial que um gabinete não usa (proposta, cobrança,
 * conversão de anúncio) ou que já têm porta nas seções do gabinete. Só deixam de
 * aparecer AQUI: as telas continuam existindo e na busca.
 */
const CARTOES_DO_SISTEMA_COMERCIAL = [
  "/app/settings/tenant/proposals/modelos",
  "/app/settings/tenant/proposals",
  "/app/settings/tenant/financeiro",
  "/app/settings/conversoes",
  "/app/settings/billing",
  "/app/settings/meta-ads",
  "/app/extensions",
] as const;

export default async function SettingsHubPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const idioma = user.idioma;
  const modulos = await modulosLigados(createAdminClient());
  // Gabinete político: o que saiu do menu lateral (mandato, canais, IA, avançado)
  // tem porta aqui, em seções, só para quem já podia abrir cada tela.
  const visiveis = new Set(
    destinosDaInterface(activeOrg?.interface_settings, user.is_platform_admin && !user.support, activeOrg?.role ?? null, modulos).map((d) => d.href),
  );

  const gabinete = ehGabinete(visiveis);

  if (gabinete) {
    // O que o grupo "organização" tem e as seções não declararam cai no Avançado
    // (menos o que é só do sistema comercial): nenhuma tela de ajuste se perde.
    const comerciais = new Set<string>(CARTOES_DO_SISTEMA_COMERCIAL);
    const resto = hubSections("organizacao", user.is_platform_admin && !user.support, activeOrg?.role ?? null, activeOrg?.interface_settings, modulos)
      .flatMap((sec) => sec.items)
      .filter((d) => !ENDERECOS_DAS_SECOES.has(d.href) && !comerciais.has(d.href))
      .map((d) => ({ href: d.href, titulo: traduzir(d.label, idioma), texto: d.description ? traduzir(d.description, idioma) : "" }));
    return <SecoesDoGabinete visiveis={visiveis} resto={resto} />;
  }

  return (
    <>
    <NavHub
      group="organizacao"
      isPlatformAdmin={user.is_platform_admin && !user.support}
      role={activeOrg?.role ?? null}
      interfaceSettings={activeOrg?.interface_settings}
      // A porta do banco externo mora neste hub, e só existe com o módulo ligado.
      modulosLigados={modulos}
      title={traduzir("Configurações", idioma)}
      subtitle={traduzir("Sua conta, os dados da empresa e quem tem acesso ao quê.", idioma)}
      locale={idioma}
    />
    </>
  );
}
