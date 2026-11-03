/**
 * /configurar-mandato — a TELA CHEIA obrigatória da 1ª entrada do ADMIN.
 *
 * Fica FORA do /app (como o /onboarding) de propósito: o portão do /app
 * (app/app/layout.tsx) manda o admin NÃO configurado pra cá, e como esta rota
 * não é filha daquele layout, não há menu nem loop. Assessores (não-admin)
 * nunca são mandados pra cá — caem direto no sistema já configurado.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { lerMandatoConfig } from "@/lib/politico/setup-do-mandato";
import { marcaDaSaida } from "@/lib/branding/saida";
import BoasVindasEConfig from "./_boas-vindas";

export const dynamic = "force-dynamic";

export default async function ConfigurarMandatoPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/login");
  // Só o admin (chefia) configura. Assessor cai direto no sistema.
  if (ROLE_RANK[org.role as Role] < ROLE_RANK.admin) redirect("/app/politico");

  // NÃO redireciona quando já está configurado: ao concluir o wizard, a ação de
  // salvar revalida a rota e o `redirect` disparava ANTES do clique, matando a
  // tela de "Tudo pronto!". Quem já configurou chega aqui só digitando a URL —
  // e aí reabrir o assistente (pra reeditar) é inofensivo. A TRAVA de obrigar a
  // config vive no portão do /app (app/app/layout.tsx), não aqui.
  const db = await createClient();
  const [cfgRes, orgRes] = await Promise.all([
    db.from("pol_gabinete_config").select("nome_parlamentar, cargo, cidade, subtitulo").eq("organization_id", org.orgId).maybeSingle(),
    db.from("organizations").select("settings").eq("id", org.orgId).maybeSingle(),
  ]);
  const data = cfgRes.data;
  const m = lerMandatoConfig(orgRes.data?.settings);
  const marca = await marcaDaSaida(null);

  return (
    <BoasVindasEConfig
      inicial={{
        nome: data?.nome_parlamentar ?? "",
        cargo: data?.cargo ?? "",
        cidade: data?.cidade ?? "",
        subtitulo: data?.subtitulo ?? "",
        tipo: m?.tipo ?? null,
        uf: m?.uf ?? null,
        whats: m?.whats ?? null,
        horario: m?.horario ?? null,
        insta: m?.insta ?? null,
        endereco: m?.endereco ?? null,
        email: m?.email ?? null,
        agendaContato: m?.agendaContato ?? null,
        portal: m?.portal ?? null,
        servicos: m?.servicos ?? null,
        orgaos: m?.orgaos ?? null,
        bio: m?.bio ?? null,
        temas: m?.temas ?? null,
      }}
      marcaNome={marca.nome}
    />
  );
}
