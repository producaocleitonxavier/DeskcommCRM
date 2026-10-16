"use client";

/**
 * Formulário de nova liderança (Gabinete). Liga a um contato existente da base
 * (contact_id, obrigatório; único por organização) e grava em pol_liderancas
 * via Supabase browser client (RLS).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Search, X } from "lucide-react";

import { createClient } from "@/lib/supabase/browser";

interface Opcao {
  id: string;
  nome: string;
}
interface Contato {
  id: string;
  name: string | null;
  phone_number: string | null;
}

export interface NovaLiderancaFormProps {
  orgId: string;
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

function Label({ children, obrig }: { children: React.ReactNode; obrig?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>
      {children}
      {obrig && <span style={{ color: "#ef4444" }}> *</span>}
    </label>
  );
}

export default function NovaLiderancaForm({ orgId, territorios }: NovaLiderancaFormProps) {
  const router = useRouter();
  const supabase = createClient();

  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<Contato[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [contato, setContato] = useState<Contato | null>(null);

  const [nome, setNome] = useState("");
  const [apelido, setApelido] = useState("");
  const [cargo, setCargo] = useState("");
  const [tipo, setTipo] = useState("cabo_eleitoral");
  const [whatsapp, setWhatsapp] = useState("");
  const [aniversario, setAniversario] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [zona, setZona] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [engajamento, setEngajamento] = useState("medio");
  const [status, setStatus] = useState("ativo");
  const [observacoes, setObservacoes] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const buscaRef = useRef(busca);
  buscaRef.current = busca;
  useEffect(() => {
    if (contato) return;
    const q = busca.trim();
    if (q.length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const id = setTimeout(async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, name, phone_number")
        .eq("organization_id", orgId)
        .ilike("name", `%${q}%`)
        .order("name")
        .limit(8);
      if (buscaRef.current.trim() === q) {
        setResultados((data ?? []) as Contato[]);
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [busca, contato, orgId, supabase]);

  function escolher(c: Contato) {
    setContato(c);
    setResultados([]);
    if (!nome.trim() && c.name) setNome(c.name);
    if (!whatsapp.trim() && c.phone_number) setWhatsapp(c.phone_number.replace(/\D/g, ""));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!contato) return setErro("Selecione o contato da liderança.");
    if (!nome.trim()) return setErro("Informe o nome da liderança.");

    setSalvando(true);
    const payload: Record<string, unknown> = {
      organization_id: orgId,
      contact_id: contato.id,
      nome: nome.trim(),
      tipo,
      nivel_engajamento: engajamento,
      status,
    };
    if (apelido.trim()) payload.apelido = apelido.trim();
    if (cargo.trim()) payload.cargo = cargo.trim();
    if (whatsapp.trim()) payload.whatsapp = whatsapp.replace(/\D/g, "");
    if (aniversario) payload.aniversario = aniversario;
    if (cidade.trim()) payload.cidade = cidade.trim();
    if (bairro.trim()) payload.bairro = bairro.trim();
    if (zona.trim()) payload.zona_eleitoral = zona.trim();
    if (territoryId) payload.territory_id = territoryId;
    if (observacoes.trim()) payload.observacoes = observacoes.trim();

    const { error } = await supabase.from("pol_liderancas").insert(payload);
    if (error) {
      setSalvando(false);
      setErro(
        error.code === "23505"
          ? "Este contato já está cadastrado como liderança."
          : `Não foi possível salvar: ${error.message}`,
      );
      return;
    }
    router.push("/app/politico/liderancas");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[760px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/liderancas" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Lideranças
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-bold leading-tight">Nova liderança</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Cadastre um líder da sua rede de mobilização.
        </p>
      </div>

      <form onSubmit={salvar} className="space-y-5">
        {/* Contato */}
        <section className="wr-card p-5 sm:p-6">
          <Label obrig>Contato</Label>
          {contato ? (
            <div
              className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
              style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}
            >
              <div className="min-w-0">
                <div className="truncate font-semibold" style={{ color: "var(--color-text)" }}>{contato.name ?? "Sem nome"}</div>
                <div className="truncate text-xs" style={{ color: "var(--color-text-muted)" }}>{contato.phone_number ?? "sem telefone"}</div>
              </div>
              <button
                type="button"
                onClick={() => { setContato(null); setBusca(""); setResultados([]); }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: "rgba(255,255,255,0.06)", color: "var(--color-text-muted)" }}
                aria-label="Trocar contato"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex min-h-[44px] items-center gap-2.5 rounded-full px-4" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                <Search className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar contato pelo nome…"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                  style={{ color: "var(--color-text)" }}
                  autoComplete="off"
                />
              </div>
              {busca.trim().length >= 2 && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl py-1" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                  {buscando && <div className="px-4 py-2 text-xs" style={{ color: "var(--color-text-subtle)" }}>Buscando…</div>}
                  {!buscando && resultados.length === 0 && (
                    <div className="px-4 py-2 text-xs" style={{ color: "var(--color-text-subtle)" }}>
                      Nenhum contato encontrado. Cadastre em Pessoas primeiro.
                    </div>
                  )}
                  {resultados.map((c) => (
                    <button key={c.id} type="button" onClick={() => escolher(c)} className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left transition-colors hover:bg-[var(--color-surface-elevated)]">
                      <span className="truncate text-sm font-medium" style={{ color: "var(--color-text)" }}>{c.name ?? "Sem nome"}</span>
                      <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{c.phone_number ?? ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Dados */}
        <section className="wr-card space-y-4 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label obrig>Nome</Label>
              <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <Label>Apelido</Label>
              <input type="text" value={apelido} onChange={(e) => setApelido(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <Label>Tipo</Label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="wr-input w-full">
                {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div>
              <Label>Cargo</Label>
              <input type="text" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: Vereador, Presidente de associação" className="wr-input w-full" />
            </div>
            <div>
              <Label>WhatsApp</Label>
              <input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="5531999999999" className="wr-input w-full" />
            </div>
            <div>
              <Label>Aniversário</Label>
              <input type="date" value={aniversario} onChange={(e) => setAniversario(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <Label>Cidade</Label>
              <input type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <Label>Bairro</Label>
              <input type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <Label>Zona eleitoral</Label>
              <input type="text" value={zona} onChange={(e) => setZona(e.target.value)} className="wr-input w-full" />
            </div>
            {territorios.length > 0 && (
              <div>
                <Label>Território</Label>
                <select value={territoryId} onChange={(e) => setTerritoryId(e.target.value)} className="wr-input w-full">
                  <option value="">—</option>
                  {territorios.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label>Engajamento</Label>
              <select value={engajamento} onChange={(e) => setEngajamento(e.target.value)} className="wr-input w-full">
                {ENGAJAMENTOS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="wr-input w-full">
                {STATUS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} className="wr-input w-full" />
          </div>
        </section>

        {erro && (
          <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={salvando} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
            <Check className="h-4 w-4" aria-hidden /> {salvando ? "Salvando…" : "Salvar liderança"}
          </button>
          <Link href="/app/politico/liderancas" className="wr-btn">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
