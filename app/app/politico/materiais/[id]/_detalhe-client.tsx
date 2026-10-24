"use client";

/**
 * Edição/exclusão de um material (Biblioteca). Atualiza/exclui em pol_materiais
 * via server actions (RLS pela organização ativa). Mesmo visual do cadastro,
 * com prévia da capa e confirmação antes de excluir.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Image as ImageIcon, Trash2, ExternalLink } from "lucide-react";

import { atualizarRegistro, excluirRegistro } from "@/app/actions/politico/gabinete-actions";

export interface MaterialDetalhe {
  id: string;
  titulo: string;
  descricao: string;
  categoria: string;
  tipo: string;
  url: string;
  capaUrl: string;
  ativo: boolean;
}

interface Opcao {
  id: string;
  nome: string;
}
const TIPOS: Opcao[] = [
  { id: "ebook", nome: "E-book" },
  { id: "pdf", nome: "PDF" },
  { id: "video", nome: "Vídeo" },
  { id: "audio", nome: "Áudio" },
  { id: "link", nome: "Link / página" },
  { id: "imagem", nome: "Card / imagem" },
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

export default function MaterialDetalheClient({ material }: { material: MaterialDetalhe }) {
  const router = useRouter();

  const [titulo, setTitulo] = useState(material.titulo);
  const [categoria, setCategoria] = useState(material.categoria);
  const [tipo, setTipo] = useState(material.tipo);
  const [url, setUrl] = useState(material.url);
  const [capaUrl, setCapaUrl] = useState(material.capaUrl);
  const [descricao, setDescricao] = useState(material.descricao);
  const [ativo, setAtivo] = useState(material.ativo);

  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!titulo.trim()) return setErro("Informe o título do material.");
    if (!url.trim()) return setErro("Informe o link do material (URL).");

    setSalvando(true);
    const patch: Record<string, unknown> = {
      titulo: titulo.trim(),
      tipo,
      url: url.trim(),
      ativo,
      categoria: categoria.trim() || null,
      capa_url: capaUrl.trim() || null,
      descricao: descricao.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const res = await atualizarRegistro("pol_materiais", material.id, patch);
    if (!res.ok) {
      setSalvando(false);
      setErro(res.erro);
      return;
    }
    router.push("/app/politico/materiais");
    router.refresh();
  }

  async function excluir() {
    setErro(null);
    setExcluindo(true);
    const res = await excluirRegistro("pol_materiais", material.id);
    if (!res.ok) {
      setExcluindo(false);
      setErro(res.erro);
      return;
    }
    router.push("/app/politico/materiais");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[820px] px-4 py-7 space-y-5" style={{ background: "var(--color-bg)" }}>
      <div>
        <Link href="/app/politico/materiais" className="inline-flex items-center gap-1 text-sm transition-colors" style={{ color: "var(--color-text-muted)" }}>
          <ArrowLeft className="h-4 w-4" aria-hidden /> Biblioteca de Materiais
        </Link>
        <h1 className="mt-3 font-heading text-3xl font-bold leading-tight">Editar material</h1>
        <a href={material.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--color-text-muted)" }}>
          <ExternalLink className="h-4 w-4" aria-hidden /> Abrir material atual
        </a>
      </div>

      <form onSubmit={salvar} className="space-y-5">
        <section className="wr-card space-y-4 p-5 sm:p-6">
          <div><Label obrig>Título</Label><input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="wr-input w-full" /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><Label>Categoria (tema)</Label><input type="text" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="wr-input w-full" /></div>
            <div><Label>Tipo</Label><select value={tipo} onChange={(e) => setTipo(e.target.value)} className="wr-input w-full">{TIPOS.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></div>
          </div>
          <div><Label obrig>Link do material (URL)</Label><input type="url" value={url} onChange={(e) => setUrl(e.target.value)} className="wr-input w-full" /></div>
          <div><Label>Descrição</Label><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="wr-input w-full" /></div>
        </section>

        <section className="wr-card space-y-4 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <Label>Capa (URL da imagem)</Label>
              <input type="url" value={capaUrl} onChange={(e) => setCapaUrl(e.target.value)} placeholder="https://.../capa.jpg" className="wr-input w-full" />
            </div>
            <div className="flex items-end">
              <div className="relative h-32 w-24 overflow-hidden rounded-lg" style={{ background: "linear-gradient(135deg,#14181F 0%,#1A2410 100%)", border: "1px solid var(--color-border)" }}>
                {capaUrl.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={capaUrl} alt="Prévia da capa" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-6 w-6" style={{ color: "rgba(215,243,106,0.6)" }} aria-hidden />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="pt-1">
            <Toggle on={ativo} set={setAtivo} label="Material ativo (aparece na biblioteca e disponível para envio)" />
          </div>
        </section>

        {erro && <div role="alert" className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FBE4E2", color: "#A3302A" }}>{erro}</div>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={salvando} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60"><Check className="h-4 w-4" aria-hidden /> {salvando ? "Salvando…" : "Salvar alterações"}</button>
          <Link href="/app/politico/materiais" className="wr-btn">Cancelar</Link>
          {!confirmar ? (
            <button type="button" onClick={() => setConfirmar(true)} className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "#A3302A" }}>
              <Trash2 className="h-4 w-4" aria-hidden /> Excluir
            </button>
          ) : (
            <div className="ml-auto inline-flex items-center gap-2">
              <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>Excluir este material?</span>
              <button type="button" onClick={excluir} disabled={excluindo} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-60" style={{ background: "#A3302A", color: "#fff" }}>
                <Trash2 className="h-4 w-4" aria-hidden /> {excluindo ? "Excluindo…" : "Confirmar"}
              </button>
              <button type="button" onClick={() => setConfirmar(false)} className="text-sm" style={{ color: "var(--color-text-muted)" }}>Cancelar</button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
