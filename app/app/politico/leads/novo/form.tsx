"use client";

/**
 * NovoCadastroForm — formulário completo para cadastrar pessoa política.
 *
 * Seções:
 * 1. Dados pessoais (nome, whatsapp, email, cidade, bairro, profissão)
 * 2. Endereço completo (colapsável — CEP com auto-preenchimento ViaCEP)
 * 3. Classificação política (etapa, temperatura, zona/seção, papel)
 * 4. Origem & Relacionamento (colapsável — de onde veio, quem indicou)
 *
 * Fluxo:
 * 1. POST /api/v1/contacts → cria contato (custom_fields p/ cidade/bairro/etc.)
 * 2. POST /api/v1/pol-leads → cria lead político vinculado
 * 3. Redireciona para /app/politico/leads/[id]
 */

import { useState, useCallback, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ── tipos ─────────────────────────────────────────────────────────────────── */

interface Territorio {
  id: string;
  name: string;
  type: string;
}

interface LiderancaOpt {
  id: string;
  nome: string;
}

interface Props {
  territorios: Territorio[];
  liderancas: LiderancaOpt[];
}

/* ── constantes ────────────────────────────────────────────────────────────── */

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

const ORIGENS = [
  { value: "manual", label: "Cadastro manual" },
  { value: "indicacao", label: "Indicação" },
  { value: "evento", label: "Evento" },
  { value: "rede_social", label: "Rede social" },
  { value: "abaixo_assinado", label: "Abaixo-assinado" },
  { value: "palestra", label: "Palestra" },
  { value: "campo", label: "Trabalho de campo" },
  { value: "pesquisa", label: "Pesquisa" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "form", label: "Formulário online" },
] as const;

/* ── componente de seção colapsável ────────────────────────────────────────── */

function SecaoColapsavel({
  titulo,
  emoji,
  children,
  defaultOpen = false,
}: {
  titulo: string;
  emoji?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [aberto, setAberto] = useState(defaultOpen);
  return (
    <section className="wr-card overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center justify-between p-6 sm:p-7 text-left cursor-pointer select-none"
        aria-expanded={aberto}
      >
        <h2
          className="font-heading text-[18px] font-bold flex items-center gap-2"
          style={{ color: "var(--color-text)" }}
        >
          {emoji && <span aria-hidden="true">{emoji}</span>}
          {titulo}
          <span
            className="text-xs font-normal px-2 py-0.5 rounded-full"
            style={{
              background: "var(--color-border)",
              color: "var(--color-text-muted)",
            }}
          >
            opcional
          </span>
        </h2>
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          className="shrink-0 transition-transform"
          style={{
            transform: aberto ? "rotate(180deg)" : "rotate(0deg)",
            color: "var(--color-text-muted)",
          }}
        >
          <path
            d="M5 7.5L10 12.5L15 7.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {aberto && (
        <div className="px-6 sm:px-7 pb-6 sm:pb-7 space-y-5">{children}</div>
      )}
    </section>
  );
}

/* ── label helper ──────────────────────────────────────────────────────────── */

function Label({
  children,
  required,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <span className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>
      {children}
      {required && <span style={{ color: "#C75C2E" }}> *</span>}
    </span>
  );
}

/* ── ícones inline (SVG mínimos) ───────────────────────────────────────────── */

function IconeUsuario() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="inline -mt-0.5">
      <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 1.5c-3.5 0-5.5 1.75-5.5 3.5v.5h11v-.5c0-1.75-2-3.5-5.5-3.5Z" fill="currentColor" opacity="0.6"/>
    </svg>
  );
}

function IconeTelefone() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="inline -mt-0.5">
      <path d="M3.5 1.5h3l1 3-1.5 1a7 7 0 0 0 4 4l1-1.5 3 1v3c0 .5-.5 2.5-5 2.5S1.5 8 1.5 4.5l2-3Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
    </svg>
  );
}

function IconeEmail() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="inline -mt-0.5">
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" opacity="0.6"/>
      <path d="M2 5l6 4 6-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}

function IconeLocal() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="inline -mt-0.5">
      <path d="M8 1.5A4.5 4.5 0 0 0 3.5 6C3.5 9.5 8 14.5 8 14.5s4.5-5 4.5-8.5A4.5 4.5 0 0 0 8 1.5Z" stroke="currentColor" strokeWidth="1.2" opacity="0.6"/>
      <circle cx="8" cy="6" r="1.5" fill="currentColor" opacity="0.6"/>
    </svg>
  );
}

function IconeProfissao() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="inline -mt-0.5">
      <rect x="2.5" y="5" width="11" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" opacity="0.6"/>
      <path d="M5.5 5V3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 1.5 1.5V5" stroke="currentColor" strokeWidth="1.2" opacity="0.6"/>
    </svg>
  );
}

/* ── form principal ────────────────────────────────────────────────────────── */

export default function NovoCadastroForm({ territorios, liderancas }: Props) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Dados pessoais
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [profissao, setProfissao] = useState("");

  // Endereço completo
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [endBairro, setEndBairro] = useState("");
  const [endCidade, setEndCidade] = useState("");
  const [endEstado, setEndEstado] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Classificação política
  const [etapa, setEtapa] = useState("novo_cadastro");
  const [temperatura, setTemperatura] = useState("frio");
  const [territorioId, setTerritorioId] = useState("");
  const [zonaEleitoral, setZonaEleitoral] = useState("");
  const [secaoEleitoral, setSecaoEleitoral] = useState("");
  const [tituloEleitor, setTituloEleitor] = useState("");
  const [comunidadeRole, setComunidadeRole] = useState("");
  const [liderPotencial, setLiderPotencial] = useState(false);

  // Origem & relacionamento
  const [origem, setOrigem] = useState("manual");
  const [liderancaId, setLiderancaId] = useState("");
  const [quemIndicou, setQuemIndicou] = useState("");
  const [consentOrigin, setConsentOrigin] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Geolocalização
  const [buscandoGeo, setBuscandoGeo] = useState(false);

  /* ── formatação de telefone ─────────────────────────────────────────────── */

  function formatarTelefone(value: string): string {
    // Lê PELO DDD, ignorando "+"/código de país. Um "+31..." (DDD 31 de BH que
    // entrou como se fosse código da Holanda) era gravado como +31 e o WhatsApp
    // não entregava. Aqui tiramos tudo que não é dígito e reaplicamos +55.
    const d = value.replace(/\D/g, "").replace(/^0+/, "");
    if (!d) return "";
    if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return `+${d}`;
    if (d.length === 10 || d.length === 11) return `+55${d}`;
    return `+${d}`;
  }

  /* ── busca CEP via ViaCEP ───────────────────────────────────────────────── */

  const buscarCep = useCallback(async (valor: string) => {
    const cepLimpo = valor.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      if (res.ok) {
        const data = await res.json();
        if (!data.erro) {
          setLogradouro(data.logradouro || "");
          setEndBairro(data.bairro || "");
          setEndCidade(data.localidade || "");
          setEndEstado(data.uf || "");
          // Também preenche cidade/bairro principal se vazios
          if (!bairro) setBairro(data.bairro || "");
          if (!cidade) setCidade(data.localidade || "");
        }
      }
    } catch {
      // Silencioso — o campo continua editável manualmente
    } finally {
      setBuscandoCep(false);
    }
  }, [bairro, cidade]);

  /* ── geolocalização ─────────────────────────────────────────────────────── */

  async function usarLocalizacao() {
    if (!navigator.geolocation) return;
    setBuscandoGeo(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      );
      const { latitude, longitude } = pos.coords;
      // Geocodificação reversa via Nominatim (gratuito, sem key)
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=pt-BR`,
        { headers: { "User-Agent": "WarRoom/2.0" } }
      );
      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        if (addr.city || addr.town || addr.village) {
          setCidade(addr.city || addr.town || addr.village || "");
        }
        if (addr.suburb || addr.neighbourhood) {
          setBairro(addr.suburb || addr.neighbourhood || "");
        }
        if (addr.state) {
          setEndEstado(addr.state || "");
        }
      }
    } catch {
      // Silencioso
    } finally {
      setBuscandoGeo(false);
    }
  }

  /* ── submissão ──────────────────────────────────────────────────────────── */

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);

    try {
      if (!nome.trim()) {
        setErro("Nome é obrigatório.");
        setSalvando(false);
        return;
      }

      // 1. Criar contato
      const phoneFormatted = telefone.trim()
        ? formatarTelefone(telefone.trim())
        : undefined;

      // custom_fields para dados extras que contacts não tem nativamente
      const customFields: Record<string, unknown> = {};
      if (cidade.trim()) customFields.cidade = cidade.trim();
      if (bairro.trim()) customFields.bairro = bairro.trim();
      if (profissao.trim()) customFields.profissao = profissao.trim();
      if (tituloEleitor.trim()) customFields.titulo_eleitor = tituloEleitor.trim();
      if (quemIndicou.trim()) customFields.quem_indicou = quemIndicou.trim();
      if (observacoes.trim()) customFields.observacoes = observacoes.trim();

      // Endereço completo como sub-objeto
      const temEndereco = cep || logradouro || numero;
      if (temEndereco) {
        customFields.endereco = {
          cep: cep.replace(/\D/g, "") || null,
          logradouro: logradouro.trim() || null,
          numero: numero.trim() || null,
          complemento: complemento.trim() || null,
          bairro: endBairro.trim() || null,
          cidade: endCidade.trim() || null,
          estado: endEstado.trim() || null,
        };
      }

      const contactBody: Record<string, unknown> = {
        name: nome.trim(),
        source: origem,
      };
      if (phoneFormatted) contactBody.phone_number = phoneFormatted;
      if (email.trim()) contactBody.email = email.trim();
      if (Object.keys(customFields).length > 0) {
        contactBody.custom_fields = customFields;
      }

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
      if (consentOrigin.trim()) leadBody.consent_origin = consentOrigin.trim();
      if (liderancaId) leadBody.pol_lideranca_id = liderancaId;

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

  /* ── render ─────────────────────────────────────────────────────────────── */

  return (
    <form onSubmit={handleSubmit} className="space-y-[18px]">
      {/* ═══════════════════════ DADOS PESSOAIS ═══════════════════════════ */}
      <section className="wr-card p-6 sm:p-7 space-y-5">
        <h2
          className="font-heading text-[18px] font-bold"
          style={{ color: "var(--color-text)" }}
        >
          Dados pessoais
        </h2>

        {/* Nome */}
        <label className="block space-y-1.5">
          <Label required>
            <IconeUsuario /> Nome completo
          </Label>
          <input
            type="text"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: João Silva"
            className="wr-input"
          />
        </label>

        {/* WhatsApp */}
        <label className="block space-y-1.5">
          <Label required>
            <IconeTelefone /> WhatsApp
          </Label>
          <input
            type="tel"
            required
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(31) 99999-9999"
            className="wr-input"
          />
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            Formato E.164 aplicado automaticamente (+55...)
          </span>
        </label>

        {/* Email */}
        <label className="block space-y-1.5">
          <Label>
            <IconeEmail /> E-mail
          </Label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@exemplo.com"
            className="wr-input"
          />
        </label>

        {/* Cidade + Bairro lado a lado */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <Label>
              <IconeLocal /> Cidade
            </Label>
            <input
              type="text"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="Cidade"
              className="wr-input"
            />
          </label>
          <label className="block space-y-1.5">
            <Label>
              <IconeLocal /> Bairro
            </Label>
            <input
              type="text"
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
              placeholder="Bairro"
              className="wr-input"
            />
          </label>
        </div>

        {/* Usar minha localização */}
        <button
          type="button"
          onClick={usarLocalizacao}
          disabled={buscandoGeo}
          className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-full transition-colors"
          style={{
            background: "var(--color-surface)",
            color: "#4352C4",
            border: "1px solid #4352C4",
            opacity: buscandoGeo ? 0.6 : 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1v2m0 10v2M1 8h2m10 0h2" stroke="#4352C4" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="8" r="3" stroke="#4352C4" strokeWidth="1.5"/>
            <circle cx="8" cy="8" r="1" fill="#C75C2E"/>
          </svg>
          <span style={{ color: "#C75C2E" }}>📍</span>
          {buscandoGeo ? "Buscando..." : "Usar minha localização"}
        </button>

        {/* Profissão */}
        <label className="block space-y-1.5">
          <Label>
            <IconeProfissao /> Profissão
          </Label>
          <input
            type="text"
            value={profissao}
            onChange={(e) => setProfissao(e.target.value)}
            placeholder="Ex.: Professor, Autônomo..."
            maxLength={120}
            className="wr-input"
          />
        </label>
      </section>

      {/* ═══════════ ENDEREÇO COMPLETO (colapsável) ═══════════════════════ */}
      <SecaoColapsavel titulo="Endereço completo" emoji="📍">
        {/* CEP com auto-preenchimento */}
        <label className="block space-y-1.5">
          <Label>CEP</Label>
          <div className="flex gap-2">
            <input
              type="text"
              value={cep}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                const formatted =
                  v.length > 5 ? `${v.slice(0, 5)}-${v.slice(5)}` : v;
                setCep(formatted);
                if (v.length === 8) buscarCep(v);
              }}
              placeholder="00000-000"
              maxLength={9}
              className="wr-input"
              style={{ flex: 1 }}
            />
            {buscandoCep && (
              <span
                className="inline-flex items-center text-xs"
                style={{ color: "var(--color-text-subtle)" }}
              >
                Buscando...
              </span>
            )}
          </div>
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            Preencha o CEP para auto-completar o endereço
          </span>
        </label>

        {/* Logradouro + Número */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
          <label className="block space-y-1.5">
            <Label>Logradouro</Label>
            <input
              type="text"
              value={logradouro}
              onChange={(e) => setLogradouro(e.target.value)}
              placeholder="Rua, Avenida..."
              className="wr-input"
            />
          </label>
          <label className="block space-y-1.5">
            <Label>Nº</Label>
            <input
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Nº"
              maxLength={10}
              className="wr-input"
            />
          </label>
        </div>

        {/* Complemento */}
        <label className="block space-y-1.5">
          <Label>Complemento</Label>
          <input
            type="text"
            value={complemento}
            onChange={(e) => setComplemento(e.target.value)}
            placeholder="Apto, Bloco, Sala..."
            className="wr-input"
          />
        </label>

        {/* Bairro + Cidade + Estado */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block space-y-1.5">
            <Label>Bairro</Label>
            <input
              type="text"
              value={endBairro}
              onChange={(e) => setEndBairro(e.target.value)}
              placeholder="Bairro"
              className="wr-input"
            />
          </label>
          <label className="block space-y-1.5">
            <Label>Cidade</Label>
            <input
              type="text"
              value={endCidade}
              onChange={(e) => setEndCidade(e.target.value)}
              placeholder="Cidade"
              className="wr-input"
            />
          </label>
          <label className="block space-y-1.5">
            <Label>Estado</Label>
            <input
              type="text"
              value={endEstado}
              onChange={(e) => setEndEstado(e.target.value)}
              placeholder="UF"
              maxLength={2}
              className="wr-input"
            />
          </label>
        </div>
      </SecaoColapsavel>

      {/* ═══════════ CLASSIFICAÇÃO POLÍTICA ═══════════════════════════════ */}
      <section className="wr-card p-6 sm:p-7 space-y-5">
        <h2
          className="font-heading text-[18px] font-bold"
          style={{ color: "var(--color-text)" }}
        >
          Classificação política
        </h2>

        {/* Etapa do funil */}
        <label className="block space-y-1.5">
          <Label>Etapa no funil</Label>
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
          <legend className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>
            Temperatura
          </legend>
          <div className="flex gap-2 flex-wrap">
            {TEMPERATURAS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTemperatura(t.value)}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border text-sm font-semibold transition-colors cursor-pointer"
                style={{
                  background:
                    temperatura === t.value
                      ? "var(--wr-btn-dark-bg)"
                      : "var(--color-surface)",
                  color:
                    temperatura === t.value
                      ? "var(--wr-btn-dark-fg)"
                      : "var(--color-text-muted)",
                  borderColor:
                    temperatura === t.value
                      ? "var(--wr-btn-dark-bg)"
                      : "var(--color-border)",
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
            <Label>Território</Label>
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
            <Label>Zona eleitoral</Label>
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
            <Label>Seção eleitoral</Label>
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

        {/* Título de eleitor */}
        <label className="block space-y-1.5">
          <Label>Título de eleitor</Label>
          <input
            type="text"
            value={tituloEleitor}
            onChange={(e) => setTituloEleitor(e.target.value)}
            placeholder="Ex.: 0001 2345 6789"
            maxLength={14}
            className="wr-input"
          />
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            Permite consultar zona/seção no site do TSE
          </span>
        </label>

        {/* Papel na comunidade */}
        <label className="block space-y-1.5">
          <Label>Papel na comunidade</Label>
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
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>
            Potencial multiplicador / líder
          </span>
        </label>
      </section>

      {/* ═══════════ ORIGEM & RELACIONAMENTO (colapsável) ═════════════════ */}
      <SecaoColapsavel titulo="Origem & Relacionamento" emoji="🤝">
        {/* Origem */}
        <label className="block space-y-1.5">
          <Label>Como chegou até nós?</Label>
          <select
            value={origem}
            onChange={(e) => setOrigem(e.target.value)}
            className="wr-input"
          >
            {ORIGENS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {/* Indicado por (liderança) — alimenta a métrica "pessoas indicadas" */}
        {liderancas.length > 0 && (
          <label className="block space-y-1.5">
            <Label>Indicado por (liderança)</Label>
            <select value={liderancaId} onChange={(e) => setLiderancaId(e.target.value)} className="wr-input">
              <option value="">— Nenhuma</option>
              {liderancas.map((l) => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>
            <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
              Vincula este cadastro à liderança que trouxe a pessoa — conta em "pessoas indicadas".
            </span>
          </label>
        )}

        {/* Quem indicou (texto livre, quando não for uma liderança cadastrada) */}
        <label className="block space-y-1.5">
          <Label>Quem indicou (texto livre)</Label>
          <input
            type="text"
            value={quemIndicou}
            onChange={(e) => setQuemIndicou(e.target.value)}
            placeholder="Nome de quem trouxe esse contato, se não for uma liderança cadastrada"
            maxLength={200}
            className="wr-input"
          />
        </label>

        {/* Consentimento */}
        <label className="block space-y-1.5">
          <Label>Origem do consentimento</Label>
          <input
            type="text"
            value={consentOrigin}
            onChange={(e) => setConsentOrigin(e.target.value)}
            placeholder="Ex.: Formulário no evento, WhatsApp direto"
            maxLength={120}
            className="wr-input"
          />
        </label>

        {/* Observações */}
        <label className="block space-y-1.5">
          <Label>Observações</Label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Anotações adicionais sobre esse contato..."
            maxLength={500}
            rows={3}
            className="wr-input"
            style={{ minHeight: "80px", resize: "vertical" }}
          />
        </label>
      </SecaoColapsavel>

      {/* ═══════════ ERRO ═════════════════════════════════════════════════ */}
      {erro && (
        <div
          role="alert"
          className="wr-card p-4 text-sm font-semibold"
          style={{
            background: "#FEE2E2",
            color: "#991B1B",
            borderColor: "#FECACA",
          }}
        >
          {erro}
        </div>
      )}

      {/* ═══════════ AÇÕES ═══════════════════════════════════════════════ */}
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
          className="wr-btn-dark inline-flex items-center justify-center px-8 gap-2 disabled:opacity-60"
        >
          {salvando ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Salvando...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Finalizar cadastro
            </>
          )}
        </button>
      </div>
    </form>
  );
}
