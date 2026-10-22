/**
 * Worker handler que consome `ig.dm_received` do event_log e cria/atualiza
 * contato + conversa no CRM.
 *
 * ── Fluxo ──────────────────────────────────────────────────────────────────────
 * 1. Webhook (`ig-webhooks/route.ts`) recebe DM do Meta e emite
 *    `ig.dm_received` no event_log
 * 2. ESTE handler consome o evento:
 *    a) Resolve ou cria contato pelo `social_identity` ("instagram:<id>")
 *    b) Resolve ou cria conversa `channel = 'instagram'`
 *    c) Grava a mensagem em `messages`
 *    d) Atualiza `last_inbound_at` e `last_message_preview` na conversa
 *
 * Idempotência via unique (organization_id, external_id) em messages.
 * NUNCA faz HTTP — é escrita pura no banco.
 */

import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { igCredsForChannelSessionId } from "./credentials";
import { buscarPerfilInstagram } from "./fetch-profile";

export const IG_INBOUND_DM_CONSUMER_KEY = "ig.inbound_dm_persister";

export const igInboundDmHandler: EventHandler = {
  key: IG_INBOUND_DM_CONSUMER_KEY,
  events: ["ig.dm_received"],
  // Escrita curta no banco — roda mesmo com org parada
  naOrgParada: "roda",

  async handle(row: EventRow): Promise<HandlerResult> {
    const admin = createAdminClient();
    const { organization_id, payload } = row;

    const senderId = typeof payload.sender_id === "string" ? payload.sender_id : null;
    const messageId = typeof payload.message_id === "string" ? payload.message_id : null;
    const channelSessionId =
      typeof payload.channel_session_id === "string" ? payload.channel_session_id : null;

    if (!senderId || !messageId || !channelSessionId) {
      logger.warn("[ig-inbound-dm] payload incompleto", {
        eventId: row.id,
        hasSenderId: !!senderId,
        hasMessageId: !!messageId,
        hasChannelSessionId: !!channelSessionId,
      });
      return {
        consumer_key: IG_INBOUND_DM_CONSUMER_KEY,
        status: "skipped",
        detail: "payload_incompleto",
      };
    }

    const text = typeof payload.text === "string" ? payload.text : null;

    // ── 1. Resolver ou criar contato ──────────────────────────────────
    // Identidade social no padrão do schema real (contacts não tem instagram_id;
    // usa social_identity = "instagram:<id>", como wa_identity = "phone:+55…").
    const igIdentity = `instagram:${senderId}`;
    let contactId: string;

    const { data: existingContact } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("social_identity", igIdentity)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      // Criar contato com o social_identity (padrão do schema real)
      const { data: newContact, error: contactError } = await admin
        .from("contacts")
        .insert({
          organization_id,
          name: `IG ${senderId}`,
          social_identity: igIdentity,
          source: "ig_dm",
          kind: "person",
          tags: [],
        })
        .select("id")
        .single();

      if (contactError) {
        // Unique violation = race condition, outro handler criou
        if (contactError.code === "23505") {
          const { data: refetch } = await admin
            .from("contacts")
            .select("id")
            .eq("organization_id", organization_id)
            .eq("social_identity", igIdentity)
            .maybeSingle();
          if (!refetch) {
            return {
              consumer_key: IG_INBOUND_DM_CONSUMER_KEY,
              status: "error",
              detail: "contato_race_nao_resolvido",
            };
          }
          contactId = refetch.id;
        } else {
          logger.error("[ig-inbound-dm] contact insert error", {
            eventId: row.id,
            error: contactError,
          });
          return {
            consumer_key: IG_INBOUND_DM_CONSUMER_KEY,
            status: "error",
            detail: `contact_error: ${contactError.message}`,
          };
        }
      } else {
        contactId = newContact.id;

        // Enriquecer perfil do contato com dados do Graph API (best-effort)
        if (channelSessionId) {
          try {
            const creds = await igCredsForChannelSessionId(admin, organization_id, channelSessionId);
            if (creds) {
              const perfil = await buscarPerfilInstagram(creds, senderId);
              if (perfil) {
                // contacts não tem instagram_username/avatar_url: o nome vai em
                // `name` e o @ vai em custom_fields.ig_handle (contato recém-criado,
                // custom_fields = {}, então não precisa ler antes).
                const updates: Record<string, unknown> = {};
                if (perfil.name) updates.name = perfil.name;
                if (perfil.username) updates.custom_fields = { ig_handle: `@${perfil.username}` };
                if (Object.keys(updates).length > 0) {
                  await admin
                    .from("contacts")
                    .update(updates)
                    .eq("id", contactId)
                    .eq("organization_id", organization_id);
                }
              }
            }
          } catch (enrichErr) {
            // Não bloqueia a ingestão — perfil é nice-to-have
            logger.warn("[ig-inbound-dm] profile enrichment failed", {
              contactId,
              error: enrichErr,
            });
          }
        }
      }
    }

    // ── 2. Resolver ou criar conversa ─────────────────────────────────
    let conversationId: string;

    // Buscar conversa Instagram aberta para este contato
    const { data: existingConvo } = await admin
      .from("conversations")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("contact_id", contactId)
      .eq("channel", "instagram")
      .eq("channel_session_id", channelSessionId)
      .in("status", ["open", "pending", "claimed", "ai_handling"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingConvo) {
      conversationId = existingConvo.id;
    } else {
      const { data: newConvo, error: convoError } = await admin
        .from("conversations")
        .insert({
          organization_id,
          contact_id: contactId,
          channel_session_id: channelSessionId,
          channel: "instagram",
          status: "open",
          last_inbound_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          last_message_preview: text?.slice(0, 200) ?? null,
        })
        .select("id")
        .single();

      if (convoError) {
        logger.error("[ig-inbound-dm] conversation insert error", {
          eventId: row.id,
          error: convoError,
        });
        return {
          consumer_key: IG_INBOUND_DM_CONSUMER_KEY,
          status: "error",
          detail: `conversation_error: ${convoError.message}`,
        };
      }
      conversationId = newConvo.id;
    }

    // ── 3. Gravar mensagem ────────────────────────────────────────────
    const now = new Date().toISOString();
    const { error: msgError } = await admin.from("messages").insert({
      organization_id,
      conversation_id: conversationId,
      external_id: messageId,
      direction: "inbound",
      channel: "instagram",
      content: text ?? "",
      status: "received",
      metadata: {
        sender_id: senderId,
        attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
        ig_timestamp: typeof payload.timestamp === "number" ? payload.timestamp : null,
      },
      received_at: now,
    });

    if (msgError) {
      // Idempotência: unique violation = já processada
      if (msgError.code === "23505") {
        return {
          consumer_key: IG_INBOUND_DM_CONSUMER_KEY,
          status: "ok",
          detail: "mensagem_duplicada_ignorada",
        };
      }

      logger.error("[ig-inbound-dm] message insert error", {
        eventId: row.id,
        error: msgError,
      });
      return {
        consumer_key: IG_INBOUND_DM_CONSUMER_KEY,
        status: "error",
        detail: `message_error: ${msgError.message}`,
      };
    }

    // ── 4. Atualizar conversa (timestamps + preview) ────────────────
    // O incremento de unread_count_for_assignee é feito pelo trigger do banco
    // quando aplicável; aqui só atualizamos os campos de denormalização.
    await admin
      .from("conversations")
      .update({
        last_inbound_at: now,
        last_message_at: now,
        last_message_preview: text?.slice(0, 200) ?? null,
      })
      .eq("id", conversationId)
      .eq("organization_id", organization_id)
      .then(() => {});

    return {
      consumer_key: IG_INBOUND_DM_CONSUMER_KEY,
      status: "ok",
      detail: `dm_persisted: ${messageId}`,
    };
  },
};
