"use client";

/**
 * Formulário de nova demanda (Gabinete). Liga a demanda a um cidadão: busca na
 * base OU cadastra um novo ali mesmo (não precisa pré-cadastrar). Tudo via
 * server actions (o browser client não enxerga a sessão por causa do cookie
 * httpOnly; a RLS só libera no servidor autenticado).
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, FileText, Paperclip, Search, UserPlus, X } from "lucide-react";

import {
  buscarCidadaos,
  criarCidadao,
  criarRegistro,
  type CidadaoOpcao,
} from "@/app/actions/politico/gabinete-actions";
import { uploadAnexoDemanda, formatarBytes, ANEXO_MAX_BYTES } from "@/lib/politico/anexos-upload";

interface Opcao {
  id: string;
  nome: string;
}

export interface NovaDemandaFormProps {
  orgId: string;
  territorios: Opcao[];
  liderancas: Opcao[];
  assessores: Opcao[];
}

const TIPOS: Opcao[] = [
  { id: "servico_publico", nome: "Serviço público" },
  { id: "infraestrutura", nome: "Infraestrutura" },
  { id: "saude", nome: "Saúde" },
  { id: "educacao", nome: "Educação" },
  { id: "seguranca", nome: "Segurança" },
  { id: "assistencia_social", nome: "Assistência social" },
  { id: "meio_ambiente", nome: "Meio ambiente" },
  { id: "documentacao", nome: "Documentação" },
  { id: "emprego", nome: "Emprego" },
  { id: "outro", nome: "Outro" },
];
const PRIORIDADES: Opcao[] = [
  { id: "baixa", nome: "Baixa" },
  { id: "normal", nome: "Normal" },
  { id: "alta", nome: "Alta" },
  { id: "urgente", nome: "Urgente" },
];

function Label({ children, obrig }: { children: React.ReactNode; obrig?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>
      {children}
      {obrig && <span style={{ color: "#ef4444" }}> *</span>}
    </label>
  );
}

export default function NovaDemandaForm({ territorios, liderancas, assessores }: NovaDemandaFormProps) {
  const router = useRouter();

  // Cidadão (contact)
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<CidadaoOpcao[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [contato, setContato] = useState<CidadaoOpcao | null>(null);
  // cadastro inline de cidadão novo
  const [modoNovo, setModoNovo] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoFone, setNovoFone] = useState("");
  const [criandoCidadao, setCriandoCidadao] = useState(false);

  // Campos
  const [assunto, setAssunto] = useState("");
  const [tipo, setTipo] = useState("");
  const [prioridade, setPrioridade] = useState("normal");
  const [orgao, setOrgao] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [liderancaId, setLiderancaId] = useState("");
  const [assessorNome, setAssessorNome] = useState("");
  const [prazo, setPrazo] = useState("");

  // Anexos escolhidos (só vão para o servidor DEPOIS que a demanda é criada —
  // o arquivo precisa de um id de demanda no caminho do bucket).
  const [arquivos, setArquivos] = useState<File[]>([]);
  const arquivoRef = useRef<HTMLInputElement>(null);

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

  function abrirNovo() {
    setModoNovo(true);
    setNovoNome(busca.trim());
    setResultados([]);
  }

  async function cadastrarCidadao() {
    setErro(null);
    if (!novoNome.trim()) return setErro("Informe o nome do cidadão.");
    setCriandoCidadao(true);
    const res = await criarCidadao(novoNome, novoFone || undefined);
    setCriandoCidadao(false);
    if (!res.ok || !res.id) {
      setErro(res.ok ? "Não consegui obter o id do cidadão." : res.erro);
      return;
    }
    setContato({ id: res.id, name: novoNome.trim(), phone_number: novoFone.trim() || null });
    setModoNovo(false);
    setBusca("");
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!contato) return setErro("Selecione ou cadastre o cidadão (demandante).");
    if (!assunto.trim()) return setErro("Descreva o assunto da demanda.");

    setSalvando(true);
    // Assessor: texto livre com sugestão dos membros. Se o nome digitado bate
    // EXATAMENTE com um membro, vira dono humano de verdade (dono_user_id); se
    // for um nome de fora do sistema, fica só o rótulo (pol_assessor_nome) e a
    // demanda segue na triagem (o banco exige user quando dono_kind='humano').
    const nomeAssessor = assessorNome.trim();
    const membro = nomeAssessor ? assessores.find((a) => a.nome === nomeAssessor) : undefined;

    const payload: Record<string, unknown> = {
      contact_id: contato.id,
      origem: "manual",
      estado: "aberta",
      dono_kind: membro ? "humano" : "ia",
      assunto: assunto.trim(),
      pol_prioridade: prioridade,
    };
    if (membro) payload.dono_user_id = membro.id;
    if (nomeAssessor) payload.pol_assessor_nome = nomeAssessor;
    if (tipo) payload.pol_tipo = tipo;
    if (orgao.trim()) payload.pol_orgao_destino = orgao.trim();
    if (territoryId) payload.pol_territory_id = territoryId;
    if (liderancaId) payload.pol_lideranca_id = liderancaId;
    if (prazo) payload.prazo_em = new Date(prazo + "T12:00:00").toISOString();

    const res = await criarRegistro("demandas", payload);
    if (!res.ok) {
      setSalvando(false);
      setErro(res.erro);
      return;
    }

    // Anexos: sobem agora que a demanda tem id. Uma falha de anexo não desfaz a
    // demanda já criada — avisa e segue para o detalhe, onde dá para reenviar.
    if (res.id && arquivos.length > 0) {
      for (const f of arquivos) {
        if (f.size > ANEXO_MAX_BYTES) continue;
        await uploadAnexoDemanda(res.id, f);
      }
    }

    router.push(res.id ? `/app/politico/demandas/${res.id}` : "/app/politico/demandas");
    router.refresh();
  }

  function adicionarArquivos(e: React.ChangeEvent<HTMLInputElement>) {
    const novos = Array.from(e.target.files ?? []);
    if (arquivoRef.current) arquivoRef.current.value = "";
    if (novos.length === 0) return;
    setArquivos((prev) => [...prev, ...novos]);
  }

  return (
    <div className="mx-auto max-w-[760px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/demandas" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Demandas
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-bold leading-tight">Nova demanda</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Registre uma demanda do cidadão e encaminhe ao gabinete.
        </p>
      </div>

      <form onSubmit={salvar} className="space-y-5">
        {/* Cidadão */}
        <section className="wr-card p-5 sm:p-6">
          <Label obrig>Cidadão (demandante)</Label>
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
                aria-label="Trocar cidadão"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : modoNovo ? (
            <div className="space-y-3 rounded-xl p-4" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label obrig>Nome do cidadão</Label>
                  <input type="text" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} className="wr-input w-full" />
                </div>
                <div>
                  <Label>WhatsApp / telefone</Label>
                  <input type="tel" value={novoFone} onChange={(e) => setNovoFone(e.target.value)} placeholder="(31) 99999-9999" className="wr-input w-full" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" disabled={criandoCidadao} onClick={cadastrarCidadao} className="wr-btn-dark inline-flex items-center gap-1.5 disabled:opacity-60">
                  <UserPlus className="h-4 w-4" aria-hidden /> {criandoCidadao ? "Cadastrando…" : "Cadastrar e usar"}
                </button>
                <button type="button" onClick={() => setModoNovo(false)} className="wr-btn">Voltar à busca</button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="flex min-h-[44px] items-center gap-2.5 rounded-full px-4" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
                <Search className="h-4 w-4 shrink-0" style={{ color: "var(--color-text-subtle)" }} aria-hidden />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar cidadão pelo nome…"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                  style={{ color: "var(--color-text)" }}
                  autoComplete="off"
                />
              </div>
              {busca.trim().length >= 2 && (
                <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl py-1" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                  {buscando && <div className="px-4 py-2 text-xs" style={{ color: "var(--color-text-subtle)" }}>Buscando…</div>}
                  {!buscando && resultados.map((c) => (
                    <button key={c.id} type="button" onClick={() => { setContato(c); setResultados([]); }} className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left transition-colors hover:bg-[var(--color-surface-elevated)]">
                      <span className="truncate text-sm font-medium" style={{ color: "var(--color-text)" }}>{c.name ?? "Sem nome"}</span>
                      <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--color-text-subtle)" }}>{c.phone_number ?? ""}</span>
                    </button>
                  ))}
                  {!buscando && (
                    <button type="button" onClick={abrirNovo} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--color-surface-elevated)]" style={{ color: "#D7F36A" }}>
                      <UserPlus className="h-4 w-4" aria-hidden /> Cadastrar novo cidadão{busca.trim() ? `: "${busca.trim()}"` : ""}
                    </button>
                  )}
                </div>
              )}
              <button type="button" onClick={abrirNovo} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>
                <UserPlus className="h-3.5 w-3.5" aria-hidden /> ou cadastrar um cidadão novo
              </button>
            </div>
          )}
        </section>

        {/* Dados da demanda */}
        <section className="wr-card space-y-4 p-5 sm:p-6">
          <div>
            <Label obrig>Assunto</Label>
            <textarea value={assunto} onChange={(e) => setAssunto(e.target.value)} rows={3} placeholder="Ex.: Falta de iluminação na Rua X, bairro Y" className="wr-input w-full" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Tipo</Label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="wr-input w-full">
                <option value="">—</option>
                {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="wr-input w-full">
                {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div>
              <Label>Assessor responsável</Label>
              <input
                type="text"
                list="assessores-lista"
                value={assessorNome}
                onChange={(e) => setAssessorNome(e.target.value)}
                placeholder="Nome do assessor"
                className="wr-input w-full"
                autoComplete="off"
              />
              {assessores.length > 0 && (
                <datalist id="assessores-lista">
                  {assessores.map((a) => <option key={a.id} value={a.nome} />)}
                </datalist>
              )}
            </div>
            <div>
              <Label>Órgão de destino</Label>
              <input type="text" value={orgao} onChange={(e) => setOrgao(e.target.value)} placeholder="Ex.: Secretaria de Obras" className="wr-input w-full" />
            </div>
            <div>
              <Label>Prazo</Label>
              <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="wr-input w-full" />
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
            {liderancas.length > 0 && (
              <div>
                <Label>Liderança responsável</Label>
                <select value={liderancaId} onChange={(e) => setLiderancaId(e.target.value)} className="wr-input w-full">
                  <option value="">—</option>
                  {liderancas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
            )}
          </div>
        </section>

        {/* Anexos */}
        <section className="wr-card space-y-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Anexos</Label>
            <button type="button" onClick={() => arquivoRef.current?.click()} className="wr-btn inline-flex items-center gap-1.5">
              <Paperclip className="h-4 w-4" aria-hidden /> Anexar arquivo
            </button>
            <input
              ref={arquivoRef}
              type="file"
              multiple
              onChange={adicionarArquivos}
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
            />
          </div>
          {arquivos.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
              Ofícios, fotos do problema ou documentos (até 50MB cada). Opcional.
            </p>
          ) : (
            <ul className="space-y-2">
              {arquivos.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(215,243,106,0.12)", color: "#D7F36A" }} aria-hidden>
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium" style={{ color: "var(--color-text)" }}>{f.name}</div>
                    <div className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
                      {formatarBytes(f.size)}{f.size > ANEXO_MAX_BYTES ? " · acima de 50MB, não será enviado" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setArquivos((prev) => prev.filter((_, j) => j !== i))}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "rgba(255,255,255,0.06)", color: "var(--color-text-muted)" }}
                    aria-label={`Remover ${f.name}`}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {erro && (
          <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={salvando} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
            <Check className="h-4 w-4" aria-hidden /> {salvando ? "Salvando…" : "Salvar demanda"}
          </button>
          <Link href="/app/politico/demandas" className="wr-btn">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
