/**
 * /app/instagram/captacao — Kanban de Captação do Instagram (War Room 2.0)
 *
 * Funil visual de quem interage no Instagram: comentou/mandou DM → qualificado
 * por localização (MG/BH) → virou apoiador com WhatsApp (ativo pra 2028).
 *
 * Fonte: `contacts` com `custom_fields.origem_captacao = "instagram"`, agrupados
 * por `custom_fields.captacao_estagio`. Alimentado pela ação `captar_instagram`
 * do motor de automações e pelo handler de resposta de DM.
 *
 * Acesso: manager+
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { lerCaptacaoConfig, rotuloAlvo } from "@/lib/politico/captacao-config";

export const dynamic = "force-dynamic";

// ── Estágios da jornada (ordem = funil) ──────────────────────────────────────

interface EstagioDef {
  slug: string;
  titulo: string;
  descricao: string;
  destaque?: boolean; // Apoiador c/ WhatsApp = o ouro (lime)
  secundario?: boolean; // Fora de alvo = recolhido/apagado
}

const ESTAGIOS: EstagioDef[] = [
  { slug: "interagiu", titulo: "Interagiu", descricao: "Comentou/DM — pesquisa ainda não respondida" },
  { slug: "em_conversa", titulo: "Em conversa", descricao: "Pesquisa enviada, respondendo" },
  { slug: "qualificado_mgbh", titulo: "Qualificado MG/BH", descricao: "Confirmou cidade no alvo" },
  { slug: "apoiador_whatsapp", titulo: "Apoiador c/ WhatsApp", descricao: "Deu o número + opt-in", destaque: true },
  { slug: "fora_de_alvo", titulo: "Fora de alvo", descricao: "Outro estado", secundario: true },
];

// ── Tipos ────────────────────────────────────────────────────────────────────

interface ContatoCaptado {
  id: string;
  name: string | null;
  phone_number: string | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
}

interface Card {
  id: string;
  handle: string;
  cidade: string | null;
  uf: string | null;
  vinculoBh: boolean;
  whatsapp: string | null;
  postId: string | null;
  tags: string[];
  quando: string | null;
}

function toCard(c: ContatoCaptado): Card {
  const cf = c.custom_fields ?? {};
  const str = (k: string) => (typeof cf[k] === "string" ? (cf[k] as string) : null);
  const handle = str("ig_handle") ?? (c.name ?? "").replace(/^@/, "") ?? "—";
  return {
    id: c.id,
    handle: handle || "—",
    cidade: str("cidade"),
    uf: str("uf"),
    vinculoBh: cf["vinculo_bh"] === true || cf["vinculo_bh"] === "sim",
    whatsapp: str("whatsapp") ?? c.phone_number,
    postId: str("post_id"),
    tags: Array.isArray(c.tags) ? c.tags.filter((t) => !["instagram", "captacao"].includes(t)) : [],
    quando: str("captado_em") ?? c.created_at,
  };
}

function dataCurta(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function CardLead({ card, destaque, vinculoLabel }: { card: Card; destaque?: boolean; vinculoLabel: string }) {
  return (
    <div
      className="wr-card-dark p-3 flex flex-col gap-2"
      style={destaque ? { borderColor: "color-mix(in srgb, var(--color-accent) 45%, var(--color-border))" } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm truncate" style={{ color: "var(--color-text)" }}>
          @{card.handle}
        </span>
        <span className="text-[11px] shrink-0" style={{ color: "var(--color-text-subtle)" }}>
          {dataCurta(card.quando)}
        </span>
      </div>

      {(card.cidade || card.uf) && (
        <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          📍 {card.cidade ?? ""}{card.cidade && card.uf ? " · " : ""}{card.uf ?? ""}
        </div>
      )}

      {card.whatsapp && (
        <div
          className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-md px-2 py-1 w-fit"
          style={{ background: "color-mix(in srgb, var(--color-accent) 16%, transparent)", color: "var(--color-accent)" }}
        >
          📱 {card.whatsapp}
        </div>
      )}

      {(card.vinculoBh || card.tags.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {card.vinculoBh && (
            <span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: "color-mix(in srgb, var(--color-accent) 20%, transparent)", color: "var(--color-accent)" }}>
              {vinculoLabel}
            </span>
          )}
          {card.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-[10px] rounded-full px-2 py-0.5" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}>
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 pt-0.5">
        <a
          href={`https://instagram.com/${card.handle}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-medium"
          style={{ color: "var(--color-accent)" }}
        >
          Abrir perfil →
        </a>
      </div>
    </div>
  );
}

function Coluna({ estagio, cards, vinculoLabel }: { estagio: EstagioDef; cards: Card[]; vinculoLabel: string }) {
  return (
    <div
      className="flex-1 min-w-[230px] rounded-[18px] p-3 flex flex-col"
      style={{
        background: estagio.secundario
          ? "color-mix(in srgb, var(--color-surface) 50%, transparent)"
          : "var(--color-surface)",
        border: `1px solid ${estagio.destaque ? "color-mix(in srgb, var(--color-accent) 30%, var(--color-border))" : "var(--color-border)"}`,
        opacity: estagio.secundario ? 0.72 : 1,
      }}
    >
      <div className="flex items-center justify-between mb-0.5">
        <h2 className="font-heading text-[15px] font-bold" style={{ color: estagio.destaque ? "var(--color-accent)" : "var(--color-text)" }}>
          {estagio.titulo}
        </h2>
        <span
          className="text-xs font-bold rounded-full px-2 py-0.5 tabular-nums"
          style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
        >
          {cards.length}
        </span>
      </div>
      <p className="text-[11px] mb-3" style={{ color: "var(--color-text-subtle)" }}>
        {estagio.descricao}
      </p>

      <div className="flex flex-col gap-2 flex-1">
        {cards.length === 0 ? (
          <div className="text-[11px] text-center py-6" style={{ color: "var(--color-text-subtle)" }}>
            vazio
          </div>
        ) : (
          cards.map((card) => <CardLead key={card.id} card={card} destaque={estagio.destaque} vinculoLabel={vinculoLabel} />)
        )}
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default async function CaptacaoInstagramPage() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");

  const ehAdmin = ROLE_RANK[org.role as Role] >= ROLE_RANK.admin;

  const db = await createClient();
  const config = await lerCaptacaoConfig(db, org.orgId);
  const alvoLabel = rotuloAlvo(config);
  // Safeguard: sem alvo configurado, estaNoAlvo() dá falso pra todos → ninguém
  // qualifica (vai tudo pra "Fora de alvo"). Avisa o admin pra configurar.
  const alvoConfigurado =
    config.abrangencia === "estado" ? !!config.estadoAlvo : !!config.cidadeAlvo;
  const vinculoLabel = config.cidadeAlvo ? `vínculo ${config.cidadeAlvo}` : "no alvo";

  // Rótulos dinâmicos por candidato: a coluna de qualificados usa o alvo da org.
  const estagios: EstagioDef[] = ESTAGIOS.map((e) =>
    e.slug === "qualificado_mgbh" ? { ...e, titulo: `Qualificado ${alvoLabel}` } : e,
  );

  const { data } = await db
    .from("contacts")
    .select("id, name, phone_number, tags, custom_fields, created_at")
    .eq("organization_id", org.orgId)
    .contains("custom_fields", { origem_captacao: "instagram" })
    .order("created_at", { ascending: false })
    .limit(1000);

  const contatos = (data as ContatoCaptado[] | null) ?? [];
  const cards = contatos.map(toCard);

  const porEstagio: Record<string, Card[]> = {};
  for (const e of estagios) porEstagio[e.slug] = [];
  for (let i = 0; i < contatos.length; i++) {
    const estagio = (contatos[i].custom_fields?.["captacao_estagio"] as string) ?? "interagiu";
    (porEstagio[estagio] ?? (porEstagio.interagiu ||= [])).push(cards[i]);
  }

  const total = cards.length;
  const comWhatsapp = porEstagio["apoiador_whatsapp"]?.length ?? 0;
  const qualificados = (porEstagio["qualificado_mgbh"]?.length ?? 0) + comWhatsapp;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-7 space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/app/instagram" className="text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
            ← Instagram
          </Link>
          <h1 className="font-heading text-[30px] font-bold leading-tight mt-2" style={{ color: "var(--color-text)" }}>
            Captação do Instagram
          </h1>
          <p className="text-[15px] mt-0.5" style={{ color: "var(--color-text-muted)" }}>
            De quem interage a lead pronto pra 2028 — qualificado por {alvoLabel}, com WhatsApp.
          </p>
          {ehAdmin && (
            <Link
              href="/app/instagram/captacao/config"
              className="inline-flex items-center gap-1.5 text-sm font-semibold mt-2"
              style={{ color: "var(--color-accent)" }}
            >
              ⚙ Personalizar (região-alvo e mensagens)
            </Link>
          )}
        </div>
        <div className="flex gap-3">
          {[
            { label: "Captados", v: total },
            { label: "Qualificados MG/BH", v: qualificados },
            { label: "Com WhatsApp", v: comWhatsapp, destaque: true },
          ].map((k) => (
            <div key={k.label} className="wr-card-dark px-4 py-2.5 text-center">
              <div className="font-heading text-[22px] font-bold tabular-nums" style={{ color: k.destaque ? "var(--color-accent)" : "var(--color-text)" }}>
                {k.v.toLocaleString("pt-BR")}
              </div>
              <div className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{k.label}</div>
            </div>
          ))}
        </div>
      </header>

      {/* Safeguard: alvo não configurado */}
      {!alvoConfigurado && (
        <div
          className="wr-card-dark p-4 flex flex-wrap items-center gap-3"
          style={{ borderColor: "color-mix(in srgb, #F59E0B 45%, var(--color-border))" }}
        >
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold shrink-0" style={{ background: "#F59E0B", color: "#1B1403" }}>!</span>
          <p className="text-sm flex-1 min-w-0" style={{ color: "var(--color-text-muted)" }}>
            <strong style={{ color: "var(--color-text)" }}>Região-alvo não configurada.</strong>{" "}
            Sem o alvo, ninguém qualifica — todo lead cai em "Fora de alvo".
            {ehAdmin ? " Configure a cidade/estado do candidato na Personalização." : " Peça a um administrador para configurar."}
          </p>
          {ehAdmin && (
            <Link href="/app/instagram/captacao/config" className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--color-accent)" }}>
              ⚙ Configurar agora →
            </Link>
          )}
        </div>
      )}

      {/* Board */}
      {total === 0 ? (
        <section className="wr-card-accent p-7 text-center">
          <h2 className="font-heading text-[20px] font-bold" style={{ color: "#F3F4EC" }}>
            Nenhum lead captado ainda
          </h2>
          <p className="text-sm mt-2 max-w-xl mx-auto" style={{ color: "#B9BCC6" }}>
            Quando um flow de captação estiver ativo e o Instagram publicado, cada pessoa que
            comentar entra aqui automaticamente, é qualificada por cidade (MG/BH) e, se der o
            WhatsApp, vira um apoiador reconvocável em 2028.
          </p>
          <Link
            href="/app/instagram/automacoes"
            className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold mt-4"
            style={{ background: "var(--color-accent)", color: "#1B2206" }}
          >
            Configurar automação de captação
          </Link>
        </section>
      ) : (
        <section className="flex gap-3 overflow-x-auto pb-2" style={{ minWidth: 0 }}>
          {estagios.map((e) => (
            <Coluna key={e.slug} estagio={e} cards={porEstagio[e.slug] ?? []} vinculoLabel={vinculoLabel} />
          ))}
        </section>
      )}
    </div>
  );
}
