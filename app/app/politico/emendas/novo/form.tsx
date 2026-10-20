"use client";

/**
 * Formulário de nova emenda parlamentar (Gabinete). Grava em pol_emendas via
 * Supabase browser client (RLS). Valor entra em R$ e é convertido para _cents.
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

export interface NovaEmendaFormProps {
  orgId: string;
  territorios: Opcao[];
  liderancas: Opcao[];
}

const TIPOS: Opcao[] = [
  { id: "individual", nome: "Individual" },
  { id: "bancada", nome: "Bancada" },
  { id: "comissao", nome: "Comissão" },
  { id: "relator", nome: "Relator" },
  { id: "pix", nome: "PIX (transferência especial)" },
];
const ESFERAS: Opcao[] = [
  { id: "municipal", nome: "Municipal" },
  { id: "estadual", nome: "Estadual" },
  { id: "federal", nome: "Federal" },
];
const AREAS: Opcao[] = [
  { id: "saude", nome: "Saúde" },
  { id: "educacao", nome: "Educação" },
  { id: "seguranca", nome: "Segurança" },
  { id: "assistencia_social", nome: "Assistência social" },
  { id: "infraestrutura", nome: "Infraestrutura" },
  { id: "cultura", nome: "Cultura" },
  { id: "esporte", nome: "Esporte" },
  { id: "meio_ambiente", nome: "Meio ambiente" },
  { id: "agricultura", nome: "Agricultura" },
  { id: "tecnologia", nome: "Tecnologia" },
  { id: "outro", nome: "Outro" },
];

function reaisParaCents(v: string): number {
  const n = Number(v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function Label({ children, obrig }: { children: React.ReactNode; obrig?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>
      {children}
      {obrig && <span style={{ color: "#ef4444" }}> *</span>}
    </label>
  );
}

export default function NovaEmendaForm({ liderancas }: NovaEmendaFormProps) {
  const router = useRouter();

  const [numero, setNumero] = useState("");
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [tipo, setTipo] = useState("individual");
  const [esfera, setEsfera] = useState("estadual");
  const [valor, setValor] = useState("");
  const [area, setArea] = useState("saude");
  const [descricao, setDescricao] = useState("");
  const [objeto, setObjeto] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [bairro, setBairro] = useState("");
  const [entidade, setEntidade] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [liderancaId, setLiderancaId] = useState("");
  const [dataIndicacao, setDataIndicacao] = useState("");
  const [prazo, setPrazo] = useState("");
  const [beneficiarios, setBeneficiarios] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const anoNum = Number(ano);
    if (!anoNum || anoNum < 2000) return setErro("Informe um ano válido.");
    if (!descricao.trim()) return setErro("Descreva a emenda.");

    setSalvando(true);
    const payload: Record<string, unknown> = {
      ano: anoNum,
      tipo,
      esfera,
      area_tematica: area,
      descricao: descricao.trim(),
      status: "indicada",
      valor_indicado_cents: reaisParaCents(valor),
    };
    if (numero.trim()) payload.numero = numero.trim();
    if (objeto.trim()) payload.objeto = objeto.trim();
    if (municipio.trim()) payload.municipio = municipio.trim();
    if (bairro.trim()) payload.bairro = bairro.trim();
    if (entidade.trim()) payload.entidade_beneficiada = entidade.trim();
    if (cnpj.trim()) payload.cnpj_entidade = cnpj.trim();
    if (responsavel.trim()) payload.responsavel_nome = responsavel.trim();
    if (liderancaId) payload.lideranca_id = liderancaId;
    if (dataIndicacao) payload.data_indicacao = dataIndicacao;
    if (prazo) payload.prazo_execucao = prazo;
    if (beneficiarios.trim() && Number(beneficiarios)) payload.beneficiarios_estimados = Number(beneficiarios);
    if (observacoes.trim()) payload.observacoes = observacoes.trim();

    const res = await criarRegistro("pol_emendas", payload);
    if (!res.ok) {
      setSalvando(false);
      setErro(res.erro);
      return;
    }
    router.push("/app/politico/emendas");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[820px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/emendas" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Emendas
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-bold leading-tight">Nova emenda</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Indicação parlamentar — valores, destino e execução.
        </p>
      </div>

      <form onSubmit={salvar} className="space-y-5">
        <section className="wr-card space-y-4 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Nº da emenda</Label>
              <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <Label obrig>Ano</Label>
              <input type="number" value={ano} onChange={(e) => setAno(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <Label>Tipo</Label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="wr-input w-full">
                {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div>
              <Label>Esfera</Label>
              <select value={esfera} onChange={(e) => setEsfera(e.target.value)} className="wr-input w-full">
                {ESFERAS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
            <div>
              <Label>Valor indicado (R$)</Label>
              <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="250.000,00" className="wr-input w-full" />
            </div>
            <div>
              <Label>Área temática</Label>
              <select value={area} onChange={(e) => setArea(e.target.value)} className="wr-input w-full">
                {AREAS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label obrig>Descrição</Label>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} placeholder="Finalidade e justificativa da emenda" className="wr-input w-full" />
          </div>
          <div>
            <Label>Objeto</Label>
            <input type="text" value={objeto} onChange={(e) => setObjeto(e.target.value)} placeholder="Ex.: aquisição de equipamentos" className="wr-input w-full" />
          </div>
        </section>

        <section className="wr-card space-y-4 p-5 sm:p-6">
          <h2 className="font-heading text-base font-bold" style={{ color: "var(--color-text)" }}>Destino</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Município</Label>
              <input type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <Label>Bairro</Label>
              <input type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} className="wr-input w-full" placeholder="O bairro liga a emenda ao voto do território" />
            </div>
            <div>
              <Label>Entidade beneficiada</Label>
              <input type="text" value={entidade} onChange={(e) => setEntidade(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <Label>CNPJ da entidade</Label>
              <input type="text" value={cnpj} onChange={(e) => setCnpj(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <Label>Beneficiários estimados</Label>
              <input type="number" value={beneficiarios} onChange={(e) => setBeneficiarios(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <Label>Responsável pela emenda</Label>
              <input type="text" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="wr-input w-full" placeholder="Quem indicou/intermediou (nome livre)" />
            </div>
            {liderancas.length > 0 && (
              <div>
                <Label>Vincular liderança (opcional)</Label>
                <select value={liderancaId} onChange={(e) => setLiderancaId(e.target.value)} className="wr-input w-full">
                  <option value="">—</option>
                  {liderancas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label>Data da indicação</Label>
              <input type="date" value={dataIndicacao} onChange={(e) => setDataIndicacao(e.target.value)} className="wr-input w-full" />
            </div>
            <div>
              <Label>Prazo de execução</Label>
              <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="wr-input w-full" />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} className="wr-input w-full" />
          </div>
        </section>

        {erro && (
          <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={salvando} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
            <Check className="h-4 w-4" aria-hidden /> {salvando ? "Salvando…" : "Salvar emenda"}
          </button>
          <Link href="/app/politico/emendas" className="wr-btn">Cancelar</Link>
        </div>
      </form>
    </div>
  );
}
