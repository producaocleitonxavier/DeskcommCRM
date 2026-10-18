"use client";

/**
 * Formulário de nova liderança (Gabinete). A liderança tem nome próprio; grava
 * em pol_liderancas via server action (RLS). Sem vínculo a contato aqui — a
 * atribuição de cadastros à liderança acontece no cadastro de Pessoas.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check } from "lucide-react";

import { criarRegistro } from "@/app/actions/politico/gabinete-actions";
import { uploadFotoLideranca } from "@/lib/politico/foto-lideranca";

interface Opcao {
  id: string;
  nome: string;
}

export interface NovaLiderancaFormProps {
  orgId: string;
  territorios: Opcao[];
}

const TIPOS: Opcao[] = [
  { id: "apoiador", nome: "Apoiador" },
  { id: "cabo_eleitoral", nome: "Cabo eleitoral" },
  { id: "vereador_aliado", nome: "Vereador aliado" },
  { id: "lider_religioso", nome: "Liderança religiosa" },
  { id: "deputado", nome: "Deputado(a)" },
  { id: "prefeito", nome: "Prefeito(a)" },
  { id: "vice_prefeito", nome: "Vice-Prefeito(a)" },
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

export default function NovaLiderancaForm({ territorios }: NovaLiderancaFormProps) {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [apelido, setApelido] = useState("");
  const [cargo, setCargo] = useState("");
  const [tipo, setTipo] = useState("cabo_eleitoral");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [aniversario, setAniversario] = useState("");
  const [cidade, setCidade] = useState("");
  const [bairro, setBairro] = useState("");
  const [zona, setZona] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [engajamento, setEngajamento] = useState("medio");
  const [status, setStatus] = useState("ativo");
  const [observacoes, setObservacoes] = useState("");

  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!nome.trim()) return setErro("Informe o nome da liderança.");

    setSalvando(true);
    const payload: Record<string, unknown> = {
      nome: nome.trim(),
      tipo,
      nivel_engajamento: engajamento,
      status,
    };
    if (apelido.trim()) payload.apelido = apelido.trim();
    if (cargo.trim()) payload.cargo = cargo.trim();
    if (whatsapp.trim()) payload.whatsapp = whatsapp.replace(/\D/g, "");
    if (email.trim()) payload.email = email.trim();
    if (instagram.trim()) payload.instagram = instagram.trim().replace(/^@/, "");
    if (aniversario) payload.aniversario = aniversario;
    if (cidade.trim()) payload.cidade = cidade.trim();
    if (bairro.trim()) payload.bairro = bairro.trim();
    if (zona.trim()) payload.zona_eleitoral = zona.trim();
    if (territoryId) payload.territory_id = territoryId;
    if (observacoes.trim()) payload.observacoes = observacoes.trim();

    const res = await criarRegistro("pol_liderancas", payload);
    if (!res.ok) {
      setSalvando(false);
      setErro(res.erro);
      return;
    }
    // Foto (opcional): sobe agora que a liderança tem id.
    if (res.id && foto) await uploadFotoLideranca(res.id, foto);
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
        {/* Foto (opcional) */}
        <div className="wr-card flex items-center gap-4 p-5 sm:p-6">
          <button
            type="button"
            onClick={() => fotoRef.current?.click()}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full"
            style={{ border: "1px dashed var(--color-border)", background: "var(--color-surface-elevated)" }}
            aria-label="Escolher foto"
          >
            {fotoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center" style={{ color: "var(--color-text-subtle)" }}>
                <Camera className="h-5 w-5" aria-hidden />
              </span>
            )}
          </button>
          <input
            ref={fotoRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (fotoRef.current) fotoRef.current.value = "";
              if (f) {
                setFoto(f);
                setFotoPreview(URL.createObjectURL(f));
              }
            }}
          />
          <div>
            <Label>Foto (opcional)</Label>
            <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Aparece na lista e no detalhe. PNG/JPG, até 5MB.</p>
          </div>
        </div>

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
              <Label>E-mail</Label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" className="wr-input w-full" />
            </div>
            <div>
              <Label>Instagram</Label>
              <input type="text" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@usuario" className="wr-input w-full" />
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
