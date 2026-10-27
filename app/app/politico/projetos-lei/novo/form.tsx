"use client";

/**
 * Formulário de novo projeto de lei (Gabinete). Grava em pol_projetos_lei via
 * Supabase browser client (RLS). Coautores e temas de campanha entram como
 * listas separadas por vírgula (text[]).
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";

import { criarRegistro } from "@/app/actions/politico/gabinete-actions";

interface Opcao {
  id: string;
  nome: string;
}

const TIPOS: Opcao[] = [
  { id: "projeto_de_lei", nome: "Projeto de lei" },
  { id: "projeto_de_resolucao", nome: "Projeto de resolução" },
  { id: "projeto_de_emenda", nome: "Projeto de emenda" },
  { id: "indicacao", nome: "Indicação" },
  { id: "mocao", nome: "Moção" },
  { id: "requerimento", nome: "Requerimento" },
  { id: "pedido_de_informacao", nome: "Pedido de informação" },
  { id: "projeto_de_decreto", nome: "Projeto de decreto" },
  { id: "outro", nome: "Outro" },
];
const ESFERAS: Opcao[] = [
  { id: "municipal", nome: "Municipal" },
  { id: "estadual", nome: "Estadual" },
  { id: "federal", nome: "Federal" },
];
const STATUS: Opcao[] = [
  { id: "rascunho", nome: "Rascunho" },
  { id: "apresentado", nome: "Apresentado" },
  { id: "em_tramitacao", nome: "Em tramitação" },
  { id: "em_comissao", nome: "Em comissão" },
  { id: "aprovado_comissao", nome: "Aprovado na comissão" },
  { id: "em_plenario", nome: "Em plenário" },
  { id: "aprovado", nome: "Aprovado" },
  { id: "vetado", nome: "Vetado" },
  { id: "promulgado", nome: "Promulgado" },
  { id: "arquivado", nome: "Arquivado" },
  { id: "retirado", nome: "Retirado" },
];
const PRIORIDADES: Opcao[] = [
  { id: "baixa", nome: "Baixa" },
  { id: "normal", nome: "Normal" },
  { id: "alta", nome: "Alta" },
  { id: "urgente", nome: "Urgente" },
];

function listaDeTexto(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

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
      <span
        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
        style={{ background: on ? "#D7F36A" : "rgba(255,255,255,0.15)" }}
      >
        <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }} />
      </span>
      {label}
    </button>
  );
}

export default function NovoProjetoForm({}: { orgId: string }) {
  const router = useRouter();

  const [numero, setNumero] = useState("");
  const [tipo, setTipo] = useState("projeto_de_lei");
  const [esfera, setEsfera] = useState("municipal");
  const [titulo, setTitulo] = useState("");
  const [ementa, setEmenta] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tema, setTema] = useState("");
  const [url, setUrl] = useState("");
  const [autor, setAutor] = useState(true);
  const [coautores, setCoautores] = useState("");
  const [dataApresentacao, setDataApresentacao] = useState("");
  const [status, setStatus] = useState("em_tramitacao");
  const [comissao, setComissao] = useState("");
  const [relator, setRelator] = useState("");
  const [prioridade, setPrioridade] = useState("normal");
  const [alinhamento, setAlinhamento] = useState(false);
  const [temasCampanha, setTemasCampanha] = useState("");
  const [alertas, setAlertas] = useState(true);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!numero.trim()) return setErro("Informe o número do projeto.");
    if (!titulo.trim()) return setErro("Informe o título.");

    setSalvando(true);
    const payload: Record<string, unknown> = {
      numero: numero.trim(),
      tipo,
      esfera,
      titulo: titulo.trim(),
      status,
      prioridade,
      autor_mandatario: autor,
      alinhamento_campanha: alinhamento,
      alertas_ativos: alertas,
      coautores: listaDeTexto(coautores),
      temas_campanha: listaDeTexto(temasCampanha),
    };
    if (ementa.trim()) payload.ementa = ementa.trim();
    if (descricao.trim()) payload.descricao = descricao.trim();
    if (tema.trim()) payload.tema = tema.trim();
    if (url.trim()) payload.url_oficial = url.trim();
    if (comissao.trim()) payload.comissao_atual = comissao.trim();
    if (relator.trim()) payload.relator = relator.trim();
    if (dataApresentacao) {
      payload.data_apresentacao = dataApresentacao;
      payload.data_ultima_movimentacao = dataApresentacao;
    }

    const res = await criarRegistro("pol_projetos_lei", payload);
    if (!res.ok) {
      setSalvando(false);
      setErro(res.erro);
      return;
    }
    router.push("/app/politico/projetos-lei");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[820px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/projetos-lei" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Projetos de Lei
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-bold leading-tight">Novo projeto de lei</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>Proposição legislativa e sua tramitação.</p>
      </div>

      <form onSubmit={salvar} className="space-y-5">
        <section className="wr-card space-y-4 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><Label obrig>Número</Label><input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: PL 123/2026" className="wr-input w-full" /></div>
            <div><Label>Tipo</Label><select value={tipo} onChange={(e) => setTipo(e.target.value)} className="wr-input w-full">{TIPOS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
            <div><Label>Esfera</Label><select value={esfera} onChange={(e) => setEsfera(e.target.value)} className="wr-input w-full">{ESFERAS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
            <div><Label>Status</Label><select value={status} onChange={(e) => setStatus(e.target.value)} className="wr-input w-full">{STATUS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
          </div>
          <div><Label obrig>Título</Label><input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="wr-input w-full" /></div>
          <div><Label>Ementa</Label><textarea value={ementa} onChange={(e) => setEmenta(e.target.value)} rows={2} className="wr-input w-full" /></div>
          <div><Label>Descrição</Label><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="wr-input w-full" /></div>
        </section>

        <section className="wr-card space-y-4 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><Label>Tema</Label><input type="text" value={tema} onChange={(e) => setTema(e.target.value)} className="wr-input w-full" /></div>
            <div><Label>Prioridade</Label><select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="wr-input w-full">{PRIORIDADES.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
            <div><Label>Comissão atual</Label><input type="text" value={comissao} onChange={(e) => setComissao(e.target.value)} className="wr-input w-full" /></div>
            <div><Label>Relator</Label><input type="text" value={relator} onChange={(e) => setRelator(e.target.value)} className="wr-input w-full" /></div>
            <div><Label>Data de apresentação</Label><input type="date" value={dataApresentacao} onChange={(e) => setDataApresentacao(e.target.value)} className="wr-input w-full" /></div>
            <div><Label>Link oficial</Label><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className="wr-input w-full" /></div>
            <div><Label>Coautores (vírgula)</Label><input type="text" value={coautores} onChange={(e) => setCoautores(e.target.value)} className="wr-input w-full" /></div>
            <div><Label>Temas de campanha (vírgula)</Label><input type="text" value={temasCampanha} onChange={(e) => setTemasCampanha(e.target.value)} className="wr-input w-full" /></div>
          </div>
          <div className="flex flex-wrap gap-6 pt-1">
            <Toggle on={autor} set={setAutor} label="De autoria do mandato" />
            <Toggle on={alinhamento} set={setAlinhamento} label="Alinhado à campanha" />
            <Toggle on={alertas} set={setAlertas} label="Alertas ativos" />
          </div>
        </section>

        {erro && <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={salvando} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60"><Check className="h-4 w-4" aria-hidden /> {salvando ? "Salvando…" : "Salvar projeto"}</button>
          <Link href="/app/politico/projetos-lei" className="wr-btn">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
