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
import { recomputarEngajamento } from "@/lib/politico/engajamento";
import { enviarMaterialComoDocumento, enviarTextoNoCanal } from "@/lib/politico/enviar-material";
import { extrairCodigoIndicacao, processarIndicacao } from "@/lib/politico/indicacao";

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

// ─── PERFILAMENTO CONVERSACIONAL (cidade → bairro → aniversário) ──────────────
// Ano sentinela 2000 (bissexto → 29/02 existe): guardamos SÓ dia e mês do
// aniversário (o cliente não quer revelar a idade). Igual à rota do formulário.
const DIAS_NO_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Campo curto de texto livre (cidade/bairro): higieniza; null se não serve. */
export function limparCampoCurto(texto: string | null): string | null {
  const t = (texto ?? "").trim().replace(/\s+/g, " ");
  if (t.length < 2 || t.length > 120) return null;
  if (!/\p{L}/u.test(t)) return null; // precisa ter letra (evita "👍"/números soltos)
  return t;
}

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

/**
 * Lê "dia e mês" de uma resposta livre: "14/09", "14/9", "14-09", "14 09",
 * "14 de setembro". Brasil = DD/MM. Devolve {dia, mes} VÁLIDOS (dia cabe no mês),
 * ou null (aí o chamador re-pergunta).
 */
export function parseDiaMes(texto: string | null): { dia: number; mes: number } | null {
  const t = (texto ?? "").toLowerCase();
  const nums = (t.match(/\d{1,2}/g) ?? []).map(Number);
  let dia: number | null = null;
  let mes: number | null = null;
  if (nums.length >= 2) {
    [dia, mes] = [nums[0]!, nums[1]!];
  } else if (nums.length === 1) {
    const m = Object.entries(MESES).find(([k]) => t.includes(k)); // "14 de setembro"
    if (m) { dia = nums[0]!; mes = m[1]; }
  }
  if (dia == null || mes == null) return null;
  if (mes < 1 || mes > 12) return null;
  if (dia < 1 || dia > DIAS_NO_MES[mes - 1]!) return null;
  return { dia, mes };
}

export interface ResultadoQrCadastro {
  status: "ok" | "skipped" | "error";
  detail: string;
}

export async function processarCadastroQr(
  admin: SupabaseClient,
  entrada: { organizationId: string; contactId: string; texto: string | null; canalId?: string | null },
): Promise<ResultadoQrCadastro> {
  try {
    // Indicação pessoal ([ind:CODE]) tem prioridade: credita quem trouxe + acolhe.
    const codigoInd = extrairCodigoIndicacao(entrada.texto);
    if (codigoInd) {
      return await processarIndicacao(admin, {
        organizationId: entrada.organizationId,
        contactId: entrada.contactId,
        codigo: codigoInd,
        canalId: entrada.canalId ?? null,
      });
    }
    const codigo = extrairCodigoQr(entrada.texto);
    if (codigo) return await iniciarCadastro(admin, entrada.organizationId, entrada.contactId, codigo);
    // PERFILAMENTO CONVERSACIONAL: se a pessoa já recebeu o material e está num
    // passo de perfil (cidade/bairro/aniversário), a resposta dela é DESSE passo —
    // não é nome. Checa antes do fluxo de nome (estados são mutuamente exclusivos:
    // nome = material pendente; perfil = material já entregue).
    const perfil = await continuarPerfil(admin, entrada.organizationId, entrada.contactId, entrada.texto);
    if (perfil) return perfil;
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
  // Grava EXATAMENTE o nome do evento/ponto (sem prefixo): na lista de pessoas e
  // nos filtros, bate o olho e já sabe de qual evento a pessoa veio. Quem veio por
  // QR fica registrado na própria pol_qr_cadastros (origem_id) — aqui o source é o
  // "de onde veio" estratégico, legível para o gabinete.
  await admin
    .from("contacts")
    .update({ source: origem.nome })
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
  // Há um cadastro deste contato com o material ainda PENDENTE? (aguardando o
  // nome, ou com o nome já dado mas a entrega falhou — este caso re-entrega).
  // JANELA: só os RECENTES (48h) captam a resposta como nome — assim uma mensagem
  // qualquer semanas depois (ex.: uma reclamação) NÃO vira o nome da pessoa nem
  // dispara entrega fora de hora (LGPD / sobrescrita indevida).
  const janela = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const { data: pend } = await admin
    .from("pol_qr_cadastros")
    .select("id, nome_informado, pol_qr_origens!inner(id, nome, material_id, channel_session_id)")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .is("material_entregue_at", null)
    .gte("created_at", janela)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pend) return { status: "skipped", detail: "sem_cadastro_pendente" };
  const cad = pend as unknown as {
    id: string;
    nome_informado: string | null;
    pol_qr_origens: { id: string; nome: string; material_id: string | null; channel_session_id: string | null };
  };
  const origem = cad.pol_qr_origens;

  // Se o nome já foi dado antes (entrega falhou), re-entrega sem re-perguntar.
  let nome = cad.nome_informado;
  if (!nome) {
    nome = limparNome(texto);
    if (!nome) {
      // Não parece nome: re-pede uma vez, gentil.
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
  }

  // Cadastro confirmado = sinal do funil: recalcula o índice de engajamento.
  await recomputarEngajamento(admin, organizationId, contactId, { reason: "Cadastro por QR confirmado" });

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

  // RECLAMA a entrega ANTES de enviar (compare-and-set): dois inbounds concorrentes
  // da mesma pessoa (o drain roda em paralelo) não mandam o PDF duas vezes nem
  // convidam a indicar duas vezes. Quem não reclamar encerra.
  const { data: reclamou } = await admin
    .from("pol_qr_cadastros")
    .update({ material_entregue_at: new Date().toISOString() })
    .eq("id", cad.id)
    .is("material_entregue_at", null)
    .select("id")
    .maybeSingle();
  if (!reclamou) return { status: "ok", detail: "ja_entregue" };

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
    // Envio falhou: DEVOLVE o carimbo (reclamado antes do envio) → a próxima
    // mensagem re-tenta. Nome já gravado.
    await admin.from("pol_qr_cadastros").update({ material_entregue_at: null }).eq("id", cad.id);
    logger.warn("[qr-cadastro] envio do material falhou", { organization_id: organizationId, contact_id: contactId, detail: r.erro });
    return { status: "error", detail: `envio_falhou:${r.erro ?? ""}` };
  }
  // material_entregue_at já foi carimbado no reclaim. PERFILAMENTO CONVERSACIONAL:
  // em vez de mandar um LINK de formulário (link cru assusta/parece vírus; e botão
  // nativo não é confiável na conexão WAHA/NOWEB), começa a perguntar
  // cidade/bairro/aniversário NA PRÓPRIA CONVERSA — uma pergunta por vez. Decisão
  // do cliente 09/nov. Best-effort: se não enviar, a entrega do material já valeu.
  await iniciarPerfil(admin, { organizationId, contactId, cadastroId: cad.id, canalId: origem.channel_session_id });
  return { status: "ok", detail: `entregue:${origem.nome}` };
}

/** Começa o perfil conversacional após o material: marca etapa 'cidade' e pergunta. */
async function iniciarPerfil(
  admin: SupabaseClient,
  entrada: { organizationId: string; contactId: string; cadastroId: string; canalId: string },
): Promise<void> {
  const { organizationId, contactId, cadastroId, canalId } = entrada;
  try {
    await admin.from("pol_qr_cadastros").update({ etapa_perfil: "cidade" }).eq("id", cadastroId);
    await enviarTextoNoCanal(admin, {
      organizationId,
      contactId,
      canalId,
      texto: "Pra gente te mandar novidades e conteúdo da *sua região*, me conta: qual a sua *cidade*? 🏙️",
      rotulo: "qr-perfil-cidade",
    });
  } catch (err) {
    logger.warn("[qr-cadastro] falha ao iniciar perfil (segue normal)", {
      organization_id: organizationId,
      contact_id: contactId,
      detail: err instanceof Error ? err.message.slice(0, 120) : "?",
    });
  }
}

/** Mescla chaves na RAIZ de contacts.custom_fields (igual à rota do formulário). */
async function mesclarCustomFields(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  campos: Record<string, string>,
): Promise<void> {
  const { data } = await admin
    .from("contacts")
    .select("custom_fields")
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .maybeSingle();
  const atual = (data as { custom_fields: Record<string, unknown> | null } | null)?.custom_fields ?? {};
  await admin
    .from("contacts")
    .update({ custom_fields: { ...atual, ...campos } })
    .eq("organization_id", organizationId)
    .eq("id", contactId);
}

/**
 * Avança o perfil conversacional. Se o contato tem um cadastro num passo de perfil
 * (cidade/bairro/aniversário), a mensagem dele É a resposta desse passo: grava no
 * contato e pergunta o próximo (ou encerra). Devolve null se NÃO há passo pendente
 * (a mensagem segue para o fluxo de nome). Fail-soft (o chamador trata exceção).
 *
 * Janela de 72h sobre a ENTREGA: uma mensagem solta semanas depois não vira
 * "cidade" por engano (LGPD / não sobrescrever dado à toa).
 */
async function continuarPerfil(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  texto: string | null,
): Promise<ResultadoQrCadastro | null> {
  const janela = new Date(Date.now() - 72 * 3_600_000).toISOString();
  const { data: pend } = await admin
    .from("pol_qr_cadastros")
    .select("id, etapa_perfil, pol_qr_origens!inner(channel_session_id)")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .in("etapa_perfil", ["cidade", "bairro", "aniversario"])
    .gte("material_entregue_at", janela)
    .order("material_entregue_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!pend) return null;
  const cad = pend as unknown as {
    id: string;
    etapa_perfil: "cidade" | "bairro" | "aniversario";
    pol_qr_origens: { channel_session_id: string | null };
  };
  const canalId = cad.pol_qr_origens.channel_session_id;
  if (!canalId) return { status: "ok", detail: "perfil_sem_canal" };

  const perguntar = (texto: string, rotulo: string) =>
    enviarTextoNoCanal(admin, { organizationId, contactId, canalId, texto, rotulo });

  if (cad.etapa_perfil === "cidade") {
    const cidade = limparCampoCurto(texto);
    if (!cidade) {
      await perguntar("Pode me dizer só o nome da sua *cidade*? 🙂", "qr-perfil-cidade-rep");
      return { status: "ok", detail: "perfil_cidade_invalida" };
    }
    await mesclarCustomFields(admin, organizationId, contactId, { cidade });
    await admin.from("pol_qr_cadastros").update({ etapa_perfil: "bairro" }).eq("id", cad.id);
    await perguntar("Show! E o seu *bairro*?", "qr-perfil-bairro");
    return { status: "ok", detail: "perfil_cidade_ok" };
  }

  if (cad.etapa_perfil === "bairro") {
    const bairro = limparCampoCurto(texto);
    if (!bairro) {
      await perguntar("Me diz só o nome do seu *bairro*, por favor. 🙂", "qr-perfil-bairro-rep");
      return { status: "ok", detail: "perfil_bairro_invalido" };
    }
    await mesclarCustomFields(admin, organizationId, contactId, { bairro });
    await admin.from("pol_qr_cadastros").update({ etapa_perfil: "aniversario" }).eq("id", cad.id);
    await perguntar("Por último, seu *aniversário* 🎂 — só o *dia e o mês* (ex: 14/09).", "qr-perfil-aniversario");
    return { status: "ok", detail: "perfil_bairro_ok" };
  }

  // etapa_perfil === "aniversario"
  const dm = parseDiaMes(texto);
  if (!dm) {
    await perguntar("Não peguei a data 🙈 Me manda só o *dia e o mês*, assim: 14/09.", "qr-perfil-aniversario-rep");
    return { status: "ok", detail: "perfil_aniversario_invalido" };
  }
  await admin
    .from("contacts")
    .update({ birthdate: `2000-${pad2(dm.mes)}-${pad2(dm.dia)}` })
    .eq("organization_id", organizationId)
    .eq("id", contactId);
  await admin.from("pol_qr_cadastros").update({ etapa_perfil: "done" }).eq("id", cad.id);
  // Completou o perfil = pico de engajamento: recalcula o índice (fecha o laço).
  await recomputarEngajamento(admin, organizationId, contactId, { reason: "Perfil por QR completo" });
  await perguntar("Prontinho, muito obrigado! 🙌 Agora é só ficar de olho — vou te mandar novidades por aqui.", "qr-perfil-fim");
  return { status: "ok", detail: "perfil_completo" };
}
