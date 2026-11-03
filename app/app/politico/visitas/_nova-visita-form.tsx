"use client";

/**
 * Ficha rápida de Nova Visita — cria a visita DIRETO no módulo (sem passar pela
 * Nova demanda). Curta e mobile-friendly: cidadão (busca/cadastra), assunto, data
 * (obrigatórios) + órgão/local opcionais. SEM responsável na criação — o assessor
 * marca "Eu vou" depois. Reusa as ações do gabinete; a visita nasce como demanda
 * tipo 'visita_tecnica' e aparece no módulo e na lista de Demandas.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Search, UserPlus } from "lucide-react";

import {
  buscarCidadaos,
  criarCidadao,
  criarRegistro,
  garantirLeadNovoCadastro,
  sincronizarVisitaNaAgenda,
  type CidadaoOpcao,
} from "@/app/actions/politico/gabinete-actions";
import { orgaosSugeridos } from "@/lib/politico/demanda-cobranca";

export default function NovaVisitaForm({ tipoMandato, onFechar }: { tipoMandato: string | null; onFechar: () => void }) {
  const router = useRouter();
  const orgaosChips = orgaosSugeridos(tipoMandato);

  // Cidadão
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<CidadaoOpcao[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [contato, setContato] = useState<CidadaoOpcao | null>(null);
  const [modoNovo, setModoNovo] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoFone, setNovoFone] = useState("");
  const [criandoCidadao, setCriandoCidadao] = useState(false);

  // Campos da visita
  const [assunto, setAssunto] = useState("");
  const [orgao, setOrgao] = useState("");
  const [bairro, setBairro] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [data, setData] = useState("");

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
      const achados = await buscarCidadaos(q);
      if (buscaRef.current.trim() === q) {
        setResultados(achados);
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [busca, contato]);

  async function cadastrarCidadao() {
    setErro(null);
    if (!novoNome.trim()) return setErro("Informe o nome do cidadão.");
    if (!novoFone.trim()) return setErro("Informe o WhatsApp do cidadão — é por onde o gabinete dá retorno.");
    setCriandoCidadao(true);
    const res = await criarCidadao(novoNome, novoFone || undefined);
    if (res.ok && res.id) await garantirLeadNovoCadastro(res.id);
    setCriandoCidadao(false);
    if (!res.ok || !res.id) return setErro(res.ok ? "Não consegui obter o id do cidadão." : res.erro);
    setContato({ id: res.id, name: novoNome.trim(), phone_number: novoFone.trim() || null });
    setModoNovo(false);
    setBusca("");
  }

  async function salvar() {
    setErro(null);
    if (!contato) return setErro("Escolha ou cadastre o cidadão solicitante.");
    if (!assunto.trim()) return setErro("Informe o assunto da visita.");
    if (!data) return setErro("Informe a data da visita.");
    setSalvando(true);
    const payload: Record<string, unknown> = {
      contact_id: contato.id,
      pol_gabinete: true,
      pol_tipo: "visita_tecnica",
      assunto: assunto.trim(),
      estado: "em_atendimento",
      prazo_em: new Date(data + "T12:00:00").toISOString(),
    };
    if (orgao.trim()) payload.pol_orgao_destino = orgao.trim();
    if (bairro.trim()) payload.pol_bairro = bairro.trim();
    if (municipio.trim()) payload.pol_municipio = municipio.trim();
    const res = await criarRegistro("demandas", payload);
    setSalvando(false);
    if (!res.ok) return setErro(res.erro);
    // Espelha na Agenda (fail-soft — não bloqueia a criação).
    if (res.id) void sincronizarVisitaNaAgenda(res.id);
    router.refresh();
    onFechar();
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void salvar(); }}
      className="gip-glass space-y-4 p-5"
    >
      <h2 className="font-heading text-base font-bold">Nova visita</h2>

      {/* Cidadão */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold">Cidadão (solicitante) <span style={{ color: "#ef4444" }}>*</span></label>
        {contato ? (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
            <Check className="h-4 w-4" style={{ color: "#17784F" }} aria-hidden />
            <span className="text-sm font-medium">{contato.name ?? "Cidadão"}</span>
            <button type="button" onClick={() => { setContato(null); setBusca(""); }} className="ml-auto text-xs underline" style={{ color: "var(--color-text-muted)" }}>trocar</button>
          </div>
        ) : modoNovo ? (
          <div className="space-y-2 rounded-xl p-3" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome completo" className="wr-input w-full" />
            <input value={novoFone} onChange={(e) => setNovoFone(e.target.value)} placeholder="WhatsApp (00) 00000-0000" inputMode="tel" className="wr-input w-full" />
            <div className="flex gap-2">
              <button type="button" disabled={criandoCidadao} onClick={cadastrarCidadao} className="wr-btn-dark inline-flex items-center gap-1.5 text-sm disabled:opacity-60">
                <Check className="h-4 w-4" /> {criandoCidadao ? "Salvando…" : "Salvar cidadão"}
              </button>
              <button type="button" onClick={() => setModoNovo(false)} className="wr-btn text-sm">Cancelar</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 rounded-xl px-3" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
              <Search className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome…" className="w-full bg-transparent py-2.5 text-sm outline-none" style={{ color: "var(--color-text)" }} />
            </div>
            {buscando && <p className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>buscando…</p>}
            {resultados.length > 0 && (
              <div className="mt-1.5 overflow-hidden rounded-xl" style={{ border: "1px solid var(--color-border)" }}>
                {resultados.map((c) => (
                  <button key={c.id} type="button" onClick={() => { setContato(c); setResultados([]); }} className="block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-white/[0.04]" style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {c.name ?? "Sem nome"}{c.phone_number ? ` · ${c.phone_number}` : ""}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => { setModoNovo(true); setNovoNome(busca.trim()); setResultados([]); }} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#8AA62E" }}>
              <UserPlus className="h-4 w-4" /> Cadastrar novo cidadão
            </button>
          </div>
        )}
      </div>

      {/* Assunto */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold">Assunto da visita <span style={{ color: "#ef4444" }}>*</span></label>
        <input value={assunto} onChange={(e) => setAssunto(e.target.value)} className="wr-input w-full" placeholder="Ex.: Vistoria do buraco na Rua X" />
      </div>

      {/* Órgão + chips */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold">Órgão (opcional)</label>
        <input value={orgao} onChange={(e) => setOrgao(e.target.value)} className="wr-input w-full" placeholder="Ex.: COPASA, Secretaria de Obras…" />
        {orgaosChips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {orgaosChips.map((o) => (
              <button key={o} type="button" onClick={() => setOrgao(o)} className="rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
                {o}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Local + Município + Data */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-semibold">Local / Bairro (opcional)</label>
          <input value={bairro} onChange={(e) => setBairro(e.target.value)} className="wr-input w-full" placeholder="Ex.: Venda Nova" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold">Município (opcional)</label>
          <input value={municipio} onChange={(e) => setMunicipio(e.target.value)} className="wr-input w-full" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold">Data da visita <span style={{ color: "#ef4444" }}>*</span></label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="wr-input w-full" />
        </div>
      </div>

      {erro && <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>}

      <div className="flex gap-2">
        <button type="submit" disabled={salvando} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
          <Check className="h-4 w-4" /> {salvando ? "Criando…" : "Criar visita"}
        </button>
        <button type="button" onClick={onFechar} className="wr-btn">Fechar</button>
      </div>
    </form>
  );
}
