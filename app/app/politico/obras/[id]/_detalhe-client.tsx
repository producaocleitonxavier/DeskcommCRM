"use client";

/**
 * Detalhe de uma obra/contrato: pipeline de status, dados editáveis, vistorias
 * (com checklist e parecer), fotos (evidências com geo) e o vínculo territorial
 * (regional, via intel). Núcleo operacional do módulo Obras & Fiscalização.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Plus, Trash2, MapPin, Camera, X, HardHat, ShieldCheck, ClipboardCheck, Pencil } from "lucide-react";

import { atualizarRegistro, excluirRegistro } from "@/app/actions/politico/gabinete-actions";
import { registrarVistoria, listarVistorias, uploadFotoObra, listarFotosObra, removerFotoObra, type VistoriaObra, type FotoObra, type ChecklistItem, type PesoBairro } from "@/app/actions/politico/obras-actions";
import { STATUS, TIPO } from "../_obras-client";

type Obra = Record<string, unknown> & { id: string; titulo: string; natureza: "execucao" | "fiscalizacao"; tipo: string; status: string; percentual: number; valor_cents: number };
export interface ObraDetalheData {
  obra: Obra;
  emendaRotulo: string | null;
  regional: string | null;
  peso: PesoBairro | null;
  mandatoNome: string | null;
  temBairro: boolean;
  vistorias: VistoriaObra[];
  fotos: FotoObra[];
  emendas: { id: string; numero: string | null; ano: number; descricao: string }[];
}

const AVANCA: Record<string, { para: string; label: string }[]> = {
  planejada: [{ para: "em_andamento", label: "Iniciar execução" }, { para: "cancelada", label: "Cancelar" }],
  em_andamento: [{ para: "concluida", label: "Concluir" }, { para: "paralisada", label: "Paralisar" }],
  paralisada: [{ para: "em_andamento", label: "Retomar" }, { para: "cancelada", label: "Cancelar" }],
  concluida: [{ para: "em_andamento", label: "Reabrir" }],
  cancelada: [{ para: "planejada", label: "Reativar" }],
};
const SIT_VISTORIA = [["conforme", "Conforme"], ["em_andamento", "Em andamento"], ["irregular", "Irregular"], ["paralisada", "Paralisada"], ["concluida", "Concluída"]] as const;
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function ObraDetalhe({ data }: { data: ObraDetalheData }) {
  const router = useRouter();
  const [obra, setObra] = useState<Obra>(data.obra);
  const [vistorias, setVistorias] = useState<VistoriaObra[]>(data.vistorias);
  const [fotos, setFotos] = useState<FotoObra[]>(data.fotos);
  const [salvando, setSalvando] = useState(false);
  const st = STATUS[obra.status] ?? STATUS.planejada;

  async function mudarStatus(para: string) {
    setSalvando(true);
    const patch: Record<string, unknown> = { status: para };
    if (para === "concluida") { patch.data_conclusao = new Date().toISOString().slice(0, 10); patch.percentual = 100; }
    const r = await atualizarRegistro("pol_obras", obra.id, patch);
    if (r.ok) setObra((o) => ({ ...o, ...patch }));
    setSalvando(false);
  }

  async function excluir() {
    if (!confirm("Excluir esta obra e todas as vistorias/fotos? Não dá para desfazer.")) return;
    const r = await excluirRegistro("pol_obras", obra.id);
    if (r.ok) router.push("/app/politico/obras");
    else alert(r.ok ? "" : r.erro);
  }

  const str = (k: string) => (obra[k] as string | null) ?? "";

  return (
    <div className="mx-auto max-w-[920px] space-y-5 px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <Link href="/app/politico/obras" className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--color-text-muted)" }}>
        <ArrowLeft className="h-4 w-4" aria-hidden /> Obras & Fiscalização
      </Link>

      {/* Cabeçalho */}
      <section className="wr-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: obra.natureza === "execucao" ? "#7da9bf" : "#D7F36A" }}>
              {obra.natureza === "execucao" ? <HardHat className="h-3.5 w-3.5" aria-hidden /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
              {obra.natureza === "execucao" ? "Execução" : "Fiscalização"} · {TIPO[obra.tipo] ?? obra.tipo}
            </div>
            <h1 className="mt-1 font-heading text-xl font-bold" style={{ color: "var(--color-text)" }}>{obra.titulo}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
              {(str("bairro") || str("municipio")) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{[str("bairro"), str("municipio")].filter(Boolean).join(" · ")}</span>}
              {data.regional && <span className="rounded-full px-2 py-0.5" style={{ background: "rgba(215,243,106,0.14)", color: "#D7F36A" }}>Regional {data.regional}</span>}
              {obra.valor_cents > 0 && <span>{brl(obra.valor_cents)}</span>}
            </div>
            {data.emendaRotulo && <div className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>Recurso: {data.emendaRotulo}</div>}
          </div>
          <span className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: st.bg, color: st.color }}>{st.label}</span>
        </div>
        {/* Pipeline */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden style={{ color: "var(--color-text-subtle)" }} />}
          {(AVANCA[obra.status] ?? []).map((a) => (
            <button key={a.para} type="button" onClick={() => mudarStatus(a.para)} disabled={salvando}
              className="rounded-full px-3.5 py-1.5 text-xs font-semibold disabled:opacity-50"
              style={a.para === "concluida" ? { background: "#17784F", color: "#fff" } : a.para === "cancelada" ? { border: "1px solid rgba(224,128,121,0.5)", color: "#E08079" } : { background: "#D7F36A", color: "#16181D" }}>
              {a.label}
            </button>
          ))}
          <button type="button" onClick={excluir} className="ml-auto inline-flex items-center gap-1 text-xs" style={{ color: "#A3302A" }}><Trash2 className="h-3.5 w-3.5" aria-hidden /> Excluir</button>
        </div>
      </section>

      {/* Peso eleitoral do território — "você investiu onde te elegeu?" */}
      {data.peso && (data.peso.meusVotos > 0 || data.peso.leads > 0) && (
        <section className="wr-card p-5" style={{ background: "linear-gradient(180deg, rgba(215,243,106,0.06), transparent)" }}>
          <div className="mb-2 flex items-center gap-2">
            <MapPin className="h-4 w-4" aria-hidden style={{ color: "#D7F36A" }} />
            <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Peso eleitoral do território</h2>
          </div>
          <p className="mb-3 text-xs" style={{ color: "var(--color-text-subtle)" }}>
            O que {data.mandatoNome || "você"} fez e tem no bairro <strong style={{ color: "var(--color-text)" }}>{(obra.bairro as string) || "—"}</strong> — para saber se o recurso vai (ou foi) para onde há retorno.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Peso valor={data.peso.meusVotos.toLocaleString("pt-BR")} label="Seus votos aqui" sub={data.peso.universo > 0 ? `${((data.peso.meusVotos / data.peso.universo) * 100).toFixed(1)}% do bairro` : "no último pleito"} accent="#D7F36A" />
            <Peso valor={data.peso.universo.toLocaleString("pt-BR")} label="Votos do cargo" sub="tamanho eleitoral" />
            <Peso valor={data.peso.leads.toLocaleString("pt-BR")} label="Sua base (CRM)" sub="contatos no bairro" accent="#7da9bf" />
          </div>
        </section>
      )}
      {!data.mandatoNome && data.temBairro && (
        <Link href="/app/politico/obras?mandato=1" className="block rounded-xl p-3.5 text-[13px]" style={{ background: "rgba(215,243,106,0.06)", border: "1px dashed rgba(215,243,106,0.4)", color: "var(--color-text-muted)" }}>
          💡 <strong style={{ color: "var(--color-text)" }}>Vincule seu mandato no TSE</strong> (na lista de Obras) para ver, em cada obra, os votos que você fez naquele bairro — o ROI eleitoral do recurso.
        </Link>
      )}

      <DadosCard obra={obra} emendas={data.emendas} onSalvar={(patch) => setObra((o) => ({ ...o, ...patch }))} />

      <VistoriasCard obraId={obra.id} vistorias={vistorias} onMudou={async () => setVistorias(await listarVistorias(obra.id))} onPercentual={(p) => setObra((o) => ({ ...o, percentual: p }))} />

      <FotosCard obraId={obra.id} fotos={fotos} onMudou={async () => setFotos(await listarFotosObra(obra.id))} />
    </div>
  );
}

// ─── Dados editáveis ───────────────────────────────────────────────────────
function DadosCard({ obra, emendas, onSalvar }: { obra: Obra; emendas: ObraDetalheData["emendas"]; onSalvar: (p: Record<string, unknown>) => void }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState<Record<string, string>>({
    objeto: (obra.objeto as string) ?? "", orgao_responsavel: (obra.orgao_responsavel as string) ?? "", empresa_nome: (obra.empresa_nome as string) ?? "",
    empresa_cnpj: (obra.empresa_cnpj as string) ?? "", numero_referencia: (obra.numero_referencia as string) ?? "", valor: obra.valor_cents ? String(obra.valor_cents / 100) : "",
    fonte_recurso: (obra.fonte_recurso as string) ?? "", emenda_id: (obra.emenda_id as string) ?? "", data_prevista: (obra.data_prevista as string) ?? "",
    responsavel_interno: (obra.responsavel_interno as string) ?? "", observacoes: (obra.observacoes as string) ?? "",
  });
  const [salv, setSalv] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function salvar() {
    setSalv(true);
    const patch: Record<string, unknown> = {
      objeto: f.objeto || null, orgao_responsavel: f.orgao_responsavel || null, empresa_nome: f.empresa_nome || null, empresa_cnpj: f.empresa_cnpj || null,
      numero_referencia: f.numero_referencia || null, valor_cents: Math.round((Number(f.valor.replace(/\./g, "").replace(",", ".")) || 0) * 100),
      fonte_recurso: f.fonte_recurso || null, emenda_id: f.emenda_id || null, data_prevista: f.data_prevista || null,
      responsavel_interno: f.responsavel_interno || null, observacoes: f.observacoes || null, updated_at: new Date().toISOString(),
    };
    const r = await atualizarRegistro("pol_obras", obra.id, patch);
    if (r.ok) { onSalvar(patch); setEditando(false); }
    setSalv(false);
  }

  const Info = ({ l, v }: { l: string; v: string }) => v ? <div><div className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{l}</div><div className="text-sm" style={{ color: "var(--color-text)" }}>{v}</div></div> : null;

  return (
    <section className="wr-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Dados</h2>
        {!editando && <button type="button" onClick={() => setEditando(true)} className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--color-text-muted)" }}><Pencil className="h-3.5 w-3.5" aria-hidden /> Editar</button>}
      </div>
      {!editando ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Info l="Objeto" v={(obra.objeto as string) ?? ""} />
          <Info l="Órgão responsável" v={(obra.orgao_responsavel as string) ?? ""} />
          <Info l="Empresa" v={(obra.empresa_nome as string) ?? ""} />
          <Info l="CNPJ" v={(obra.empresa_cnpj as string) ?? ""} />
          <Info l="Nº contrato/convênio" v={(obra.numero_referencia as string) ?? ""} />
          <Info l="Fonte do recurso" v={(obra.fonte_recurso as string) ?? ""} />
          <Info l="Previsão de entrega" v={(obra.data_prevista as string) ?? ""} />
          <Info l="Responsável" v={(obra.responsavel_interno as string) ?? ""} />
          <Info l="Observações" v={(obra.observacoes as string) ?? ""} />
        </div>
      ) : (
        <div className="space-y-3">
          <L l="Objeto"><textarea className="wr-input w-full" rows={2} value={f.objeto} onChange={set("objeto")} /></L>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <L l="Órgão responsável"><input className="wr-input w-full" value={f.orgao_responsavel} onChange={set("orgao_responsavel")} /></L>
            <L l="Nº contrato/convênio"><input className="wr-input w-full" value={f.numero_referencia} onChange={set("numero_referencia")} /></L>
            <L l="Empresa"><input className="wr-input w-full" value={f.empresa_nome} onChange={set("empresa_nome")} /></L>
            <L l="CNPJ"><input className="wr-input w-full" value={f.empresa_cnpj} onChange={set("empresa_cnpj")} /></L>
            <L l="Valor (R$)"><input className="wr-input w-full" value={f.valor} onChange={set("valor")} inputMode="decimal" /></L>
            <L l="Fonte do recurso"><input className="wr-input w-full" value={f.fonte_recurso} onChange={set("fonte_recurso")} /></L>
            <L l="Previsão de entrega"><input type="date" className="wr-input w-full" value={f.data_prevista} onChange={set("data_prevista")} /></L>
            <L l="Responsável"><input className="wr-input w-full" value={f.responsavel_interno} onChange={set("responsavel_interno")} /></L>
          </div>
          <L l="Vincular emenda"><select className="wr-input w-full" value={f.emenda_id} onChange={set("emenda_id")}><option value="">— nenhuma —</option>{emendas.map((e) => <option key={e.id} value={e.id}>{e.numero ? `${e.numero}/${e.ano}` : `Emenda ${e.ano}`} — {e.descricao.slice(0, 40)}</option>)}</select></L>
          <L l="Observações"><textarea className="wr-input w-full" rows={2} value={f.observacoes} onChange={set("observacoes")} /></L>
          <div className="flex gap-2">
            <button type="button" onClick={salvar} disabled={salv} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ background: "#D7F36A", color: "#16181D" }}>{salv ? "Salvando…" : "Salvar"}</button>
            <button type="button" onClick={() => setEditando(false)} className="rounded-full px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Vistorias ─────────────────────────────────────────────────────────────
function VistoriasCard({ obraId, vistorias, onMudou, onPercentual }: { obraId: string; vistorias: VistoriaObra[]; onMudou: () => void; onPercentual: (p: number) => void }) {
  const [aberto, setAberto] = useState(false);
  const [situacao, setSituacao] = useState("em_andamento");
  const [percentual, setPercentual] = useState("");
  const [parecer, setParecer] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [salv, setSalv] = useState(false);

  async function salvar() {
    setSalv(true);
    const pct = percentual ? Math.max(0, Math.min(100, Number(percentual))) : null;
    const r = await registrarVistoria(obraId, { situacao, percentual: pct, parecer: parecer || undefined, responsavel: responsavel || undefined, checklist });
    if (r.ok) { if (typeof pct === "number") onPercentual(pct); setAberto(false); setParecer(""); setPercentual(""); setChecklist([]); await onMudou(); }
    setSalv(false);
  }

  return (
    <section className="wr-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold" style={{ color: "var(--color-text)" }}><ClipboardCheck className="h-4 w-4" aria-hidden style={{ color: "#D7F36A" }} /> Vistorias</h2>
        {!aberto && <button type="button" onClick={() => setAberto(true)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: "#D7F36A", color: "#16181D" }}><Plus className="h-3.5 w-3.5" aria-hidden /> Registrar vistoria</button>}
      </div>

      {aberto && (
        <div className="mb-4 space-y-3 rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--color-border)" }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <L l="Situação encontrada"><select className="wr-input w-full" value={situacao} onChange={(e) => setSituacao(e.target.value)}>{SIT_VISTORIA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></L>
            <L l="% de execução"><input className="wr-input w-full" value={percentual} onChange={(e) => setPercentual(e.target.value)} inputMode="numeric" placeholder="0–100" /></L>
            <L l="Responsável pela vistoria"><input className="wr-input w-full" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} /></L>
          </div>
          {/* Checklist */}
          <div>
            <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>Checklist</span>
              <button type="button" onClick={() => setChecklist((c) => [...c, { item: "", status: "ok" }])} className="text-xs" style={{ color: "#5C7F23" }}>+ item</button></div>
            <div className="space-y-1.5">
              {checklist.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="wr-input flex-1" placeholder="Ex.: Cobertura concluída" value={it.item} onChange={(e) => setChecklist((c) => c.map((x, k) => k === i ? { ...x, item: e.target.value } : x))} />
                  <select className="wr-input w-24" value={it.status} onChange={(e) => setChecklist((c) => c.map((x, k) => k === i ? { ...x, status: e.target.value as ChecklistItem["status"] } : x))}>
                    <option value="ok">OK</option><option value="nao">Não</option><option value="na">N/A</option>
                  </select>
                  <button type="button" onClick={() => setChecklist((c) => c.filter((_, k) => k !== i))} aria-label="remover"><X className="h-4 w-4" style={{ color: "var(--color-text-subtle)" }} /></button>
                </div>
              ))}
              {checklist.length === 0 && <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Opcional — adicione itens verificados em campo.</p>}
            </div>
          </div>
          <L l="Parecer"><textarea className="wr-input w-full" rows={2} value={parecer} onChange={(e) => setParecer(e.target.value)} placeholder="O que encontrou, providências, prazos." /></L>
          <div className="flex gap-2">
            <button type="button" onClick={salvar} disabled={salv} className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ background: "#D7F36A", color: "#16181D" }}>{salv ? "Salvando…" : "Salvar vistoria"}</button>
            <button type="button" onClick={() => setAberto(false)} className="rounded-full px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>Cancelar</button>
          </div>
        </div>
      )}

      {vistorias.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Nenhuma vistoria ainda. Registre o que foi verificado em campo.</p>
      ) : (
        <div className="space-y-2">
          {vistorias.map((v) => {
            const sv = SIT_VISTORIA.find(([k]) => k === v.situacao);
            return (
              <div key={v.id} className="rounded-lg p-3" style={{ border: "1px solid var(--color-border)" }}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold" style={{ color: "var(--color-text)" }}>{new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                  <span className="flex items-center gap-2 text-xs">{v.percentual != null && <span className="tabular-nums" style={{ color: "var(--color-text-muted)" }}>{v.percentual}%</span>}<span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: v.situacao === "irregular" ? "#E08079" : "var(--color-text-muted)" }}>{sv?.[1] ?? v.situacao}</span></span>
                </div>
                {v.parecer && <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>{v.parecer}</p>}
                {v.checklist.length > 0 && (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {v.checklist.map((it, i) => <li key={i} className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: it.status === "ok" ? "rgba(23,120,79,0.16)" : it.status === "nao" ? "rgba(163,48,42,0.16)" : "rgba(255,255,255,0.06)", color: it.status === "ok" ? "#58C08A" : it.status === "nao" ? "#E08079" : "var(--color-text-subtle)" }}>{it.item || "item"}: {it.status === "ok" ? "OK" : it.status === "nao" ? "não" : "N/A"}</li>)}
                  </ul>
                )}
                {v.responsavel && <div className="mt-1 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>por {v.responsavel}</div>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Fotos ─────────────────────────────────────────────────────────────────
function FotosCard({ obraId, fotos, onMudou }: { obraId: string; fotos: FotoObra[]; onMudou: () => void }) {
  const [enviando, setEnviando] = useState(false);
  const [legenda, setLegenda] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);

  async function enviar(file: File) {
    setEnviando(true);
    const fd = new FormData();
    fd.set("obraId", obraId); fd.set("file", file); if (legenda) fd.set("legenda", legenda);
    if (geo) { fd.set("latitude", String(geo.lat)); fd.set("longitude", String(geo.lng)); }
    const r = await uploadFotoObra(fd);
    if (r.ok) { setLegenda(""); setGeo(null); await onMudou(); } else alert(r.ok ? "" : r.erro);
    setEnviando(false);
  }

  return (
    <section className="wr-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-heading text-base font-bold" style={{ color: "var(--color-text)" }}><Camera className="h-4 w-4" aria-hidden style={{ color: "#D7F36A" }} /> Fotos & evidências</h2>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="wr-input flex-1" placeholder="Legenda (opcional)" value={legenda} onChange={(e) => setLegenda(e.target.value)} style={{ minWidth: 180 }} />
        <button type="button" onClick={() => navigator.geolocation?.getCurrentPosition((p) => setGeo({ lat: p.coords.latitude, lng: p.coords.longitude }))}
          className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold" style={geo ? { background: "rgba(215,243,106,0.16)", color: "#D7F36A" } : { border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
          <MapPin className="h-3.5 w-3.5" aria-hidden /> {geo ? "Local marcado" : "Marcar local"}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold" style={{ background: "#D7F36A", color: "#16181D" }}>
          {enviando ? <><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Enviando…</> : <><Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar</>}
          <input type="file" accept="image/*,application/pdf" className="hidden" disabled={enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ""; }} />
        </label>
      </div>
      {fotos.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>Nenhuma foto ainda. As evidências de campo entram aqui.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {fotos.map((f) => (
            <div key={f.id} className="group relative overflow-hidden rounded-lg" style={{ border: "1px solid var(--color-border)" }}>
              {f.url ? <img src={f.url} alt={f.legenda ?? "foto da obra"} className="h-28 w-full object-cover" /> : <div className="flex h-28 items-center justify-center text-xs" style={{ color: "var(--color-text-subtle)" }}>sem preview</div>}
              {f.legenda && <div className="truncate px-1.5 py-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>{f.legenda}</div>}
              <button type="button" onClick={async () => { if (confirm("Remover foto?")) { await removerFotoObra(f.id); await onMudou(); } }}
                className="absolute right-1 top-1 rounded-full p-1 opacity-0 transition-opacity group-hover:opacity-100" style={{ background: "rgba(0,0,0,0.6)" }} aria-label="remover">
                <Trash2 className="h-3.5 w-3.5" style={{ color: "#fff" }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function L({ l, children }: { l: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1"><span className="text-xs font-semibold" style={{ color: "var(--color-text-subtle)" }}>{l}</span>{children}</label>;
}
function Peso({ valor, label, sub, accent }: { valor: string; label: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--color-border)" }}>
      <div className="font-heading text-xl font-bold tabular-nums" style={{ color: accent ?? "var(--color-text)" }}>{valor}</div>
      <div className="text-[12px] font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</div>
      {sub && <div className="text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{sub}</div>}
    </div>
  );
}
