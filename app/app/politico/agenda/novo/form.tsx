"use client";

/**
 * Formulário de novo compromisso da agenda (Gabinete). Grava em pol_agenda via
 * Supabase browser client (RLS). Datas vêm de datetime-local → ISO.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

import { createClient } from "@/lib/supabase/browser";

interface Opcao {
  id: string;
  nome: string;
}

export interface NovoCompromissoFormProps {
  orgId: string;
  territorios: Opcao[];
  liderancas: Opcao[];
}

const TIPOS: Opcao[] = [
  { id: "reuniao", nome: "Reunião" },
  { id: "visita", nome: "Visita" },
  { id: "audiencia", nome: "Audiência" },
  { id: "evento", nome: "Evento" },
  { id: "ligacao", nome: "Ligação" },
  { id: "compromisso", nome: "Compromisso" },
  { id: "outro", nome: "Outro" },
];
const STATUS: Opcao[] = [
  { id: "agendado", nome: "Agendado" },
  { id: "confirmado", nome: "Confirmado" },
  { id: "concluido", nome: "Concluído" },
  { id: "cancelado", nome: "Cancelado" },
];

function Label({ children, obrig }: { children: React.ReactNode; obrig?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>
      {children}
      {obrig && <span style={{ color: "#ef4444" }}> *</span>}
    </label>
  );
}

export default function NovoCompromissoForm({ orgId, territorios, liderancas }: NovoCompromissoFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("reuniao");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [status, setStatus] = useState("agendado");
  const [local, setLocal] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [liderancaId, setLiderancaId] = useState("");
  const [descricao, setDescricao] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!titulo.trim()) return setErro("Informe o título do compromisso.");
    if (!inicio) return setErro("Informe a data e hora de início.");

    setSalvando(true);
    const payload: Record<string, unknown> = {
      organization_id: orgId,
      titulo: titulo.trim(),
      tipo,
      data_inicio: new Date(inicio).toISOString(),
      dia_inteiro: diaInteiro,
      status,
    };
    if (fim) payload.data_fim = new Date(fim).toISOString();
    if (local.trim()) payload.local = local.trim();
    if (municipio.trim()) payload.municipio = municipio.trim();
    if (territoryId) payload.territory_id = territoryId;
    if (liderancaId) payload.lideranca_id = liderancaId;
    if (descricao.trim()) payload.descricao = descricao.trim();

    const { error } = await supabase.from("pol_agenda").insert(payload);
    if (error) {
      setSalvando(false);
      setErro(`Não foi possível salvar: ${error.message}`);
      return;
    }
    router.push("/app/politico/agenda");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[760px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/agenda" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Agenda
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-bold leading-tight">Novo compromisso</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>Reunião, visita, audiência, evento ou compromisso do mandato.</p>
      </div>

      <form onSubmit={salvar} className="space-y-5">
        <section className="wr-card space-y-4 p-5 sm:p-6">
          <div><Label obrig>Título</Label><input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="wr-input w-full" /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><Label>Tipo</Label><select value={tipo} onChange={(e) => setTipo(e.target.value)} className="wr-input w-full">{TIPOS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
            <div><Label>Status</Label><select value={status} onChange={(e) => setStatus(e.target.value)} className="wr-input w-full">{STATUS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
            <div><Label obrig>Início</Label><input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className="wr-input w-full" /></div>
            <div><Label>Fim</Label><input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} className="wr-input w-full" /></div>
            <div><Label>Local</Label><input type="text" value={local} onChange={(e) => setLocal(e.target.value)} className="wr-input w-full" /></div>
            <div><Label>Município</Label><input type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)} className="wr-input w-full" /></div>
            {territorios.length > 0 && (
              <div><Label>Território</Label><select value={territoryId} onChange={(e) => setTerritoryId(e.target.value)} className="wr-input w-full"><option value="">—</option>{territorios.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
            )}
            {liderancas.length > 0 && (
              <div><Label>Liderança</Label><select value={liderancaId} onChange={(e) => setLiderancaId(e.target.value)} className="wr-input w-full"><option value="">—</option>{liderancas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
            <input type="checkbox" checked={diaInteiro} onChange={(e) => setDiaInteiro(e.target.checked)} /> Dia inteiro
          </label>
          <div><Label>Descrição</Label><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="wr-input w-full" /></div>
        </section>

        {erro && <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={salvando} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60"><Check className="h-4 w-4" aria-hidden /> {salvando ? "Salvando…" : "Salvar compromisso"}</button>
          <Link href="/app/politico/agenda" className="wr-btn">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
