/**
 * Cadastro vindo de um FORMULÁRIO DO SITE vira PESSOA da base do mandato.
 *
 * O motor de captação da base cria o contato e um registro no funil de vendas.
 * Num gabinete isso não basta: quem a equipe olha é a tela Pessoas, que lista
 * `pol_leads`. Sem esta ponte, o cadastro chegava e "sumia" — não aparecia em
 * Pessoas, não entrava nos níveis de relacionamento nem na nutrição.
 *
 * Roda dentro da rota pública de captação: NUNCA lança e nunca derruba o
 * cadastro. Organização que não é gabinete (sem `pol_gabinete_config`) não ganha
 * nada — o produto-base segue igual. `orgId` vem da FONTE (resolvida pelo token
 * no servidor), nunca do corpo do pedido.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** O texto guardado em `pol_leads.consent_origin`: de qual formulário a pessoa veio. */
export function origemDoFormulario(nomeDaFonte: string | null | undefined): string {
  const nome = (nomeDaFonte ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return nome ? `Formulário do site: ${nome}` : "Formulário do site";
}

export type ResultadoDaPessoa = "criada" | "ja_existia" | "nao_e_gabinete" | "erro";

export async function garantirPessoaDoMandato(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
  nomeDaFonte: string | null | undefined,
): Promise<ResultadoDaPessoa> {
  try {
    const { data: gabinete, error: errGab } = await admin
      .from("pol_gabinete_config")
      .select("organization_id")
      .eq("organization_id", orgId)
      .maybeSingle();
    if (errGab || !gabinete) return errGab ? "erro" : "nao_e_gabinete";

    const { error } = await admin.from("pol_leads").insert({
      organization_id: orgId,
      contact_id: contactId,
      support_level: "novo_cadastro",
      temperature: "frio",
      consent_origin: origemDoFormulario(nomeDaFonte),
      consent_at: new Date().toISOString(),
    });
    if (!error) return "criada";
    // Já é pessoa da base (cadastrou de novo, ou veio por outro caminho): não mexe no nível nem na origem.
    return (error as { code?: string }).code === "23505" ? "ja_existia" : "erro";
  } catch {
    return "erro";
  }
}
