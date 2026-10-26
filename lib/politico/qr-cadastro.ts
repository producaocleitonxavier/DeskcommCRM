/**
 * CADASTRO POR QR — o inbound receptivo da "arte manha", em DOIS PASSOS.
 *
 * A pessoa escaneia um QR (praça, escola, bio, evento) → o WhatsApp abre com a
 * mensagem PRONTA "Olá, estive na <local> e quero receber o material [qr:CODE]"
 * → ela só aperta enviar. Então:
 *
 *   PASSO 1 (chega o [qr:CODE]): criamos o lead, marcamos a origem e PEDIMOS o
 *   nome e sobrenome — NÃO entregamos o material ainda. Isso garante o nome mesmo
 *   de quem não tem nome no WhatsApp.
 *
 *   PASSO 2 (chega a resposta com o nome, SEM [qr:]): gravamos o nome, entregamos
 *   o ebook (anexo com nome) e fechamos o cadastro.
 *
 * Tudo RECEPTIVO (a pessoa iniciou) → ban ~zero e janela de 24h. O marcador é
 * `[qr:...]` e não `[ref:...]` (esse é o token de rastreio de ANÚNCIO).
 *
 * FAIL-SOFT: nunca lança — o chamador é um handler de evento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { enviarMaterialComoDocumento, enviarTextoNoCanal } from "@/lib/politico/enviar-material";

/** `[qr:CODE]` — colchetes e prefixo próprio para não casar por acidente. */
export const PADRAO_QR = /\[qr:([A-Za-z0-9_-]{2,24})\]/i;

/** Extrai o CÓDIGO da origem do texto (sempre MAIÚSCULO), ou null. */
export function extrairCodigoQr(texto: string | null): string | null {
  if (!texto) return null;
  const m = PADRAO_QR.exec(texto);
  return m ? m[1]!.toUpperCase() : null;
}

/** O nome que a pessoa respondeu, higienizado (ou null se não parecer nome). */
function limparNome(texto: string | null): string | null {
  const t = (texto ?? "").trim().replace(/\s+/g, " ");
  if (t.length < 2 || t.length > 80) return null;
  // Precisa ter ao menos uma letra; evita capturar "ok", "👍" ou números soltos.
  if (!/\p{L}/u.test(t)) return null;
  return t;
}

export interface ResultadoQrCadastro {
  status: "ok" | "skipped" | "error";
  detail: string;
}

export async function processarCadastroQr(
  admin: SupabaseClient,
  entrada: { organizationId: string; contactId: string; texto: string | null },
): Promise<ResultadoQrCadastro> {
  try {
    const codigo = extrairCodigoQr(entrada.texto);
    if (codigo) return await iniciarCadastro(admin, entrada.organizationId, entrada.contactId, codigo);
    return await capturarNomeEEntregar(admin, entrada.organizationId, entrada.contactId, entrada.texto);
  } catch (err) {
    logger.warn("[qr-cadastro] falhou (a conversa segue normal)", {
      organization_id: entrada.organizationId,
      contact_id: entrada.contactId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return { status: "error", detail: "excecao" };
  }
}

/** PASSO 1 — chegou o [qr:CODE]: cria o lead, marca a origem e pede o nome. */
async function iniciarCadastro(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  codigo: string,
): Promise<ResultadoQrCadastro> {
  const { data: org } = await admin
    .from("pol_qr_origens")
    .select("id, nome, channel_session_id, ativo")
    .eq("organization_id", organizationId)
    .eq("codigo", codigo)
    .eq("ativo", true)
    .maybeSingle();
  const origem = org as { id: string; nome: string; channel_session_id: string | null; ativo: boolean } | null;
  if (!origem) return { status: "skipped", detail: `origem_nao_encontrada:${codigo}` };

  // Cria o lead político (idempotente). Quem escaneou e mandou mensagem é simpatizante.
  const { data: leadExiste } = await admin
    .from("pol_leads")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (!leadExiste) {
    const { error: errLead } = await admin
      .from("pol_leads")
      .insert({ organization_id: organizationId, contact_id: contactId, support_level: "simpatizante" });
    if (errLead && errLead.code !== "23505") {
      logger.warn("[qr-cadastro] falha ao criar pol_lead", { error: errLead.message });
    }
  }

  // Origem no contato — FIRST-TOUCH (não sobrescreve de onde a pessoa veio).
  await admin
    .from("contacts")
    .update({ source: `QR · ${origem.nome}` })
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .or("source.is.null,source.eq.");

  // RECLAMA o cadastro (unique origem×contato), marcando "aguardando nome".
  const { data: claim, error: errClaim } = await admin
    .from("pol_qr_cadastros")
    .insert({ organization_id: organizationId, origem_id: origem.id, contact_id: contactId, aguardando_nome: true })
    .select("id")
    .maybeSingle();
  if (errClaim && errClaim.code === "23505") {
    // Já existe: se o material já saiu, encerra; se ainda aguarda nome, re-pede.
    const { data: existente } = await admin
      .from("pol_qr_cadastros")
      .select("material_entregue_at")
      .eq("origem_id", origem.id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (existente && (existente as { material_entregue_at: string | null }).material_entregue_at) {
      return { status: "ok", detail: "ja_cadastrado" };
    }
  } else if (errClaim) {
    return { status: "error", detail: errClaim.message };
  } else if (!claim) {
    return { status: "error", detail: "claim_vazio" };
  }

  // Pede o nome (só se houver canal pra responder).
  if (!origem.channel_session_id) return { status: "ok", detail: "sem_canal" };
  const r = await enviarTextoNoCanal(admin, {
    organizationId,
    contactId,
    canalId: origem.channel_session_id,
    texto:
      "Olá, fico feliz que tenha se interessado! 🙏 Antes de te enviar o material, me confirma aqui, por favor, só o seu *nome e sobrenome*.",
    rotulo: `qr-pede-nome:${origem.id}`,
  });
  if (!r.enviou) {
    logger.warn("[qr-cadastro] falha ao pedir o nome", { organization_id: organizationId, contact_id: contactId, detail: r.erro });
    return { status: "error", detail: `pedido_nome_falhou:${r.erro ?? ""}` };
  }
  return { status: "ok", detail: `aguardando_nome:${origem.nome}` };
}

/** PASSO 2 — chegou texto sem [qr:]: se há cadastro aguardando nome, grava e entrega. */
async function capturarNomeEEntregar(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  texto: string | null,
): Promise<ResultadoQrCadastro> {
  // Há um cadastro deste contato aguardando o nome (e sem material entregue)?
  const { data: pend } = await admin
    .from("pol_qr_cadastros")
    .select("id, pol_qr_origens!inner(id, nome, material_id, channel_session_id)")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("aguardando_nome", true)
    .is("material_entregue_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pend) return { status: "skipped", detail: "sem_cadastro_pendente" };
  const cad = pend as unknown as {
    id: string;
    pol_qr_origens: { id: string; nome: string; material_id: string | null; channel_session_id: string | null };
  };
  const origem = cad.pol_qr_origens;

  const nome = limparNome(texto);
  if (!nome) {
    // Não parece nome: re-pede uma vez, gentil (mantém aguardando).
    if (origem.channel_session_id) {
      await enviarTextoNoCanal(admin, {
        organizationId,
        contactId,
        canalId: origem.channel_session_id,
        texto: "Pode me mandar só o seu *nome e sobrenome*? Aí já te envio o material. 🙂",
        rotulo: `qr-repede-nome:${origem.id}`,
      });
    }
    return { status: "ok", detail: "nome_invalido_repediu" };
  }

  // Grava o nome no contato (confirmação da pessoa) e no cadastro.
  await admin.from("contacts").update({ name: nome }).eq("organization_id", organizationId).eq("id", contactId);
  await admin
    .from("pol_qr_cadastros")
    .update({ nome_informado: nome, aguardando_nome: false })
    .eq("id", cad.id);

  // Entrega o material (se houver material e canal).
  if (!origem.material_id || !origem.channel_session_id) {
    await admin.from("pol_qr_cadastros").update({ material_entregue_at: new Date().toISOString() }).eq("id", cad.id);
    return { status: "ok", detail: "nome_ok_sem_material" };
  }
  const { data: mat } = await admin
    .from("pol_materiais")
    .select("titulo, url, ativo")
    .eq("organization_id", organizationId)
    .eq("id", origem.material_id)
    .maybeSingle();
  const material = mat as { titulo: string | null; url: string | null; ativo: boolean | null } | null;
  if (!material || material.ativo === false || !material.url) {
    await admin.from("pol_qr_cadastros").update({ material_entregue_at: new Date().toISOString() }).eq("id", cad.id);
    return { status: "ok", detail: "nome_ok_material_invalido" };
  }

  const primeiro = nome.split(" ")[0];
  const legenda = material.titulo
    ? `Obrigado, ${primeiro}! 🙏 Aqui está o material: *${material.titulo}*. Qualquer dúvida, é só me chamar por aqui.`
    : `Obrigado, ${primeiro}! 🙏 Aqui está o material. Qualquer dúvida, é só me chamar por aqui.`;
  const r = await enviarMaterialComoDocumento(admin, {
    organizationId,
    contactId,
    canalId: origem.channel_session_id,
    material: { titulo: material.titulo, url: material.url },
    legenda,
    rotulo: `qr-cadastro:${origem.id}`,
  });
  if (!r.enviou) {
    // Nome já gravado; material_entregue_at fica null (operador vê na lista).
    logger.warn("[qr-cadastro] envio do material falhou", { organization_id: organizationId, contact_id: contactId, detail: r.erro });
    return { status: "error", detail: `envio_falhou:${r.erro ?? ""}` };
  }
  await admin.from("pol_qr_cadastros").update({ material_entregue_at: new Date().toISOString() }).eq("id", cad.id);
  return { status: "ok", detail: `entregue:${origem.nome}` };
}
