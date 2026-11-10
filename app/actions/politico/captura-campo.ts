"use server";

/**
 * CAPTURA DE CAMPO ("10 segundos") — o assessor na rua vê uma ocorrência (fio
 * pendurado, poste caindo, buraco), FALA ou ESCREVE + foto + GPS, e a IA:
 *  (1) transcreve a voz (reusa a escada de transcrição do WhatsApp);
 *  (2) LIMPA o português e estrutura em uma demanda EXATA — e SUGERE O ÓRGÃO a
 *      cobrar (a dor nº1: o assessor de rua não sabe que fio=Cemig, água=Copasa).
 *
 * Regra de ouro do time: a IA NÃO INVENTA. Lacuna vira "a confirmar". Nada salva
 * sem o assessor revisar e confirmar (modo assistido — TSE/LGPD). Custo mínimo:
 * 1 transcrição curta + 1 chamada de IA curta, com teto; zero IA em GPS/ofício.
 * Degrada: sem IA na org, vira formulário rápido com o texto cru.
 *
 * Toda a atribuição ao assessor vem de criarRegistro (carimba pol_registrado_por_id)
 * → a ocorrência sobe no placar dele. Ocorrência sem cidadão → contato-placeholder
 * "Demanda de campo" (não polui o funil).
 */

import { generateText } from "ai";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { cerebroDaOrg, modeloDoCerebro } from "@/lib/ai/cerebro";
import { decidirTranscricao } from "@/lib/messaging/media/escada-de-transcricao";
import { enderecoAproximadoDoPino } from "@/lib/mapas/credencial";
import { criarRegistro, criarCidadao, garantirLeadNovoCadastro } from "@/app/actions/politico/gabinete-actions";

// Áreas válidas (espelha demandas.pol_tipo / o form de Nova Demanda).
const AREAS_VALIDAS = [
  "servico_publico",
  "infraestrutura",
  "saude",
  "educacao",
  "seguranca",
  "assistencia_social",
  "meio_ambiente",
  "documentacao",
  "outro",
] as const;

// Palpite de órgão SEM IA (fallback quando a org não tem IA configurada). Regional,
// pensado em MG/BH mas genérico o bastante; é só um chute inicial que o assessor
// confirma. A IA, quando há, faz MUITO melhor (conhece as concessionárias locais).
function orgaoPalpite(texto: string): string {
  const t = texto.toLowerCase();
  if (/\b(fio|poste|energia|luz|ilumina|cemig|transformador|rede el[ée]trica)\b/.test(t)) return "Cemig";
  if (/\b([aá]gua|esgoto|vazamento|cano|copasa|boca de lobo|galeria)\b/.test(t)) return "Copasa";
  if (/\b([aá]rvore|poda|galho|mato|capina)\b/.test(t)) return "Secretaria de Meio Ambiente";
  if (/\b(buraco|asfalto|via|rua|cal[çc]ada|pavimenta|sinaliza|sem[aá]foro|tapa)\b/.test(t)) return "Secretaria de Obras";
  if (/\b(lixo|entulho|coleta|limpeza|slu)\b/.test(t)) return "Limpeza Urbana (SLU)";
  return "";
}

function primeiraFrase(texto: string, max = 90): string {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (!limpo) return "";
  const ate = limpo.split(/(?<=[.!?])\s/)[0] ?? limpo;
  return ate.length > max ? ate.slice(0, max - 1).trimEnd() + "…" : ate;
}

/**
 * A voz (transcrição) está disponível para esta org? Roda a MESMA escada da
 * transcrição (sem áudio — só decide quem transcreveria) e diz se há transcriber.
 * A tela usa isto pra MOSTRAR o microfone só quando ele vai funcionar de verdade;
 * senão, o "escrever" é o protagonista (a IA ainda limpa e sugere o órgão).
 */
export async function vozDisponivel(): Promise<boolean> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return false;
  const admin = createAdminClient();
  const cerebro = await cerebroDaOrg(admin, org.orgId);
  const comIA = "erro" in cerebro ? null : cerebro;
  try {
    const decisao = await decidirTranscricao({
      conversa: comIA
        ? { provider: comIA.provider, apiKey: comIA.apiKey, modelId: comIA.model, baseUrl: null }
        : null,
      chaveOpenai: async () => (comIA && comIA.provider === "openai" ? comIA.apiKey : null),
    });
    return decisao.transcriber != null;
  } catch {
    return false;
  }
}

export type ResultadoTranscricao = { ok: true; texto: string } | { ok: false; erro: string };

/**
 * Transcreve o áudio da captura (base64). Reusa a ESCADA de transcrição do
 * WhatsApp: 1) serviço da instalação (TRANSCRIPTION_API_KEY), 2) chave OpenAI,
 * 3) o modelo de conversa da org se ele entende áudio. Degrada: sem transcrição,
 * o assessor escreve (a voz é opcional).
 */
export async function transcreverCaptura(audioBase64: string, mime: string): Promise<ResultadoTranscricao> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };
  if (!audioBase64) return { ok: false, erro: "Áudio vazio." };

  const admin = createAdminClient();
  const cerebro = await cerebroDaOrg(admin, org.orgId);
  const comIA = "erro" in cerebro ? null : cerebro;

  try {
    const decisao = await decidirTranscricao({
      conversa: comIA
        ? { provider: comIA.provider, apiKey: comIA.apiKey, modelId: comIA.model, baseUrl: null }
        : null,
      chaveOpenai: async () => (comIA && comIA.provider === "openai" ? comIA.apiKey : null),
    });
    if (!decisao.transcriber) {
      return { ok: false, erro: "Transcrição de voz indisponível nesta instalação. Escreva o relato." };
    }
    const buffer = Buffer.from(audioBase64, "base64");
    const texto = (await decisao.transcriber.transcribe(buffer, mime)).trim();
    if (!texto) return { ok: false, erro: "Não consegui entender o áudio. Grave de novo ou escreva." };
    return { ok: true, texto };
  } catch {
    return { ok: false, erro: "Falha ao transcrever. Tente de novo ou escreva o relato." };
  }
}

/** O rascunho estruturado que a IA (ou o fallback) devolve para o assessor revisar. */
export interface RascunhoOcorrencia {
  assunto: string;
  descricao: string;
  area: string;
  orgaoSugerido: string;
  bairro: string;
  rua: string;
  cidade: string;
  /** O texto cru original (voz transcrita + o que foi digitado) — mostrado ao lado na revisão. */
  cru: string;
  /** true = org sem IA; o rascunho é bruto e o assessor organiza à mão. */
  semIA: boolean;
}

export type ResultadoEstrutura = { ok: true; rascunho: RascunhoOcorrencia } | { ok: false; erro: string };

/**
 * Transforma o relato cru (voz+texto) numa demanda EXATA: limpa o português,
 * escreve objetivo, classifica a área e SUGERE o órgão a cobrar. GPS vira
 * rua+cidade (reverse-geocode real; não devolve bairro — o assessor confirma).
 */
export async function estruturarOcorrencia(input: {
  textoCru: string;
  latitude?: number | null;
  longitude?: number | null;
  /** Órgãos reais DESTE mandato (ex.: Cemig, Copasa, PBH…) — a IA nomeia o certo, não o genérico. */
  orgaos?: string[];
}): Promise<ResultadoEstrutura> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };

  const cru = (input.textoCru ?? "").trim();
  if (!cru) return { ok: false, erro: "Grave ou escreva o que você viu." };

  const admin = createAdminClient();

  // GPS → rua + cidade (zero IA). Sem chave de mapas na org, volta null e o
  // assessor digita. Nunca lança (enderecoAproximadoDoPino é fail-soft).
  let rua = "";
  let cidade = "";
  if (typeof input.latitude === "number" && typeof input.longitude === "number") {
    try {
      const endereco = await enderecoAproximadoDoPino(admin, org.orgId, {
        latitude: input.latitude,
        longitude: input.longitude,
      });
      rua = endereco?.rua ?? "";
      cidade = endereco?.cidade ?? "";
    } catch {
      /* fail-soft: assessor digita */
    }
  }

  const cerebro = await cerebroDaOrg(admin, org.orgId);

  // Sem IA: entrega um rascunho bruto (não trava a captura). O assessor organiza.
  if ("erro" in cerebro) {
    return {
      ok: true,
      rascunho: {
        assunto: primeiraFrase(cru),
        descricao: cru,
        area: "outro",
        orgaoSugerido: orgaoPalpite(cru),
        bairro: "",
        rua,
        cidade,
        cru,
        semIA: true,
      },
    };
  }

  const system =
    "Você é assessor(a) de gabinete parlamentar no Brasil, registrando uma OCORRÊNCIA vista na rua " +
    "(ex.: fio pendurado, poste caindo, buraco, vazamento, árvore com risco). Sua tarefa é LIMPAR o " +
    "português e ESTRUTURAR o relato de forma EXATA e objetiva — NUNCA inventar fatos, números, nomes, " +
    "endereços ou detalhes que não estejam no texto. Se algo não está claro, deixe em branco ou escreva " +
    "'a confirmar'. Você também SUGERE qual órgão/concessionária é responsável por resolver (quem cobrar): " +
    "fiação/poste/energia/iluminação = companhia de energia (ex.: Cemig em MG); água/esgoto/vazamento = " +
    "companhia de saneamento (ex.: Copasa em MG); árvore/poda = Secretaria de Meio Ambiente; " +
    "buraco/asfalto/via/calçada/sinalização = Secretaria de Obras; lixo/entulho = Limpeza Urbana. " +
    "Responda SOMENTE com um objeto JSON válido, sem comentários e sem cercas de código.";

  const listaOrgaos = (input.orgaos ?? []).filter((o) => o && o.trim()).slice(0, 20);
  const prompt =
    `Relato cru do assessor (voz transcrita e/ou digitada):\n"""${cru}"""\n\n` +
    (rua || cidade ? `Localização aproximada pelo GPS: ${[rua, cidade].filter(Boolean).join(", ")}.\n\n` : "") +
    (listaOrgaos.length > 0
      ? `Órgãos reais DESTE mandato: ${listaOrgaos.join(", ")}.\n` +
        `No campo "orgao" use PREFERENCIALMENTE o NOME EXATO de um desses (ex.: escreva "Cemig", não "companhia de energia"). Só use outro nome se nenhum servir.\n\n`
      : "") +
    `Devolva um JSON com EXATAMENTE estas chaves:\n` +
    `{\n` +
    `  "assunto": "título curto e claro da ocorrência (máx. ~90 caracteres)",\n` +
    `  "descricao": "relato objetivo e bem escrito em 1 a 3 frases, SÓ com o que foi dito, sem inventar",\n` +
    `  "area": "uma destas: ${AREAS_VALIDAS.join(", ")}",\n` +
    `  "orgao": "órgão/concessionária responsável por resolver (quem cobrar), ou '' se não souber",\n` +
    `  "bairro": "o bairro SE aparecer no relato; senão deixe ''"\n` +
    `}`;

  try {
    const { text } = await generateText({
      model: modeloDoCerebro(cerebro),
      system,
      prompt,
      maxOutputTokens: 500,
    });
    // Parse robusto: tira cercas de código e pega o primeiro objeto JSON.
    const limpo = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    const alvo = inicio >= 0 && fim > inicio ? limpo.slice(inicio, fim + 1) : limpo;
    const j = JSON.parse(alvo) as Record<string, unknown>;

    const area = String(j.area ?? "").trim();
    const rascunho: RascunhoOcorrencia = {
      assunto: String(j.assunto ?? "").trim() || primeiraFrase(cru),
      descricao: String(j.descricao ?? "").trim() || cru,
      area: (AREAS_VALIDAS as readonly string[]).includes(area) ? area : "outro",
      orgaoSugerido: String(j.orgao ?? "").trim() || orgaoPalpite(cru),
      bairro: String(j.bairro ?? "").trim(),
      rua,
      cidade,
      cru,
      semIA: false,
    };
    return { ok: true, rascunho };
  } catch {
    // IA falhou/retornou inválido: cai no bruto, mas a captura não trava.
    return {
      ok: true,
      rascunho: {
        assunto: primeiraFrase(cru),
        descricao: cru,
        area: "outro",
        orgaoSugerido: orgaoPalpite(cru),
        bairro: "",
        rua,
        cidade,
        cru,
        semIA: true,
      },
    };
  }
}

/** Nome do contato-placeholder para ocorrências de rua sem cidadão. */
const CONTATO_CAMPO_NOME = "Demanda de campo (sem solicitante)";

/**
 * Garante o contato-placeholder "Demanda de campo" da org (1 por org) e devolve
 * seu id. NÃO entra no funil (não é pessoa de verdade) — fica marcado por tag.
 */
async function garantirContatoDeCampo(orgId: string): Promise<string | null> {
  const db = await createClient();
  const { data: existente } = await db
    .from("contacts")
    .select("id")
    .eq("organization_id", orgId)
    .contains("tags", ["_demanda_de_campo"])
    .limit(1)
    .maybeSingle();
  if (existente?.id) return existente.id as string;

  const { data: novo } = await db
    .from("contacts")
    .insert({
      organization_id: orgId,
      name: CONTATO_CAMPO_NOME,
      source: "gabinete",
      tags: ["_demanda_de_campo"],
    })
    .select("id")
    .maybeSingle();
  return (novo?.id as string | undefined) ?? null;
}

export type ResultadoCriacao = { ok: true; demandaId: string } | { ok: false; erro: string };

/**
 * Cria a demanda do gabinete a partir do rascunho CONFIRMADO pelo assessor.
 * Atribuída a ele (criarRegistro carimba pol_registrado_por_id + dono humano) →
 * sobe no placar. A foto sobe depois no cliente (precisa do id). Nasce COM órgão
 * → entra na cobrança/vigia que já existe.
 */
export async function criarOcorrenciaCampo(input: {
  assunto: string;
  area: string;
  orgao: string;
  prioridade: string;
  bairro?: string;
  rua?: string;
  numero?: string;
  cidade?: string;
  /** Cidadão nomeado (opcional): se vier, cria/liga o contato; senão, placeholder de campo. */
  contatoId?: string | null;
  contatoNome?: string | null;
  contatoFone?: string | null;
}): Promise<ResultadoCriacao> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };

  const assunto = (input.assunto ?? "").trim();
  if (!assunto) return { ok: false, erro: "A descrição ficou vazia. Revise antes de registrar." };

  // Resolve o demandante: id existente → nome (cria cidadão + entra no funil) →
  // placeholder "Demanda de campo".
  let contactId = (input.contatoId ?? "").trim() || null;
  if (!contactId && (input.contatoNome ?? "").trim()) {
    const res = await criarCidadao(input.contatoNome!.trim(), input.contatoFone ?? undefined);
    if (res.ok && res.id) {
      contactId = res.id;
      await garantirLeadNovoCadastro(res.id);
    }
  }
  if (!contactId) contactId = await garantirContatoDeCampo(org.orgId);
  if (!contactId) return { ok: false, erro: "Não consegui preparar o registro. Tente de novo." };

  const area = (AREAS_VALIDAS as readonly string[]).includes(input.area) ? input.area : "outro";
  const payload: Record<string, unknown> = {
    contact_id: contactId,
    origem: "manual",
    pol_gabinete: true,
    estado: "aberta",
    // O assessor que capturou é o DONO humano (além de registrador, carimbado em
    // criarRegistro). Fica responsável inicial; o gabinete reassume se precisar.
    dono_kind: "humano",
    dono_user_id: user.id,
    assunto,
    pol_tipo: area,
    pol_prioridade: (input.prioridade ?? "normal").trim() || "normal",
    // Marca que veio da Captura de Campo (Gabinete de Rua) — alimenta o card e o
    // quadro "Registros de Rua". Migration 9094.
    pol_origem_captura: "campo",
  };
  if ((input.orgao ?? "").trim()) payload.pol_orgao_destino = input.orgao.trim();
  if ((input.bairro ?? "").trim()) payload.pol_bairro = input.bairro!.trim();
  if ((input.rua ?? "").trim()) payload.pol_logradouro = input.rua!.trim();
  if ((input.numero ?? "").trim()) payload.pol_numero = input.numero!.trim();
  if ((input.cidade ?? "").trim()) payload.pol_municipio = input.cidade!.trim();

  const res = await criarRegistro("demandas", payload);
  if (!res.ok || !res.id) return { ok: false, erro: res.ok ? "Não consegui obter o id da demanda." : res.erro };
  return { ok: true, demandaId: res.id };
}
