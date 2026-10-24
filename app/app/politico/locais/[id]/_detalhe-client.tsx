"use client";

/**
 * Ficha do Local (o "card da escola"): info, eventos realizados ali, cadastro de
 * pessoas (que viram leads em novo_cadastro) e a lista de quem já foi cadastrado.
 * Grava via server actions registrarPessoaEmEvento / criarEventoNoLocal.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MapPin,
  Users,
  CalendarCheck,
  UserPlus,
  CalendarPlus,
  Check,
  Phone,
  BookOpen,
} from "lucide-react";

import { registrarPessoaEmEvento, criarEventoNoLocal } from "@/app/actions/politico/eventos-actions";
import { KpiCard } from "@/components/politico/kpi-card";

export interface LocalDetalhe {
  id: string;
  nome: string;
  tipo: string;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  zona: string | null;
  endereco: string | null;
  ativo: boolean;
}
export interface EventoDoLocal {
  id: string;
  titulo: string;
  tipo: string;
  data: string | null;
  publicoEstimado: number | null;
  nPessoas: number;
  ebook: string | null;
}
export interface MaterialOpcao {
  id: string;
  titulo: string;
}
export interface PessoaRegistrada {
  contactId: string;
  nome: string;
  telefone: string | null;
  eventoId: string;
  eventoTitulo: string;
  relacao: string | null;
  checkedInAt: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  escola: "Escola",
  igreja: "Igreja",
  associacao: "Associação",
  rua_de_lazer: "Rua de Lazer",
  praca: "Praça",
  feira: "Feira",
  comunidade: "Comunidade",
  empresa: "Empresa",
  sindicato: "Sindicato",
  ong: "ONG",
  outro: "Local",
};
const TIPOS_EVENTO = [
  { id: "visita", nome: "Visita" },
  { id: "workshop", nome: "Palestra / Workshop" },
  { id: "reuniao", nome: "Reunião" },
  { id: "assembleia", nome: "Assembleia" },
  { id: "live", nome: "Live" },
  { id: "outro", nome: "Outro" },
];

function data(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}
function Label({ children, obrig }: { children: React.ReactNode; obrig?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>
      {children}
      {obrig && <span style={{ color: "#ef4444" }}> *</span>}
    </label>
  );
}

export default function LocalDetalheClient({
  local,
  eventos,
  pessoas,
  materiais,
}: {
  local: LocalDetalhe;
  eventos: EventoDoLocal[];
  pessoas: PessoaRegistrada[];
  materiais: MaterialOpcao[];
}) {
  const router = useRouter();

  // Cadastro de pessoa
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [bairro, setBairro] = useState("");
  const [relacao, setRelacao] = useState("");
  const [eventoSel, setEventoSel] = useState(eventos[0]?.id ?? "");
  const [salvandoPessoa, setSalvandoPessoa] = useState(false);
  const [erroPessoa, setErroPessoa] = useState<string | null>(null);

  // Novo evento
  const [abrirEvento, setAbrirEvento] = useState(false);
  const [tema, setTema] = useState("");
  const [tipoEvento, setTipoEvento] = useState("visita");
  const [dataEvento, setDataEvento] = useState("");
  const [publico, setPublico] = useState("");
  const [materialEvento, setMaterialEvento] = useState("");
  const [salvandoEvento, setSalvandoEvento] = useState(false);
  const [erroEvento, setErroEvento] = useState<string | null>(null);

  async function cadastrarPessoa(e: React.FormEvent) {
    e.preventDefault();
    setErroPessoa(null);
    if (!nome.trim()) return setErroPessoa("Informe o nome da pessoa.");
    if (!eventoSel) return setErroPessoa("Crie um evento primeiro para cadastrar pessoas.");

    setSalvandoPessoa(true);
    const res = await registrarPessoaEmEvento(eventoSel, { nome, telefone, bairro, relacao });
    if (!res.ok) {
      setSalvandoPessoa(false);
      setErroPessoa(res.erro);
      return;
    }
    setNome("");
    setTelefone("");
    setBairro("");
    setRelacao("");
    setSalvandoPessoa(false);
    router.refresh();
  }

  async function novoEvento(e: React.FormEvent) {
    e.preventDefault();
    setErroEvento(null);
    setSalvandoEvento(true);
    const res = await criarEventoNoLocal(local.id, {
      tema,
      tipoEvento,
      data: dataEvento,
      publicoEstimado: publico ? Number(publico) : undefined,
      materialId: materialEvento || undefined,
    });
    if (!res.ok) {
      setSalvandoEvento(false);
      setErroEvento(res.erro);
      return;
    }
    setTema("");
    setDataEvento("");
    setPublico("");
    setMaterialEvento("");
    setAbrirEvento(false);
    setSalvandoEvento(false);
    router.refresh();
  }

  const localImo = [local.bairro, local.cidade, local.uf].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-[960px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/locais" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Locais & Eventos
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-bold leading-tight">{local.nome}</h1>
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "rgba(215,243,106,0.16)", color: "#5B6B16" }}>
            {TIPO_LABEL[local.tipo] ?? "Local"}
          </span>
          {local.zona && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }}>
              Zona {local.zona}
            </span>
          )}
        </div>
        {(localImo || local.endereco) && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--color-text-muted)" }}>
            <MapPin className="h-4 w-4" aria-hidden /> {[local.endereco, localImo].filter(Boolean).join(" — ")}
          </p>
        )}
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard label="Eventos" valor={eventos.length} icone={CalendarCheck} />
        <KpiCard label="Pessoas cadastradas" valor={pessoas.length} icone={Users} />
        <KpiCard label="Público estimado" valor={eventos.reduce((a, e) => a + (e.publicoEstimado ?? 0), 0)} icone={Users} />
      </section>

      {/* Cadastrar pessoa */}
      <section className="wr-card space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold"><UserPlus className="h-5 w-5" style={{ color: "var(--color-accent)" }} aria-hidden /> Cadastrar pessoa</h2>
        {eventos.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Crie um evento neste local primeiro — as pessoas são cadastradas dentro de um evento.
          </p>
        ) : (
          <form onSubmit={cadastrarPessoa} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><Label obrig>Nome</Label><input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="wr-input w-full" /></div>
              <div><Label>WhatsApp / telefone</Label><input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(31) 9...." className="wr-input w-full" /></div>
              <div><Label>Bairro (onde mora)</Label><input type="text" value={bairro} onChange={(e) => setBairro(e.target.value)} className="wr-input w-full" /></div>
              <div><Label>Relação com o local</Label><input type="text" value={relacao} onChange={(e) => setRelacao(e.target.value)} placeholder="Ex.: diretor, professor, aluno, mãe" className="wr-input w-full" /></div>
              {eventos.length > 1 && (
                <div className="sm:col-span-2"><Label>Em qual evento</Label><select value={eventoSel} onChange={(e) => setEventoSel(e.target.value)} className="wr-input w-full">{eventos.map((ev) => <option key={ev.id} value={ev.id}>{ev.titulo} · {data(ev.data)}</option>)}</select></div>
              )}
            </div>
            {erroPessoa && <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erroPessoa}</div>}
            <button type="submit" disabled={salvandoPessoa} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60"><Check className="h-4 w-4" aria-hidden /> {salvandoPessoa ? "Cadastrando…" : "Cadastrar pessoa"}</button>
          </form>
        )}
      </section>

      {/* Eventos */}
      <section className="wr-card space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-heading text-lg font-bold"><CalendarCheck className="h-5 w-5" style={{ color: "var(--color-accent)" }} aria-hidden /> Eventos neste local</h2>
          <button type="button" onClick={() => setAbrirEvento((v) => !v)} className="wr-btn inline-flex items-center gap-1.5 text-sm"><CalendarPlus className="h-4 w-4" aria-hidden /> Novo evento</button>
        </div>

        {abrirEvento && (
          <form onSubmit={novoEvento} className="space-y-4 rounded-xl p-4" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label>Tema</Label><input type="text" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ex.: Proteção digital das crianças" className="wr-input w-full" /></div>
              <div><Label>Tipo</Label><select value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value)} className="wr-input w-full">{TIPOS_EVENTO.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
              <div><Label>Data</Label><input type="date" value={dataEvento} onChange={(e) => setDataEvento(e.target.value)} className="wr-input w-full" /></div>
              <div><Label>Público estimado</Label><input type="number" min={0} value={publico} onChange={(e) => setPublico(e.target.value)} className="wr-input w-full" /></div>
              {materiais.length > 0 && (
                <div className="sm:col-span-2">
                  <Label>Ebook a enviar para quem se cadastrar</Label>
                  <select value={materialEvento} onChange={(e) => setMaterialEvento(e.target.value)} className="wr-input w-full">
                    <option value="">Escolher depois</option>
                    {materiais.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
                  </select>
                </div>
              )}
            </div>
            {erroEvento && <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erroEvento}</div>}
            <button type="submit" disabled={salvandoEvento} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60"><Check className="h-4 w-4" aria-hidden /> {salvandoEvento ? "Salvando…" : "Salvar evento"}</button>
          </form>
        )}

        {eventos.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Nenhum evento registrado aqui ainda.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {eventos.map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="font-medium">{ev.titulo}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--color-text-subtle)" }}>
                    <span>{data(ev.data)}{ev.publicoEstimado ? ` · ~${ev.publicoEstimado} pessoas` : ""}</span>
                    {ev.ebook && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold" style={{ background: "rgba(215,243,106,0.16)", color: "#5B6B16" }}>
                        <BookOpen className="h-3 w-3" aria-hidden /> {ev.ebook}
                      </span>
                    )}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--color-text-muted)" }}><Users className="h-4 w-4" aria-hidden /> {ev.nPessoas} cadastrada{ev.nPessoas === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pessoas cadastradas */}
      <section className="wr-card space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold"><Users className="h-5 w-5" style={{ color: "var(--color-accent)" }} aria-hidden /> Pessoas cadastradas ({pessoas.length})</h2>
        {pessoas.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Nenhuma pessoa cadastrada ainda. Use o formulário acima.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {pessoas.map((p, i) => (
              <li key={`${p.contactId}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <div className="font-medium">{p.nome}{p.relacao ? <span className="ml-2 text-xs font-normal" style={{ color: "var(--color-text-subtle)" }}>· {p.relacao}</span> : null}</div>
                  <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--color-text-subtle)" }}>
                    {p.telefone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" aria-hidden /> {p.telefone}</span>}
                    <span>{p.eventoTitulo}</span>
                    <span>{data(p.checkedInAt)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
