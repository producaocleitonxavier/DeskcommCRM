import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { CommandHero } from "@/components/politico/command-hero";
import ObraForm, { type EmendaOpcao } from "../form";

export const dynamic = "force-dynamic";

export default async function NovaObraPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const db = await createClient();
  const [{ data: emendas }, { data: config }] = await Promise.all([
    db.from("pol_emendas").select("id, numero, ano, descricao, valor_indicado_cents").eq("organization_id", org.orgId).order("ano", { ascending: false }).limit(200),
    db.from("pol_gabinete_config").select("cargo").eq("organization_id", org.orgId).maybeSingle(),
  ]);
  const cargo = String((config as { cargo?: string } | null)?.cargo ?? "").toLowerCase();
  const natureza: "execucao" | "fiscalizacao" = /prefeit|governad|vice/.test(cargo) ? "execucao" : "fiscalizacao";

  return (
    <div className="mx-auto max-w-[820px] space-y-6 px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero eyebrow="Gabinete · Obras & Fiscalização" titulo="Nova obra / contrato" subtitulo="Preencha o essencial agora — você completa os detalhes e adiciona vistorias e fotos na tela da obra." />
      <ObraForm emendas={(emendas ?? []) as EmendaOpcao[]} naturezaInicial={natureza} />
    </div>
  );
}
