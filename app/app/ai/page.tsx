import type { Metadata } from "next";
import { NavHub } from "@/components/shell/NavHub";
import { CommandHero } from "@/components/politico/command-hero";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirPortaDoPerfil } from "@/lib/politico/acesso";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agente de IA" };

/**
 * Hub da área de IA.
 *
 * Substitui as abas que só apareciam para quem JÁ estava dentro de `/app/ai/*`:
 * Conhecimento, Credenciais, Uso, Casos e Alertas eram invisíveis de qualquer
 * outro lugar do sistema. Aqui as dez telas aparecem juntas, na jornada de quem
 * opera um agente — montar, ensinar, acompanhar.
 *
 * Passa `locale` (o padrão do `NavHub` é pt-BR): sem isso o hub inteiro ficava
 * em português mesmo com idioma=es — títulos, seções e descrições.
 */
export default async function AiHubPage() {
  await exigirPortaDoPerfil("/app/ai", { indice: true });
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const idioma = user.idioma;

  return (
    <>
      <div className="px-6 pt-6">
        <CommandHero
          eyebrow="Agente de IA · Agentes"
          titulo="Agentes de IA"
          subtitulo="Tudo que define quem atende por você — e como acompanhar o que ele faz."
        />
      </div>
      {/* O cabeçalho do NavHub é suprimido (title/subtitle vazios): o banner
          acima é a nova apresentação. O NavHub é compartilhado por outros hubs
          (CRM, Análise, Configurações), então não se edita aqui. */}
      <NavHub
        group="ia"
        isPlatformAdmin={user.is_platform_admin && !user.support}
        role={activeOrg?.role ?? null}
        interfaceSettings={activeOrg?.interface_settings}
        modulosLigados={await modulosLigados(createAdminClient())}
        title=""
        subtitle=""
        locale={idioma}
      />
    </>
  );
}
