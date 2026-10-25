"use client";

/**
 * EditarLeadForm — edição da ficha de uma pessoa política.
 *
 * Grava em dois PATCHs: /api/v1/contacts/[id] (nome, whatsapp, e-mail,
 * cidade/bairro/profissão em custom_fields — MESCLADOS para não apagar
 * endereco_gip/origem_captacao) e /api/v1/pol-leads/[id] (etapa, temperatura,
 * zona/seção, papel, líder). Volta para a ficha ao concluir.
 */

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface LeadParaEdicao {
  leadId: string;
  contactId: string;
  nome: string;
  telefone: string;
  email: string;
  birthdate: string;
  cidade: string;
  bairro: string;
  profissao: string;
  customFields: Record<string, unknown>;
  support_level: string;
  community_role: string;
  leader_potential: boolean;
}

const ETAPAS = [
  { value: "novo_cadastro", label: "Novo contato" },
  { value: "simpatizante", label: "Simpatizante" },
  { value: "apoiador", label: "Apoiador" },
  { value: "militante", label: "Multiplicador" },
  { value: "voto_certo", label: "Voto certo" },
] as const;

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>
      {children}
    </span>
  );
}

function formatarTelefone(value: string): string {
  // Lê PELO DDD, ignorando "+"/código de país: um "+31..." (DDD 31 de BH) era
  // gravado como +31 e o WhatsApp não entregava. Tira tudo que não é dígito e
  // reaplica +55.
  const d = value.replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return `+${d}`;
  if (d.length === 10 || d.length === 11) return `+55${d}`;
  return `+${d}`;
}

export default function EditarLeadForm({ inicial }: { inicial: LeadParaEdicao }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState(inicial.nome);
  const [telefone, setTelefone] = useState(inicial.telefone);
  const [email, setEmail] = useState(inicial.email);
  const [dataNascimento, setDataNascimento] = useState(inicial.birthdate);
  const [cidade, setCidade] = useState(inicial.cidade);
  const [bairro, setBairro] = useState(inicial.bairro);
  const [profissao, setProfissao] = useState(inicial.profissao);

  const [etapa, setEtapa] = useState(inicial.support_level);
  const [papel, setPapel] = useState(inicial.community_role);
  const [liderPotencial, setLiderPotencial] = useState(inicial.leader_potential);

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    setErro(null);
    if (!nome.trim()) {
      setErro("Nome é obrigatório.");
      return;
    }
    setSalvando(true);
    try {
      // custom_fields MESCLADO: preserva endereco_gip, origem_captacao, etc.
      const customFields: Record<string, unknown> = { ...inicial.customFields };
      if (cidade.trim()) customFields.cidade = cidade.trim();
      else delete customFields.cidade;
      if (bairro.trim()) customFields.bairro = bairro.trim();
      else delete customFields.bairro;
      if (profissao.trim()) customFields.profissao = profissao.trim();
      else delete customFields.profissao;

      const contactBody: Record<string, unknown> = { name: nome.trim(), custom_fields: customFields };
      if (telefone.trim()) contactBody.phone_number = formatarTelefone(telefone.trim());
      if (email.trim()) contactBody.email = email.trim();
      contactBody.birthdate = dataNascimento.trim() || null;

      const resC = await fetch(`/api/v1/contacts/${inicial.contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactBody),
      });
      if (!resC.ok) {
        const e = await resC.json().catch(() => null);
        setErro(e?.error?.message ?? `Erro ao salvar contato (${resC.status})`);
        setSalvando(false);
        return;
      }

      const leadBody: Record<string, unknown> = {
        support_level: etapa,
        community_role: papel.trim() || null,
        leader_potential: liderPotencial,
      };
      const resL = await fetch(`/api/v1/pol-leads/${inicial.leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadBody),
      });
      if (!resL.ok) {
        const e = await resL.json().catch(() => null);
        setErro(e?.error?.message ?? `Erro ao salvar classificação (${resL.status})`);
        setSalvando(false);
        return;
      }

      router.push(`/app/politico/leads/${inicial.leadId}`);
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado. Tente novamente.");
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-[18px]">
      {/* Dados pessoais */}
      <section className="wr-card p-6 sm:p-7 space-y-5">
        <h2 className="font-heading text-[18px] font-bold" style={{ color: "var(--color-text)" }}>Dados pessoais</h2>
        <label className="block space-y-1.5">
          <Label>Nome completo *</Label>
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="wr-input" />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <Label>WhatsApp</Label>
            <input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(31) 99999-9999" className="wr-input" />
          </label>
          <label className="block space-y-1.5">
            <Label>E-mail</Label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" className="wr-input" />
          </label>
        </div>
        <label className="block space-y-1.5">
          <Label>Data de nascimento</Label>
          <input type="date" value={dataNascimento} onChange={(e) => setDataNascimento(e.target.value)} className="wr-input" />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <Label>Cidade</Label>
            <input type="text" value={cidade} onChange={(e) => setCidade(e.target.value)} className="wr-input" />
          </label>
          <label className="block space-y-1.5">
            <Label>Bairro</Label>
            <input type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} className="wr-input" />
          </label>
        </div>
        <label className="block space-y-1.5">
          <Label>Profissão</Label>
          <input type="text" value={profissao} onChange={(e) => setProfissao(e.target.value)} maxLength={120} className="wr-input" />
        </label>
      </section>

      {/* Classificação política */}
      <section className="wr-card p-6 sm:p-7 space-y-5">
        <h2 className="font-heading text-[18px] font-bold" style={{ color: "var(--color-text)" }}>Classificação política</h2>
        <label className="block space-y-1.5">
          <Label>Etapa no funil</Label>
          <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className="wr-input">
            {ETAPAS.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </label>
        <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-subtle)" }}>
          A <strong style={{ color: "var(--color-text-muted)" }}>temperatura</strong> (frio/morno/quente) é medida ao longo da jornada (engajamento real), não editada à mão.
        </p>
        <label className="block space-y-1.5">
          <Label>Papel na comunidade</Label>
          <input type="text" value={papel} onChange={(e) => setPapel(e.target.value)} maxLength={120} placeholder="Ex.: Presidente de associação" className="wr-input" />
        </label>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" checked={liderPotencial} onChange={(e) => setLiderPotencial(e.target.checked)} className="h-5 w-5 rounded accent-[#26318F]" />
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>Potencial multiplicador / líder</span>
        </label>
      </section>

      {erro && (
        <div role="alert" className="wr-card p-4 text-sm font-semibold" style={{ background: "#FEE2E2", color: "#991B1B", borderColor: "#FECACA" }}>
          {erro}
        </div>
      )}

      <div className="flex flex-wrap gap-3 justify-end">
        <Link href={`/app/politico/leads/${inicial.leadId}`} className="wr-btn inline-flex items-center justify-center px-6">Cancelar</Link>
        <button type="submit" disabled={salvando} className="wr-btn-dark inline-flex items-center justify-center px-8 disabled:opacity-60">
          {salvando ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
