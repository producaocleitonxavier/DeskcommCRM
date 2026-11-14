/**
 * PORTA DO DIVULGADOR (peça 4 do bloco Multiplicadores).
 *
 * O cidadão comum não entra na máquina de multiplicação automático: entra por
 * MÉRITO + ACEITE. Um apoiador+ recebe um CONVITE ("quer receber conteúdos
 * exclusivos e ajudar a espalhar?"); quando responde SIM (o aceite), vira
 * multiplicador — passa a receber os vídeos do IG com o link pessoal dele.
 *
 * Aqui mora: (1) a detecção do aceite/recusa (texto livre, tolerante) — só leitura,
 * recebe o `admin`; (2) quem é ELEGÍVEL pro convite. O CONVITE em si (envio 1-a-1)
 * vive em `app/actions/politico/divulgador-actions.ts`; o gatilho do aceite no
 * inbound, em `lib/politico/divulgador-aceite.handler.ts`.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { TAG_MULTIPLICADOR } from "@/lib/politico/multiplicadores";

/** Pendente de resposta ao convite (foi convidado, ainda não aceitou/recusou). */
export const TAG_DIVULGADOR_CONVIDADO = "divulgador_convidado";
/** Recusou o convite — não reconvidar nem contar como elegível. */
export const TAG_DIVULGADOR_RECUSOU = "divulgador_recusou";
/**
 * SELO do que entrou por CONVITE+ACEITE (apoiador que virou divulgador), separado
 * de quem foi marcado como ASSESSOR (só `multiplicador`). Divulgador tem AS DUAS:
 * `multiplicador` (entra no placar/envio, mesma máquina) + `divulgador` (saber
 * quem é quem — tela separada vem na reorg). Decisão do cliente 02/nov.
 */
export const TAG_DIVULGADOR = "divulgador";

/**
 * Só Participante pra cima merece o convite (régua garante interesse real).
 * `voto_certo` fica na lista só para LER registro antigo — o mandato não usa
 * esse nível (lib/politico/niveis.ts) e ele conta como Multiplicador.
 */
const SUPORTE_APOIADOR_MAIS = ["apoiador", "militante", "voto_certo"];

function normaliza(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Palavras (tokens) do texto — minúsculo, sem acento; mantém 👍. */
function tokens(s: string): string[] {
  return normaliza(s)
    .split(/[^a-z0-9👍]+/)
    .filter(Boolean);
}

// Match por TOKEN exato (palavra única) — nunca substring, senão "assim"/
// "simplesmente" contariam como "sim".
const AFIRMATIVOS = new Set(["sim", "quero", "aceito", "aceita", "claro", "bora", "pode", "positivo", "topo", "vamos", "aceitar"]);
const AFIRMATIVOS_FRASE = ["com certeza", "to dentro", "estou dentro", "quero sim"];
const NEGATIVOS = new Set(["nao", "dispenso", "depois", "cancelar", "sair", "parar"]);
const NEGATIVOS_FRASE = ["nao quero", "agora nao"];

/** O texto é um "sim" (aceite)? Tolerante, mas por palavra inteira. */
export function ehAfirmativo(texto: string): boolean {
  if (!texto) return false;
  if (texto.includes("👍")) return true;
  const n = normaliza(texto);
  if (AFIRMATIVOS_FRASE.some((f) => n.includes(f))) return true;
  return tokens(texto).some((t) => AFIRMATIVOS.has(t));
}

/** O texto é um "não" (recusa)? Vence o afirmativo (ex.: "não quero"). */
export function ehNegativo(texto: string): boolean {
  if (!texto) return false;
  const n = normaliza(texto);
  if (NEGATIVOS_FRASE.some((f) => n.includes(f))) return true;
  return tokens(texto).some((t) => NEGATIVOS.has(t));
}

export interface ContatoElegivel {
  id: string;
  name: string | null;
  phone_number: string | null;
  /** Marcado como "Potencial multiplicador / líder" no cadastro — convida PRIMEIRO. */
  potencial: boolean;
}

interface LeadComContato {
  contact_id: string;
  leader_potential: boolean | null;
  contacts: { id: string; name: string | null; phone_number: string | null; tags: string[] | null } | null;
}

/**
 * Apoiador+ que PODE ser convidado: com telefone, sem opt-out, e que ainda não é
 * multiplicador nem já foi convidado/recusou. Join por `contacts!contact_id`
 * (há duas FKs pol_leads→contacts). Lê até 1000 leads e filtra as tags no app
 * (filtro de array embarcado no PostgREST é frágil).
 *
 * ORDEM: quem foi marcado como POTENCIAL multiplicador/líder (`leader_potential`)
 * vem PRIMEIRO — é o palpite do assessor sobre quem espalha; como o convite corta
 * no cap, os potenciais são convidados antes. Sort ESTÁVEL (dentro de cada grupo
 * mantém a ordem de leitura).
 */
async function lerElegiveis(db: SupabaseClient, orgId: string): Promise<ContatoElegivel[]> {
  const { data } = await db
    .from("pol_leads")
    .select("contact_id, leader_potential, contacts!contact_id(id, name, phone_number, tags)")
    .eq("organization_id", orgId)
    .in("support_level", SUPORTE_APOIADOR_MAIS)
    .eq("opt_out", false)
    .limit(1000);

  const rows = (data ?? []) as unknown as LeadComContato[];
  const bloqueadas = new Set([TAG_MULTIPLICADOR, TAG_DIVULGADOR_CONVIDADO, TAG_DIVULGADOR_RECUSOU]);
  const vistos = new Set<string>();
  const out: ContatoElegivel[] = [];
  for (const r of rows) {
    const c = r.contacts;
    if (!c || !c.id || vistos.has(c.id)) continue;
    if (!(c.phone_number ?? "").trim()) continue;
    const tags = ((c.tags ?? []) as string[]).filter((t) => typeof t === "string");
    if (tags.some((t) => bloqueadas.has(t))) continue;
    vistos.add(c.id);
    out.push({ id: c.id, name: c.name ?? null, phone_number: c.phone_number ?? null, potencial: !!r.leader_potential });
  }
  // Potenciais primeiro (sort estável: só reordena pelo flag, mantém o resto).
  return out.sort((a, b) => Number(b.potencial) - Number(a.potencial));
}

export async function contarElegiveisParaConvite(db: SupabaseClient, orgId: string): Promise<number> {
  return (await lerElegiveis(db, orgId)).length;
}

/** Quantos dos elegíveis foram marcados como POTENCIAL multiplicador/líder. */
export async function contarPotenciaisParaConvite(db: SupabaseClient, orgId: string): Promise<number> {
  return (await lerElegiveis(db, orgId)).filter((e) => e.potencial).length;
}

export async function listarElegiveisParaConvite(
  db: SupabaseClient,
  orgId: string,
  limite: number,
): Promise<ContatoElegivel[]> {
  const todos = await lerElegiveis(db, orgId);
  return todos.slice(0, Math.max(limite, 0));
}

export interface AceiteResultado {
  status: "done" | "skipped" | "failed";
  detail: string;
}

/**
 * Processa a resposta de quem foi CONVIDADO. FAIL-SOFT (nunca lança). Só age em
 * quem tem a tag `divulgador_convidado` (um "sim" de quem não foi convidado é
 * no-op). Negativo → recusou; afirmativo → vira multiplicador + confirmação;
 * ambíguo → segue pendente.
 */
export async function processarAceiteDivulgador(
  admin: SupabaseClient,
  entrada: { organizationId: string; contactId: string; texto: string | null; canalId: string | null },
): Promise<AceiteResultado> {
  const { organizationId, contactId, texto, canalId } = entrada;
  try {
    const { data: ct } = await admin
      .from("contacts")
      .select("id, name, tags")
      .eq("organization_id", organizationId)
      .eq("id", contactId)
      .maybeSingle();
    const c = ct as { id: string; name: string | null; tags: string[] | null } | null;
    if (!c) return { status: "skipped", detail: "contato não encontrado" };

    const tags = ((c.tags ?? []) as string[]).filter((t) => typeof t === "string");
    if (!tags.includes(TAG_DIVULGADOR_CONVIDADO)) {
      return { status: "skipped", detail: "não convidado" };
    }
    const t = (texto ?? "").trim();
    if (!t) return { status: "skipped", detail: "sem texto" };

    // Negativo vence o afirmativo ("não quero" tem "quero" dentro).
    if (ehNegativo(t)) {
      const novas = tags.filter((x) => x !== TAG_DIVULGADOR_CONVIDADO);
      if (!novas.includes(TAG_DIVULGADOR_RECUSOU)) novas.push(TAG_DIVULGADOR_RECUSOU);
      await admin.from("contacts").update({ tags: novas }).eq("id", contactId).eq("organization_id", organizationId);
      return { status: "done", detail: "recusou" };
    }

    if (ehAfirmativo(t)) {
      const novas = tags.filter((x) => x !== TAG_DIVULGADOR_CONVIDADO && x !== TAG_DIVULGADOR_RECUSOU);
      if (!novas.includes(TAG_MULTIPLICADOR)) novas.push(TAG_MULTIPLICADOR);
      if (!novas.includes(TAG_DIVULGADOR)) novas.push(TAG_DIVULGADOR);
      await admin.from("contacts").update({ tags: novas }).eq("id", contactId).eq("organization_id", organizationId);

      // Confirmação (proativa, best-effort — não derruba o aceite).
      if (canalId) {
        try {
          const boundary = await beginServiceAtOrigin(admin, organizationId, contactId, canalId);
          const primeiroNome = (c.name ?? "").trim().split(/\s+/)[0] ?? "";
          const ola = primeiroNome ? `Que massa, ${primeiroNome}!` : "Que massa!";
          await sendMessageHandler(
            admin,
            {
              organization_id: organizationId,
              serviceBoundary: boundary,
              proactiveContext: { organizationId, contactId },
              actor: { type: "webhook_source", id: `divulgador-aceite:${contactId}` },
              requestId: `divulgador-aceite:${randomUUID()}`,
            } as Parameters<typeof sendMessageHandler>[1],
            {
              conversation_id: boundary.conversation_id,
              type: "text",
              body:
                `${ola} 🎉 Agora você é um divulgador do nosso mandato. ` +
                `Quando sair conteúdo novo, te mando o SEU link exclusivo pra compartilhar. ` +
                `Obrigado por multiplicar! 🙏`,
            } as Parameters<typeof sendMessageHandler>[2],
          );
        } catch {
          // confirmação é best-effort; o aceite já valeu.
        }
      }
      return { status: "done", detail: "aceitou" };
    }

    return { status: "skipped", detail: "resposta ambígua, segue pendente" };
  } catch (err) {
    return { status: "failed", detail: err instanceof Error ? err.message.slice(0, 120) : "erro" };
  }
}
