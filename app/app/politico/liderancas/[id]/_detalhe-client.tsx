"use client";

/**
 * Detalhe/edição de uma liderança (Gabinete). Vê os dados, edita os campos e
 * grava via Supabase browser client (RLS). Link direto de WhatsApp.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle, Pencil, X } from "lucide-react";

import { atualizarRegistro } from "@/app/actions/politico/gabinete-actions";

interface Opcao {
  id: string;
  nome: string;
}

export interface LiderancaDetalhe {
  id: string;
  nome: string;
  apelido: string | null;
  cargo: string | null;
  tipo: string;
  whatsapp: string | null;
  aniversario: string | null;
  territory_id: string | null;
  cidade: string | null;
  bairro: string | null;
  zona_eleitoral: string | null;
  leads_mobilizados: number;
  eventos_organizados: number;
  ultimo_contato_em: string | null;
  nivel_engajamento: string;
  status: string;
  observacoes: string | null;
  contacts: { name: string | null; phone_number: string | null } | null;
}

export interface Props {
  lideranca: LiderancaDetalhe;
  territorios: Opcao[];
}

const TIPOS: Opcao[] = [
  { id: "cabo_eleitoral", nome: "Cabo eleitoral" },
  { id: "coordenador_bairro", nome: "Coordenador de bairro" },
  { id: "coordenador_cidade", nome: "Coordenador de cidade" },
  { id: "lider_comunitario", nome: "Líder comunitário" },
  { id: "vereador_aliado", nome: "Vereador aliado" },
  { id: "presidente_associacao", nome: "Presidente de associação" },
  { id: "lider_religioso", nome: "Líder religioso" },
  { id: "lider_sindical", nome: "Líder sindical" },
  { id: "assessor", nome: "Assessor" },
  { id: "outro", nome: "Outro" },
];
const ENGAJAMENTOS: Opcao[] = [
  { id: "baixo", nome: "Baixo" },
  { id: "medio", nome: "Médio" },
  { id: "alto", nome: "Alto" },
  { id: "critico", nome: "Crítico" },
];
const STATUS: Opcao[] = [
  { id: "ativo", nome: "Ativo" },
  { id: "inativo", nome: "Inativo" },
  { id: "suspenso", nome: "Suspenso" },
];
const STATUS_COR: Record<string, { bg: string; color: string }> = {
  ativo: { bg: "rgba(34,197,94,0.15)", color: "#22C55E" },
  inativo: { bg: "rgba(156,163,175,0.15)", color: "#9CA3AF" },
  suspenso: { bg: "rgba(245,158,11,0.15)", color: "#F59E0B" },
};

function rotulo(lista: Opcao[], id: string | null): string {
  if (!id) return "—";
  return lista.find((o) => o.id === id)?.nome ?? id;
}
function fmtData(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DetalheLiderancaClient({ lideranca, territorios }: Props) {
  const router = useRouter();

  const [l, setL] = useState<LiderancaDetalhe>(lideranca);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState(l.nome ?? "");
  const [apelido, setApelido] = useState(l.apelido ?? "");
  const [cargo, setCargo] = useState(l.cargo ?? "");
  const [tipo, setTipo] = useState(l.tipo ?? "cabo_eleitoral");
  const [whatsapp, setWhatsapp] = useState(l.whatsapp ?? "");
  const [aniversario, setAniversario] = useState(l.aniversario ?? "");
  const [cidade, setCidade] = useState(l.cidade ?? "");
  const [bairro, setBairro] = useState(l.bairro ?? "");
  const [zona, setZona] = useState(l.zona_eleitoral ?? "");
  const [territoryId, setTerritoryId] = useState(l.territory_id ?? "");
  const [engajamento, setEngajamento] = useState(l.nivel_engajamento ?? "medio");
  const [status, setStatus] = useState(l.status ?? "ativo");
  const [observacoes, setObservacoes] = useState(l.observacoes ?? "");

  async function salvar() {
    setErro(null);
    if (!nome.trim()) return setErro("Informe o nome.");
    setSalvando(true);
    const patch: Record<string, unknown> = {
      nome: nome.trim(),
      apelido: apelido.trim() || null,
      cargo: cargo.trim() || null,
      tipo,
      whatsapp: whatsapp.trim() ? whatsapp.replace(/\D/g, "") : null,
      aniversario: aniversario || null,
      cidade: cidade.trim() || null,
      bairro: bairro.trim() || null,
      zona_eleitoral: zona.trim() || null,
      territory_id: territoryId || null,
      nivel_engajamento: engajamento,
      status,
      observacoes: observacoes.trim() || null,
    };
    const res = await atualizarRegistro("pol_liderancas", l.id, patch);
    setSalvando(false);
    if (!res.ok) {
      setErro(res.erro);
      return;
    }
    setL((prev) => ({ ...prev, ...(patch as Partial<LiderancaDetalhe>) }));
    setEditando(false);
    router.refresh();
  }

  const sc = STATUS_COR[l.status] ?? STATUS_COR.ativo!;
  const waLink = l.whatsapp ? `https://wa.me/${l.whatsapp.replace(/\D/g, "")}` : null;

  return (
    <div className="mx-auto max-w-[860px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/liderancas" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Lideranças
        </Link>
      </div>

      <header className="wr-card p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: sc.bg, color: sc.color }}>
              {STATUS.find((s) => s.id === l.status)?.nome ?? l.status}
            </span>
            <h1 className="mt-2 font-heading text-2xl font-bold leading-tight" style={{ color: "var(--color-text)" }}>
              {l.apelido || l.nome}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
              {l.cargo ?? rotulo(TIPOS, l.tipo)}
              {[l.cidade, l.bairro].filter(Boolean).length ? ` · ${[l.cidade, l.bairro].filter(Boolean).join(" · ")}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="wr-btn inline-flex items-center gap-2" style={{ color: "#22C55E" }}>
                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
              </a>
            )}
            {!editando && (
              <button type="button" onClick={() => setEditando(true)} className="wr-btn inline-flex items-center gap-2">
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </button>
            )}
          </div>
        </div>

        {/* Contadores */}
        <div className="mt-4 flex flex-wrap gap-6">
          <Contador valor={l.leads_mobilizados} label="mobilizados" />
          <Contador valor={l.eventos_organizados} label="eventos" />
          <div>
            <div className="text-xs" style={{ color: "var(--color-text-subtle)" }}>último contato</div>
            <div className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{fmtData(l.ultimo_contato_em)}</div>
          </div>
        </div>
      </header>

      {erro && (
        <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>
      )}

      <section className="wr-card p-6 sm:p-7">
        {editando ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo label="Nome"><input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Apelido"><input type="text" value={apelido} onChange={(e) => setApelido(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Tipo">
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="wr-input w-full">
                  {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Cargo"><input type="text" value={cargo} onChange={(e) => setCargo(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="WhatsApp"><input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Aniversário"><input type="date" value={aniversario} onChange={(e) => setAniversario(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Cidade"><input type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Bairro"><input type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} className="wr-input w-full" /></Campo>
              <Campo label="Zona eleitoral"><input type="text" value={zona} onChange={(e) => setZona(e.target.value)} className="wr-input w-full" /></Campo>
              {territorios.length > 0 && (
                <Campo label="Território">
                  <select value={territoryId} onChange={(e) => setTerritoryId(e.target.value)} className="wr-input w-full">
                    <option value="">—</option>
                    {territorios.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </Campo>
              )}
              <Campo label="Engajamento">
                <select value={engajamento} onChange={(e) => setEngajamento(e.target.value)} className="wr-input w-full">
                  {ENGAJAMENTOS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="wr-input w-full">
                  {STATUS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </Campo>
            </div>
            <Campo label="Observações"><textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} className="wr-input w-full" /></Campo>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" disabled={salvando} onClick={salvar} className="wr-btn-dark disabled:opacity-60">
                {salvando ? "Salvando…" : "Salvar alterações"}
              </button>
              <button type="button" onClick={() => setEditando(false)} className="wr-btn inline-flex items-center gap-1.5">
                <X className="h-4 w-4" aria-hidden /> Cancelar
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Info label="Nome" valor={l.nome} />
            <Info label="Apelido" valor={l.apelido ?? "—"} />
            <Info label="Tipo" valor={rotulo(TIPOS, l.tipo)} />
            <Info label="Cargo" valor={l.cargo ?? "—"} />
            <Info label="WhatsApp" valor={l.whatsapp ?? "—"} />
            <Info label="Aniversário" valor={l.aniversario ? fmtData(l.aniversario) : "—"} />
            <Info label="Cidade" valor={l.cidade ?? "—"} />
            <Info label="Bairro" valor={l.bairro ?? "—"} />
            <Info label="Zona eleitoral" valor={l.zona_eleitoral ?? "—"} />
            <Info label="Território" valor={rotulo(territorios, l.territory_id)} />
            <Info label="Engajamento" valor={rotulo(ENGAJAMENTOS, l.nivel_engajamento)} />
            <Info label="Contato vinculado" valor={l.contacts?.name ?? "—"} />
            {l.observacoes && <div className="sm:col-span-2"><Info label="Observações" valor={l.observacoes} /></div>}
          </dl>
        )}
      </section>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>{label}</label>
      {children}
    </div>
  );
}
function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-medium" style={{ color: "var(--color-text-subtle)" }}>{label}</dt>
      <dd className="mt-0.5 text-sm font-medium" style={{ color: "var(--color-text)" }}>{valor}</dd>
    </div>
  );
}
function Contador({ valor, label }: { valor: number; label: string }) {
  return (
    <div>
      <div className="font-heading text-xl font-bold tabular-nums leading-none" style={{ color: "var(--color-text)" }}>
        {(valor ?? 0).toLocaleString("pt-BR")}
      </div>
      <div className="mt-0.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>{label}</div>
    </div>
  );
}
