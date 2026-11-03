"use client";

/**
 * Caixa de entrada de PEDIDOS de emenda. Cada card é um pedido ('solicitada'):
 * quem pediu, o quê, quanto, onde. O gabinete ATENDE (vira indicada) ou RECUSA
 * (com motivo). Tem também um "Registrar pedido" com a área classificada
 * automática (o assessor escreve livre; o sistema arquiva a área sozinho).
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Inbox, Plus, X } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { EmptyState } from "@/components/politico/empty-state";
import { classificarArea, rotuloArea, AREAS_EMENDA } from "@/lib/politico/emenda-classificar";
import { ORIGENS_PEDIDO, ORIGEM_LABEL } from "@/lib/politico/pedido-emenda";
import { atenderPedido, recusarPedido, criarPedidoEmenda } from "@/app/actions/politico/pedido-emenda-actions";

export interface PedidoItem {
  id: string;
  solicitante: string;
  origem: string | null;
  objeto: string;
  descricao: string | null;
  area: string;
  valor: string;
  local: string | null;
  data: string | null;
}

function reaisParaCents(v: string): number {
  if (!v) return 0;
  const s = v.replace(/[^\d,.-]/g, "").trim();
  if (!s) return 0;
  const m = s.match(/[.,](\d{1,2})$/);
  const centsStr = m ? (m[1] + "0").slice(0, 2) : "00";
  const intStr = (m ? s.slice(0, -m[0].length) : s).replace(/[.,]/g, "");
  const reais = Number(intStr || "0");
  if (!Number.isFinite(reais)) return 0;
  return reais * 100 + Number(centsStr);
}

export default function PedidosClient({ pedidos }: { pedidos: PedidoItem[] }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [abrindoForm, setAbrindoForm] = useState(false);

  function atender(id: string) {
    setErro(null);
    startTransition(async () => {
      const r = await atenderPedido(id);
      if (!r.ok) setErro(r.error);
      else router.refresh();
    });
  }

  function confirmarRecusa(id: string) {
    if (!motivo.trim()) { setErro("Informe o motivo da recusa."); return; }
    setErro(null);
    startTransition(async () => {
      const r = await recusarPedido(id, motivo.trim());
      if (!r.ok) setErro(r.error);
      else { setRecusando(null); setMotivo(""); router.refresh(); }
    });
  }

  return (
    <div className="gip-ambient-bg mx-auto max-w-[1000px] px-4 py-7 space-y-5">
      <div>
        <Link href="/app/politico/emendas" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Emendas
        </Link>
      </div>

      <CommandHero
        eyebrow="Gabinete · Emendas"
        titulo="Pedidos de emenda"
        subtitulo="Quem pediu o quê — antes de decidir. Atenda (vira indicação) ou recuse."
        acoes={[]}
      />

      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
          <Inbox className="h-4 w-4" /> {pedidos.length} pedido(s) aguardando
        </div>
        <button onClick={() => setAbrindoForm((v) => !v)} className="wr-btn-dark inline-flex items-center gap-2">
          {abrindoForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {abrindoForm ? "Fechar" : "Registrar pedido"}
        </button>
      </div>

      {abrindoForm && <RegistrarPedido onPronto={() => { setAbrindoForm(false); router.refresh(); }} />}

      {erro && (
        <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>
      )}

      {pedidos.length === 0 ? (
        <EmptyState icon={Inbox} title="Nenhum pedido aguardando" description="Quando um prefeito, entidade ou liderança pedir uma emenda, ela aparece aqui pra você atender ou recusar." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pedidos.map((p) => (
            <div key={p.id} className="gip-glass flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{p.solicitante}</div>
                  <div className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                    {p.origem ? `${p.origem} · ` : ""}{p.data ?? ""}
                  </div>
                </div>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "#EDE9FE", color: "#6D28D9" }}>Pedido</span>
              </div>
              <div className="text-sm">{p.objeto}</div>
              <div className="flex flex-wrap gap-1.5">
                <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>{p.area}</span>
                {p.local && <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>{p.local}</span>}
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text)" }}>{p.valor}</span>
              </div>

              {recusando === p.id ? (
                <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo da recusa (obrigatório)" className="wr-input w-full" autoFocus />
                  <div className="flex gap-2">
                    <button disabled={pendente} onClick={() => confirmarRecusa(p.id)} className="wr-btn-dark text-sm disabled:opacity-60">Confirmar recusa</button>
                    <button onClick={() => { setRecusando(null); setMotivo(""); setErro(null); }} className="wr-btn text-sm">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="mt-auto flex gap-2 border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
                  <button disabled={pendente} onClick={() => atender(p.id)} className="wr-btn-dark inline-flex items-center gap-1.5 text-sm disabled:opacity-60">
                    <Check className="h-4 w-4" /> Atender
                  </button>
                  <button disabled={pendente} onClick={() => { setRecusando(p.id); setMotivo(""); setErro(null); }} className="wr-btn text-sm disabled:opacity-60">Recusar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RegistrarPedido({ onPronto }: { onPronto: () => void }) {
  const [solicitante, setSolicitante] = useState("");
  const [origem, setOrigem] = useState<string>("lideranca");
  const [objeto, setObjeto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [bairro, setBairro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const areaAuto = classificarArea(`${objeto} ${descricao}`);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!solicitante.trim()) return setErro("Informe quem está pedindo.");
    if (!objeto.trim() && !descricao.trim()) return setErro("Descreva o que está sendo pedido.");
    setSalvando(true);
    const r = await criarPedidoEmenda({
      solicitanteNome: solicitante.trim(),
      solicitanteOrigem: origem,
      objeto: objeto.trim(),
      descricao: descricao.trim() || undefined,
      valorIndicadoCents: reaisParaCents(valor),
      municipio: municipio.trim() || undefined,
      bairro: bairro.trim() || undefined,
    });
    setSalvando(false);
    if (!r.ok) return setErro(r.error);
    onPronto();
  }

  return (
    <form onSubmit={salvar} className="gip-glass space-y-4 p-5">
      <h2 className="font-heading text-base font-bold">Registrar pedido</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-semibold">Quem está pedindo</label>
          <input value={solicitante} onChange={(e) => setSolicitante(e.target.value)} className="wr-input w-full" placeholder="Prefeito, entidade, liderança…" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold">Origem</label>
          <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="wr-input w-full">
            {ORIGENS_PEDIDO.map((o) => <option key={o} value={o}>{ORIGEM_LABEL[o]}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold">O que está sendo pedido</label>
        <input value={objeto} onChange={(e) => setObjeto(e.target.value)} className="wr-input w-full" placeholder="Ex.: campo de futebol, UPA, APAE, abrigo…" />
        <p className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>
          Área (automática): <strong>{rotuloArea(areaAuto)}</strong> — o sistema classifica sozinho pelo que você escreve.
        </p>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold">Detalhes (opcional)</label>
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className="wr-input w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-semibold">Valor pedido (R$)</label>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="wr-input w-full" placeholder="100.000,00" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold">Município (opcional)</label>
          <input value={municipio} onChange={(e) => setMunicipio(e.target.value)} className="wr-input w-full" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold">Bairro (opcional)</label>
          <input value={bairro} onChange={(e) => setBairro(e.target.value)} className="wr-input w-full" />
        </div>
      </div>
      {erro && <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>}
      <button type="submit" disabled={salvando} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
        <Check className="h-4 w-4" /> {salvando ? "Registrando…" : "Registrar pedido"}
      </button>
    </form>
  );
}
