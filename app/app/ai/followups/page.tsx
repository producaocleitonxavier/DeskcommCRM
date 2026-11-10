import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { nichoDaOrg, semearModelosPoliticos } from "@/lib/followup/semear-politico";
import type { FollowupFlowPointerRow } from "@/hooks/followup/useFollowupFlows";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommandHero } from "@/components/politico/command-hero";
import { FlowsList } from "./_components/FlowsList";
import { QueueTab } from "./_components/QueueTab";

export const dynamic = "force-dynamic";

const FLOW_COLUMNS = "id, name, status, active_version_id, handoff_policy, updated_at";

export default async function FollowupFlowsPage() {
  const user = await requireAuth();
  // `t` local em vez do hook: esta página é componente de SERVIDOR, e lá o
  // idioma vem resolvido em `user.idioma` (a cadeia pessoa → organização →
  // padrão vive em `lib/auth/server.ts`).
  const t = (texto: string) => traduzir(texto, user.idioma);
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  // Fluxos (edição) segue exigindo manager+; a Fila (leitura) é de qualquer
  // member — o gate por tela fica dentro das abas (canWrite), não na rota.

  const supabase = await createClient();
  const canWrite = ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  // Nicho da org: recorta o catálogo de modelos (gabinete não vê clínica) e
  // escolhe a voz da tela. Um gabinete tem `pol_gabinete_config`.
  const nicho = await nichoDaOrg(supabase, activeOrg.orgId);

  const buscarFluxos = async () =>
    supabase
      .from("followup_flow_pointers")
      .select(FLOW_COLUMNS)
      .eq("organization_id", activeOrg.orgId)
      // Roteiro de atendimento não é follow-up (prova do #1130): tem tela própria.
      .neq("surface", "atendimento")
      .order("updated_at", { ascending: false });

  let { data } = await buscarFluxos();
  let flows = (data ?? []) as unknown as FollowupFlowPointerRow[];

  // CHEGAR CONFIGURADO: um gabinete que ainda NÃO tem nenhum follow-up recebe os
  // 3 do mandato como rascunho — a recepção revisa o texto e publica, não monta
  // do zero. A guarda é "zero fluxos" (não um flag em settings): o UPDATE em
  // `organizations` pelo client de sessão casa zero linhas por RLS e mentiria
  // "gravei" (ver `definirAvisoDeResolucao`). "Zero fluxos" também é a semântica
  // certa — quem apaga um dos 3 fica com 2, e nunca re-semeia (não ressuscita o
  // que a pessoa tirou de propósito). Só gestor. Best-effort: nunca derruba a tela.
  if (nicho === "politico" && canWrite && flows.length === 0) {
    await semearModelosPoliticos(supabase, activeOrg.orgId);
    ({ data } = await buscarFluxos());
    flows = (data ?? []) as unknown as FollowupFlowPointerRow[];
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <CommandHero
        eyebrow="Agente de IA · Follow-ups"
        titulo="Follow-ups"
        subtitulo="Fluxos automáticos de reengajamento — silêncio, etapa, webhook ou resposta do contato, sem intervenção em cada mensagem."
      />
      <Tabs defaultValue="fluxos" className="flex flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="fluxos">{t("Fluxos")}</TabsTrigger>
          <TabsTrigger value="fila">Fila</TabsTrigger>
        </TabsList>
        <TabsContent value="fluxos">
          <FlowsList initialData={flows} canWrite={canWrite} nicho={nicho} />
        </TabsContent>
        <TabsContent value="fila">
          <QueueTab canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
