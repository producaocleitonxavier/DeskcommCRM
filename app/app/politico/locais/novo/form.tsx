"use client";

/**
 * Formulário de novo Local (escola, igreja, associação...) com a opção de já
 * registrar o evento/palestra realizado ali. Grava via server action
 * criarLocalComEvento e abre a ficha do local para cadastrar as pessoas.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Search } from "lucide-react";

import { criarLocalComEvento } from "@/app/actions/politico/eventos-actions";

export interface MaterialOpcao {
  id: string;
  titulo: string;
}

interface Opcao {
  id: string;
  nome: string;
}

const TIPOS: Opcao[] = [
  { id: "escola", nome: "Escola" },
  { id: "igreja", nome: "Igreja" },
  { id: "associacao", nome: "Associação" },
  { id: "rua_de_lazer", nome: "Rua de Lazer" },
  { id: "praca", nome: "Praça" },
  { id: "feira", nome: "Feira" },
  { id: "comunidade", nome: "Comunidade" },
  { id: "empresa", nome: "Empresa" },
  { id: "sindicato", nome: "Sindicato" },
  { id: "ong", nome: "ONG" },
  { id: "outro", nome: "Outro" },
];

const TIPOS_EVENTO: Opcao[] = [
  { id: "visita", nome: "Visita" },
  { id: "workshop", nome: "Palestra / Workshop" },
  { id: "reuniao", nome: "Reunião" },
  { id: "assembleia", nome: "Assembleia" },
  { id: "live", nome: "Live" },
  { id: "outro", nome: "Outro" },
];

function Label({ children, obrig }: { children: React.ReactNode; obrig?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>
      {children}
      {obrig && <span style={{ color: "#ef4444" }}> *</span>}
    </label>
  );
}
function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => set(!on)} className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
      <span className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors" style={{ background: on ? "#D7F36A" : "rgba(255,255,255,0.15)" }}>
        <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }} />
      </span>
      {label}
    </button>
  );
}

export default function NovoLocalForm({ materiais }: { materiais: MaterialOpcao[] }) {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("escola");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const [comEvento, setComEvento] = useState(true);
  const [tema, setTema] = useState("");
  const [tipoEvento, setTipoEvento] = useState("visita");
  const [data, setData] = useState("");
  const [publico, setPublico] = useState("");
  const [materialId, setMaterialId] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // CEP → endereço: digitou o CEP, preenche rua/bairro/cidade/UF (ViaCEP).
  async function buscarPorCep(valor: string) {
    const d = valor.replace(/\D/g, "");
    if (d.length !== 8) return;
    setBuscandoCep(true);
    setCepStatus(null);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = r.ok ? await r.json().catch(() => null) : null;
      if (!j || j.erro) {
        setCepStatus("CEP não encontrado — confira o número.");
        return;
      }
      if (j.logradouro) setEndereco(j.logradouro);
      if (j.bairro) setBairro(j.bairro);
      if (j.localidade) setCidade(j.localidade);
      if (j.uf) setUf(j.uf);
      setCepStatus("Endereço preenchido pelo CEP ✓");
    } catch {
      setCepStatus("Não consegui buscar o CEP agora — preencha à mão.");
    } finally {
      setBuscandoCep(false);
    }
  }

  // Endereço → CEP: preencheu rua + cidade + UF, acha o CEP (ViaCEP).
  // A ViaCEP busca pelo NOME DA RUA, sem número — então tiramos o número.
  async function buscarCepPorEndereco() {
    const uf2 = uf.trim().toUpperCase();
    const cid = cidade.trim();
    const rua = endereco
      .trim()
      .split(",")[0]!
      .replace(/\s+n?º?\.?\s*\d+\s*$/i, "")
      .trim();
    if (uf2.length !== 2 || cid.length < 3 || rua.length < 3) {
      setCepStatus("Preencha UF, cidade e o nome da rua (sem o número) para buscar o CEP.");
      return;
    }
    setBuscandoCep(true);
    setCepStatus(null);
    try {
      const r = await fetch(
        `https://viacep.com.br/ws/${encodeURIComponent(uf2)}/${encodeURIComponent(cid)}/${encodeURIComponent(rua)}/json/`,
      );
      const j = r.ok ? await r.json().catch(() => null) : null;
      if (!Array.isArray(j) || j.length === 0) {
        setCepStatus("Não achei CEP para esse endereço — confira a rua e a cidade (sem o número).");
        return;
      }
      const first = j[0];
      if (first.cep) setCep(first.cep);
      if (first.bairro && !bairro.trim()) setBairro(first.bairro);
      setCepStatus(j.length > 1 ? `Achei ${j.length} CEPs nessa rua — preenchi o primeiro, confira.` : "CEP preenchido ✓");
    } catch {
      setCepStatus("Não consegui buscar o CEP agora — preencha à mão.");
    } finally {
      setBuscandoCep(false);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!nome.trim()) return setErro("Informe o nome do local.");

    setSalvando(true);
    const res = await criarLocalComEvento({
      nome,
      tipo,
      bairro,
      cidade,
      uf,
      cep,
      endereco,
      comEvento,
      tema,
      tipoEvento,
      data,
      publicoEstimado: publico ? Number(publico) : undefined,
      materialId: materialId || undefined,
    });
    if (!res.ok) {
      setSalvando(false);
      setErro(res.erro);
      return;
    }
    router.push(res.id ? `/app/politico/locais/${res.id}` : "/app/politico/locais");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[820px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/locais" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Locais & Eventos
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-bold leading-tight">Novo local</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>Escola, igreja ou associação onde o mandato faz eventos — e, se quiser, já registre a palestra.</p>
      </div>

      <form onSubmit={salvar} className="space-y-5">
        <section className="wr-card space-y-4 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
            <div><Label obrig>Nome do local</Label><input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Escola Municipal João XXIII" className="wr-input w-full" /></div>
            <div><Label>Tipo</Label><select value={tipo} onChange={(e) => setTipo(e.target.value)} className="wr-input w-full">{TIPOS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
          </div>
          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            Dica: digite o CEP que a rua, bairro e cidade se preenchem sozinhos — ou preencha a rua + cidade + UF e clique em "Buscar CEP".
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr_72px]">
            <div>
              <Label>CEP</Label>
              <input
                type="text"
                value={cep}
                maxLength={9}
                onChange={(e) => setCep(e.target.value)}
                onBlur={(e) => buscarPorCep(e.target.value)}
                placeholder="00000-000"
                className="wr-input w-full"
              />
            </div>
            <div><Label>Cidade</Label><input type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} className="wr-input w-full" /></div>
            <div><Label>UF</Label><input type="text" value={uf} onChange={(e) => setUf(e.target.value)} maxLength={2} placeholder="MG" className="wr-input w-full" /></div>
          </div>
          <div>
            <Label>Endereço (rua)</Label>
            <div className="flex gap-2">
              <input type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Ex.: Rua Princesa Isabel" className="wr-input w-full" />
              <button type="button" onClick={buscarCepPorEndereco} disabled={buscandoCep} className="wr-btn inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap disabled:opacity-60">
                <Search className="h-4 w-4" aria-hidden /> Buscar CEP
              </button>
            </div>
          </div>
          <div><Label>Bairro</Label><input type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} className="wr-input w-full" /></div>
          {(cepStatus || buscandoCep) && (
            <p className="text-xs" style={{ color: buscandoCep ? "var(--color-text-subtle)" : "var(--color-text-muted)" }}>
              {buscandoCep ? "Buscando…" : cepStatus}
            </p>
          )}
        </section>

        <section className="wr-card space-y-4 p-5 sm:p-6">
          <Toggle on={comEvento} set={setComEvento} label="Já registrar a palestra / evento realizado aqui" />
          {comEvento && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label>Tema da palestra</Label><input type="text" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex.: Proteção digital das crianças" className="wr-input w-full" /></div>
              <div><Label>Tipo de evento</Label><select value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value)} className="wr-input w-full">{TIPOS_EVENTO.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
              <div><Label>Data</Label><input type="date" value={data} onChange={(e) => setData(e.target.value)} className="wr-input w-full" /></div>
              <div><Label>Público estimado</Label><input type="number" min={0} value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Ex.: 200" className="wr-input w-full" /></div>
              <div className="sm:col-span-2">
                <Label>Ebook a enviar para quem se cadastrar</Label>
                {materiais.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Cadastre materiais na Biblioteca para poder escolher aqui.</p>
                ) : (
                  <>
                    <select value={materialId} onChange={(e) => setMaterialId(e.target.value)} className="wr-input w-full">
                      <option value="">Escolher depois</option>
                      {materiais.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
                    </select>
                    <p className="mt-1.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>O envio automático começa quando o número dedicado estiver conectado (em breve).</p>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {erro && <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={salvando} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60"><Check className="h-4 w-4" aria-hidden /> {salvando ? "Salvando…" : "Salvar local"}</button>
          <Link href="/app/politico/locais" className="wr-btn">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
