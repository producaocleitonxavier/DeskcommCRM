/**
 * AUTO-ENROLL DE LIDERANÇA como multiplicador (peça do bloco Multiplicadores).
 *
 * Decisão do cliente: toda liderança cadastrada JÁ É PARCEIRA → entra sozinha na
 * máquina de multiplicação (recebe os conteúdos pra espalhar + aparece no placar),
 * sem convite+aceite (ser liderança é o consentimento). O cohort é por TAG em
 * `contacts`, então a liderança precisa de um CONTATO: usa o `contact_id` dela, ou
 * acha/cria um pelo whatsapp e linka de volta. Depois marca o contato
 * `multiplicador` + `divulgador` (entra na seção Divulgadores) + `lideranca`
 * (marcador pra distinguir no futuro).
 *
 * FAIL-SOFT: nunca lança — o cadastro da liderança não pode falhar por causa disto.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { TAG_MULTIPLICADOR } from "@/lib/politico/multiplicadores";
import { TAG_DIVULGADOR } from "@/lib/politico/divulgador";
import { normalizePhoneBR } from "@/lib/webhooks/inbound";

/** Marcador de que o multiplicador é uma LIDERANÇA (não assessor marcado, nem divulgador por aceite). */
export const TAG_LIDERANCA = "lideranca";

export async function enrolarLiderancaComoMultiplicador(
  admin: SupabaseClient,
  orgId: string,
  entrada: { liderancaId: string; contactId: string | null; whatsapp: string | null; nome: string | null },
): Promise<{ contactId: string | null }> {
  try {
    let contactId = (entrada.contactId ?? "").trim() || null;

    // Sem contato vinculado: acha-ou-cria um pelo whatsapp e linka de volta. O
    // whatsapp da liderança é CRU (pode vir "5531..." sem +); normaliza pra E.164
    // (+55...) — o mesmo formato dos contatos/envios, senão o contato criado seria
    // rejeitado no envio por "número inválido".
    if (!contactId) {
      const wa = normalizePhoneBR(entrada.whatsapp);
      if (!wa) return { contactId: null };
      const digitos = wa.replace(/\D/g, "");

      const { data: achado } = await admin
        .from("contacts")
        .select("id")
        .eq("organization_id", orgId)
        .ilike("phone_number", `%${digitos}%`)
        .limit(1)
        .maybeSingle();
      contactId = (achado as { id: string } | null)?.id ?? null;

      if (!contactId) {
        const { data: novo } = await admin
          .from("contacts")
          .insert({
            organization_id: orgId,
            name: (entrada.nome ?? "").trim() || "Liderança",
            phone_number: wa,
          })
          .select("id")
          .maybeSingle();
        contactId = (novo as { id: string } | null)?.id ?? null;
      }

      // Linka o contato de volta na liderança (só quando resolveu agora).
      if (contactId) {
        await admin
          .from("pol_liderancas")
          .update({ contact_id: contactId })
          .eq("id", entrada.liderancaId)
          .eq("organization_id", orgId);
      }
    }

    if (!contactId) return { contactId: null };

    // Marca o contato (idempotente: só grava se faltar alguma tag).
    const { data: ct } = await admin
      .from("contacts")
      .select("tags")
      .eq("organization_id", orgId)
      .eq("id", contactId)
      .maybeSingle();
    const tags = (((ct as { tags: string[] | null } | null)?.tags ?? []) as string[]).filter(
      (t) => typeof t === "string",
    );
    const novas = [...tags];
    for (const tag of [TAG_MULTIPLICADOR, TAG_DIVULGADOR, TAG_LIDERANCA]) {
      if (!novas.includes(tag)) novas.push(tag);
    }
    if (novas.length !== tags.length) {
      await admin.from("contacts").update({ tags: novas }).eq("id", contactId).eq("organization_id", orgId);
    }
    return { contactId };
  } catch {
    // Fail-soft: o cadastro da liderança já valeu; o enroll é best-effort.
    return { contactId: null };
  }
}
