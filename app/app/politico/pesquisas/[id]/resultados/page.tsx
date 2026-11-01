/**
 * /app/politico/pesquisas/[id]/resultados — RESULTADOS da Pesquisa Relâmpago.
 *
 * Lê as perguntas + respostas (pol_survey_responses.answers jsonb, com chave =
 * id da pergunta) e agrega por tipo: escala (média + distribuição), sim/não (%),
 * múltipla escolha (% por opção) e texto (lista — a voz do eleitor). Mais as
 * respostas individuais (cidade/UF, quando) em blocos expansíveis. Server-only,
 * manager+.
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, resolveActiveOrg, exigirPapelNaOrg } from "@/lib/auth/server";
import { CommandHero } from "@/components/politico/command-hero";
import { temaPesquisaDe } from "../../_temas";

export const dynamic = "force-dynamic";

type Tipo = "text" | "choice" | "scale" | "boolean" | "number" | "date" | "multi_choice";
interface Pergunta { id: string; question: string; response_type: Tipo; options: string[]; theme: string | null; order: number; }
interface Resposta { id: string; answers: Record<string, unknown>; completed: boolean; city: string | null; state: string | null; created_at: string; contactId: string | null; }

function opcoes(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((o) => String(o));
  return [];
}

export default async function ResultadosPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app/onboarding");
  exigirPapelNaOrg(user, org, "manager");

  const { id } = await params;
  const db = await createClient();

  const { data: survey } = await db
    .from("pol_surveys")
    .select("id, title, description, theme, status")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!survey) notFound();
  const s = survey as { id: string; title: string; description: string | null; theme: string | null; status: string };

  const [{ data: qData }, { data: rData }] = await Promise.all([
    db.from("pol_survey_questions").select('id, question, response_type, options, theme, "order"').eq("survey_id", id).eq("organization_id", org.orgId).order("order", { ascending: true }),
    db.from("pol_survey_responses").select("id, answers, completed, city, state, created_at, contact_id").eq("survey_id", id).eq("organization_id", org.orgId).order("created_at", { ascending: false }).limit(5000),
  ]);

  const perguntas: Pergunta[] = ((qData ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    question: String(r.question ?? ""),
    response_type: (r.response_type as Tipo) ?? "text",
    options: opcoes(r.options),
    theme: (r.theme as string | null) ?? null,
    order: Number(r.order ?? 0),
  }));
  const respostas: Resposta[] = ((rData ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    answers: (r.answers && typeof r.answers === "object" ? r.answers : {}) as Record<string, unknown>,
    completed: Boolean(r.completed),
    city: (r.city as string | null) ?? null,
    state: (r.state as string | null) ?? null,
    created_at: String(r.created_at ?? ""),
    contactId: (r.contact_id as string | null) ?? null,
  }));

  // "Respondidas" = quem de fato respondeu (tem resposta ou foi concluída). Um
  // DISPARO de pesquisa pré-cria uma linha vazia por destinatário (reserva do
  // link), e essas reservas NÃO são respostas — contá-las inflava o número
  // (ex.: "501 respostas" quando só 1 pessoa respondeu). A tela conta só estas.
  const respondidas = respostas.filter((r) => r.completed || (r.answers && Object.keys(r.answers).length > 0));
  const enviadas = respostas.length; // inclui as reservas de disparo ainda não respondidas
  const aguardando = enviadas - respondidas.length; // enviados que ainda não responderam

  // Identidade de quem respondeu (a pesquisa captura nome/WhatsApp/bairro no contato).
  const contactIds = [...new Set(respondidas.map((r) => r.contactId).filter((x): x is string => !!x))];
  const contatoPorId = new Map<string, { nome: string | null; telefone: string | null; bairro: string | null }>();
  if (contactIds.length) {
    const { data: cs } = await db.from("contacts").select("id, name, phone_number, custom_fields").in("id", contactIds).eq("organization_id", org.orgId);
    for (const c of (cs ?? []) as { id: string; name: string | null; phone_number: string | null; custom_fields: Record<string, unknown> | null }[]) {
      contatoPorId.set(c.id, { nome: c.name, telefone: c.phone_number, bairro: ((c.custom_fields?.bairro as string | null) ?? null) });
    }
  }

  const total = respondidas.length;
  const completas = respondidas.filter((r) => r.completed).length;
  const taxaResposta = enviadas > 0 ? Math.round((total / enviadas) * 100) : 0;
  const temaS = temaPesquisaDe(s.theme);
  const temIntencao = s.theme === "intencao_voto" || perguntas.some((p) => p.theme === "intencao_voto");

  // Top cidades
  const cidadeMap = new Map<string, number>();
  for (const r of respondidas) { const c = (r.city ?? "").trim(); if (c) cidadeMap.set(c, (cidadeMap.get(c) ?? 0) + 1); }
  const topCidades = [...cidadeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const fmtData = (iso: string) => { try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  return (
    <div className="mx-auto max-w-[940px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Inteligência · Pesquisa"
        titulo={s.title}
        subtitulo={`${temaS.l} · ${total} resposta${total !== 1 ? "s" : ""}${completas !== total ? ` (${completas} completa${completas !== 1 ? "s" : ""})` : ""}`}
        acoes={[{ href: "/app/politico/pesquisas", label: "← Pesquisas" }, { href: `/app/politico/pesquisas/${id}/editar`, label: "Editar perguntas" }]}
      />

      {temIntencao && (
        <div className="gip-glass flex items-start gap-2 p-3.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          <span style={{ color: "var(--color-error-fg)" }}>▍</span>
          <span><strong style={{ color: "var(--color-text)" }}>Intenção de voto — uso interno.</strong> Estes números servem para sentir a base. Para <strong style={{ color: "var(--color-text)" }}>divulgar publicamente</strong>, a pesquisa precisa de registro no TSE (metodologia).</span>
        </div>
      )}

      {/* KPIs — tiles de vidro espelhados */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi rotulo="Respostas" valor={String(total)} destaque />
        <Kpi rotulo="Completas" valor={String(completas)} />
        <Kpi rotulo="Perguntas" valor={String(perguntas.length)} />
        <Kpi rotulo="Cidades" valor={String(cidadeMap.size)} />
      </div>

      {aguardando > 0 && (
        <p className="-mt-2 px-1 text-[12px]" style={{ color: "var(--color-text-subtle)" }}>
          Disparo: <strong style={{ color: "var(--color-text-muted)" }}>{enviadas}</strong> enviada{enviadas !== 1 ? "s" : ""} · <strong style={{ color: "var(--color-text)" }}>{total}</strong> respondida{total !== 1 ? "s" : ""} <span style={{ color: "var(--color-accent)" }}>({taxaResposta}%)</span> · {aguardando} aguardando resposta
        </p>
      )}

      {total === 0 ? (
        <div className="gip-glass p-10 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
          {enviadas > 0
            ? `Você já enviou para ${enviadas} ${enviadas !== 1 ? "pessoas" : "pessoa"}, mas ninguém respondeu ainda. As respostas aparecem aqui em tempo real assim que chegarem.`
            : "Ainda não há respostas. Compartilhe o link público (ou dispare pela aba Disparar) e os resultados aparecem aqui em tempo real."}
        </div>
      ) : (
        <>
          {/* Agregado por pergunta */}
          <div className="space-y-4">
            {perguntas.map((p, i) => {
              const tema = temaPesquisaDe(p.theme);
              const valores = respondidas.map((r) => r.answers[p.id]).filter((v) => v != null && v !== "");
              return (
                <div key={p.id} className="gip-glass gip-glass-hover p-5 sm:p-6">
                  <div className="mb-4 flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ borderRadius: 12, background: `color-mix(in srgb, ${tema.cor} 18%, transparent)`, color: tema.cor, border: `1px solid color-mix(in srgb, ${tema.cor} 30%, transparent)` }}>
                      <tema.Icon size={17} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold leading-snug" style={{ color: "var(--color-text)" }}>{p.question}</p>
                      <p className="mt-0.5 text-[11px] uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Pergunta {i + 1} · {valores.length} resposta{valores.length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <AgregadoPergunta pergunta={p} valores={valores} />
                </div>
              );
            })}
          </div>

          {/* Território + individuais — par espelhado */}
          <div className="grid gap-4 lg:grid-cols-2">
            {topCidades.length > 0 && (
              <div className="gip-glass gip-glass-hover p-5 sm:p-6">
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-text-subtle)" }}>De onde falam</p>
                <div className="space-y-3.5">
                  {topCidades.map(([cidade, n]) => (
                    <Barra key={cidade} rotulo={cidade} n={n} total={total} cor={temaS.cor} />
                  ))}
                </div>
              </div>
            )}

            <div className="gip-glass gip-glass-hover p-5 sm:p-6">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-text-subtle)" }}>Respostas individuais</p>
              <div className="space-y-2">
                {respondidas.slice(0, 200).map((r, idx) => {
                  const respondidas = perguntas.filter((p) => r.answers[p.id] != null && r.answers[p.id] !== "").length;
                  const c = r.contactId ? contatoPorId.get(r.contactId) : null;
                  const local = [c?.bairro, r.city, r.state].filter(Boolean).join(" · ") || "Local não informado";
                  return (
                    <details key={r.id} className="group rounded-2xl" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)" }}>
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[13px]" style={{ color: "var(--color-text)" }}>
                        <span className="min-w-0 truncate font-medium">{c?.nome || `Resposta #${total - idx}`}{c?.telefone ? <span className="font-normal" style={{ color: "var(--color-text-subtle)" }}> · {c.telefone}</span> : null}</span>
                        <span className="shrink-0 tabular-nums text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{respondidas}/{perguntas.length} · {fmtData(r.created_at)}</span>
                      </summary>
                      <div className="space-y-2.5 px-4 pb-3.5 pt-1" style={{ borderTop: "1px solid color-mix(in srgb, var(--color-text) 7%, transparent)" }}>
                        <p className="pt-2 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>📍 {local}</p>
                        {perguntas.map((p) => (
                          <div key={p.id}>
                            <p className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{p.question}</p>
                            <p className="text-[13.5px] font-semibold leading-snug" style={{ color: "var(--color-text)" }}>{formatarValor(r.answers[p.id], p.response_type)}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatarValor(v: unknown, tipo: Tipo): string {
  if (v == null || v === "") return "—";
  if (tipo === "boolean") return v === true ? "Sim" : v === false ? "Não" : String(v);
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ") || "—";
  return String(v);
}

function Kpi({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="gip-glass p-4 text-center">
      <p className="text-[28px] font-bold leading-none tabular-nums" style={{ color: destaque ? "var(--color-accent)" : "var(--color-text)" }}>{valor}</p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--color-text-subtle)" }}>{rotulo}</p>
    </div>
  );
}

function Barra({ rotulo, n, total, cor }: { rotulo: string; n: number; total: number; cor: string }) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12px]">
        <span className="truncate pr-2" style={{ color: "var(--color-text)" }}>{rotulo}</span>
        <span className="shrink-0 tabular-nums" style={{ color: "var(--color-text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--color-text)" }}>{pct}%</span> <span style={{ color: "var(--color-text-subtle)" }}>· {n}</span>
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "color-mix(in srgb, var(--color-text) 8%, transparent)", overflow: "hidden" }}>
        <div style={{ height: 8, borderRadius: 999, width: `${pct}%`, minWidth: n > 0 ? 6 : 0, background: `linear-gradient(90deg, color-mix(in srgb, ${cor} 55%, transparent), ${cor})`, boxShadow: `0 0 12px color-mix(in srgb, ${cor} 45%, transparent)` }} />
      </div>
    </div>
  );
}

function AgregadoPergunta({ pergunta, valores }: { pergunta: Pergunta; valores: unknown[] }) {
  const cor = temaPesquisaDe(pergunta.theme).cor;

  if (valores.length === 0) {
    return <p className="text-[12px]" style={{ color: "var(--color-text-subtle)" }}>Sem respostas ainda.</p>;
  }

  if (pergunta.response_type === "scale") {
    const nums = valores.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    const media = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    const dist = new Map<number, number>();
    for (const n of nums) dist.set(n, (dist.get(n) ?? 0) + 1);
    const niveis = [1, 2, 3, 4, 5];
    return (
      <div>
        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums" style={{ color: cor }}>{media.toFixed(1)}</span>
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>média (de 1 a 5)</span>
        </div>
        <div className="space-y-1.5">
          {niveis.map((nivel) => (
            <Barra key={nivel} rotulo={`Nota ${nivel}`} n={dist.get(nivel) ?? 0} total={nums.length} cor={cor} />
          ))}
        </div>
      </div>
    );
  }

  if (pergunta.response_type === "boolean") {
    const sim = valores.filter((v) => v === true).length;
    const nao = valores.filter((v) => v === false).length;
    return (
      <div className="space-y-1.5">
        <Barra rotulo="Sim" n={sim} total={valores.length} cor="#4FA86A" />
        <Barra rotulo="Não" n={nao} total={valores.length} cor="#D7574F" />
      </div>
    );
  }

  if (pergunta.response_type === "multi_choice" || pergunta.response_type === "choice") {
    const tally = new Map<string, number>();
    for (const v of valores) {
      const arr = Array.isArray(v) ? v.map((x) => String(x)) : [String(v)];
      for (const o of arr) tally.set(o, (tally.get(o) ?? 0) + 1);
    }
    const linhas = pergunta.options.length
      ? pergunta.options.map((o) => [o, tally.get(o) ?? 0] as [string, number])
      : [...tally.entries()].sort((a, b) => b[1] - a[1]);
    return (
      <div className="space-y-1.5">
        {linhas.map(([op, n]) => <Barra key={op} rotulo={op} n={n} total={valores.length} cor={cor} />)}
      </div>
    );
  }

  // text / number / date → lista a voz do eleitor
  return (
    <div className="space-y-1.5">
      {valores.slice(0, 50).map((v, i) => (
        <p key={i} className="rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
          “{String(v)}”
        </p>
      ))}
      {valores.length > 50 && <p className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>+{valores.length - 50} outras respostas</p>}
    </div>
  );
}
