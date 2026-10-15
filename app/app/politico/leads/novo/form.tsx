"use client";

/**
 * NovoCadastroForm — formulário client-side para cadastrar pessoa.
 *
 * Fluxo:
 * 1. POST /api/v1/contacts → cria contato
 * 2. POST /api/v1/pol-leads → cria lead político vinculado
 * 3. Redireciona para /app/politico/leads/[id]
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Territorio {
  id: string;
  name: string;
  type: string;
}

interface Props {
  territorios: Territorio[];
}

const ETAPAS = [
  { value: "novo_cadastro", label: "Novo contato" },
  { value: "simpatizante", label: "Simpatizante" },
  { value: "apoiador", label: "Apoiador" },
  { value: "militante", label: "Multiplicador" },
  { value: "voto_certo", label: "Voto certo" },
] as const;

const TEMPERATURAS = [
  { value: "frio", label: "Frio", emoji: "❄️" },
  { value: "morno", label: "Morno", emoji: "🌤️" },
  { value: "quente", label: "Quente", emoji: "🔥" },
] as const;

export default function NovoCadastroForm({ territorios }: Props) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Campos de contato
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");

  // Campos políticos
  const [etapa, setEtapa] = useState("novo_cadastro");
  const [temperatura, setTemperatura] = useState("frio");
  const [territorioId, setTerritorioId] = useState("");
  const [zonaEleitoral, setZonaEleitoral] = useState("");
  const [secaoEleitoral, setSecaoEleitoral] = useState("");
  const [comunidadeRole, setComunidadeRole] = useState("");
  const [liderPotencial, setLiderPotencial] = useState(false);

  function formatarTelefone(value: string): string {
    // Permite apenas dígitos e +
    const limpo = value.replace(/[^\d+]/g, "");
    // Se começou sem +, adiciona +55
    if (limpo && !limpo.startsWith("+")) {
      return `+55${limpo}`;
    }
    return limpo;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);

    try {
      // Validação local mínima
      if (!nome.trim()) {
        setErro("Nome é obrigatório.");
        setSalvando(false);
        return;
      }

      // 1. Criar contato
      const phoneFormatted = telefone.trim()
        ? formatarTelefone(telefone.trim())
        : undefined;

      const contactBody: Record<string, unknown> = {
        name: nome.trim(),
        source: "manual",
      };
      if (phoneFormatted) contactBody.phone_number = phoneFormatted;
      if (email.trim()) contactBody.email = email.trim();

      const resContact = await fetch("/api/v1/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactBody),
      });

      if (!resContact.ok) {
        const errData = await resContact.json().catch(() => null);
        const msg =
          errData?.error?.message ?? `Erro ao criar contato (${resContact.status})`;
        setErro(msg);
        setSalvando(false);
        return;
      }

      const contactData = await resContact.json();
      const contactId: string =
        contactData?.data?.contact?.id ?? contactData?.data?.id;

      if (!contactId) {
        setErro("Contato criado mas sem ID retornado.");
        setSalvando(false);
        return;
      }

      // 2. Criar pol_lead
      const leadBody: Record<string, unknown> = {
        contact_id: contactId,
        support_level: etapa,
        temperature: temperatura,
        leader_potential: liderPotencial,
      };
      if (territorioId) leadBody.territory_id = territorioId;
      if (zonaEleitoral.trim()) leadBody.zona_eleitoral = zonaEleitoral.trim();
      if (secaoEleitoral.trim()) leadBody.secao_eleitoral = secaoEleitoral.trim();
      if (comunidadeRole.trim()) leadBody.community_role = comunidadeRole.trim();

      const resLead = await fetch("/api/v1/pol-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadBody),
      });

      if (!resLead.ok) {
        const errData = await resLead.json().catch(() => null);
        const msg =
          errData?.error?.message ?? `Erro ao criar lead (${resLead.status})`;
        setErro(msg);
        setSalvando(false);
        return;
      }

      const leadData = await resLead.json();
      const leadId: string =
        leadData?.data?.pol_lead?.id ?? leadData?.data?.id;

      // Redirecionar para a ficha
      if (leadId) {
        router.push(`/app/politico/leads/${leadId}`);
      } else {
        router.push("/app/politico/leads");
      }
    } catch (err) {
      setErro(
        err instanceof Error ? err.message : "Erro inesperado. Tente novamente.",
      );
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-[18px]">
      {/* Dados pessoais */}
      <section className="wr-card p-6 sm:p-7 space-y-5">
        <h2
          className="font-heading text-[18px] font-bold"
          style={{ color: "var(--color-text)" }}
        >
          Dados pessoais
        </h2>

        {/* Nome */}
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold" style={{ color: "#4A4F59" }}>
            Nome completo *
          </span>
          <input
            type="text"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Maria das Dores Silva"
            className="wr-input"
          />
        </label>

        {/* Telefone */}
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold" style={{ color: "#4A4F59" }}>
            Telefone (WhatsApp)
          </span>
          <input
            type="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(11) 99999-9999"
            className="wr-input"
          />
          <span className="text-xs" style={{ color: "#9A9D8F" }}>
            Formato E.164 aplicado automaticamente (+55...)
          </span>
        </label>

        {/* Email */}
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold" style={{ color: "#4A4F59" }}>
            E-mail
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@exemplo.com"
            className="wr-input"
          />
        </label>
      </section>

      {/* Dados políticos */}
      <section className="wr-card p-6 sm:p-7 space-y-5">
        <h2
          className="font-heading text-[18px] font-bold"
          style={{ color: "var(--color-text)" }}
        >
          Classificação política
        </h2>

        {/* Etapa do funil */}
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold" style={{ color: "#4A4F59" }}>
            Etapa no funil
          </span>
          <select
            value={etapa}
            onChange={(e) => setEtapa(e.target.value)}
            className="wr-input"
          >
            {ETAPAS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </label>

        {/* Temperatura */}
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-semibold" style={{ color: "#4A4F59" }}>
            Temperatura
          </legend>
          <div className="flex gap-2 flex-wrap">
            {TEMPERATURAS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTemperatura(t.value)}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border text-sm font-semibold transition-colors"
                style={{
                  background: temperatura === t.value ? "#16181D" : "#FFFFFF",
                  color: temperatura === t.value ? "#FFFFFF" : "#4A4F59",
                  borderColor: temperatura === t.value ? "#16181D" : "#DCDCD5",
                }}
              >
                <span aria-hidden="true">{t.emoji}</span> {t.label}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Território */}
        {territorios.length > 0 && (
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold" style={{ color: "#4A4F59" }}>
              Território
            </span>
            <select
              value={territorioId}
              onChange={(e) => setTerritorioId(e.target.value)}
              className="wr-input"
            >
              <option value="">Nenhum</option>
              {territorios.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.type})
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Zona / Seção eleitoral */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold" style={{ color: "#4A4F59" }}>
              Zona eleitoral
            </span>
            <input
              type="text"
              value={zonaEleitoral}
              onChange={(e) => setZonaEleitoral(e.target.value)}
              placeholder="Ex.: 001"
              maxLength={20}
              className="wr-input"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold" style={{ color: "#4A4F59" }}>
              Seção eleitoral
            </span>
            <input
              type="text"
              value={secaoEleitoral}
              onChange={(e) => setSecaoEleitoral(e.target.value)}
              placeholder="Ex.: 0123"
              maxLength={20}
              className="wr-input"
            />
          </label>
        </div>

        {/* Papel na comunidade */}
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold" style={{ color: "#4A4F59" }}>
            Papel na comunidade
          </span>
          <input
            type="text"
            value={comunidadeRole}
            onChange={(e) => setComunidadeRole(e.target.value)}
            placeholder="Ex.: Líder comunitário, Presidente de associação"
            maxLength={120}
            className="wr-input"
          />
        </label>

        {/* Líder potencial */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={liderPotencial}
            onChange={(e) => setLiderPotencial(e.target.checked)}
            className="h-5 w-5 rounded accent-[#26318F]"
          />
          <span className="text-sm font-semibold" style={{ color: "#4A4F59" }}>
            Potencial multiplicador / líder
          </span>
        </label>
      </section>

      {/* Erro */}
      {erro && (
        <div
          role="alert"
          className="wr-card p-4 text-sm font-semibold"
          style={{ background: "#FEE2E2", color: "#991B1B", borderColor: "#FECACA" }}
        >
          {erro}
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-3 justify-end">
        <Link
          href="/app/politico/leads"
          className="wr-btn inline-flex items-center justify-center px-6"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={salvando}
          className="wr-btn-dark inline-flex items-center justify-center px-8 disabled:opacity-60"
        >
          {salvando ? "Salvando..." : "Cadastrar pessoa"}
        </button>
      </div>
    </form>
  );
}
