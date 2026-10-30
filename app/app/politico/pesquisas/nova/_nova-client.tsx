"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { criarPesquisa } from "@/app/actions/politico/pesquisa-actions";

const TIPOS = [
  { value: "field", label: "Campo (WhatsApp / presencial)" },
  { value: "online", label: "Online" },
  { value: "phone", label: "Telefone" },
  { value: "door_to_door", label: "Porta a porta" },
];

export default function NovaPesquisaClient() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("field");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!title.trim()) { setErro("Informe um título."); return; }
    setErro(null);
    setSalvando(true);
    const r = await criarPesquisa({ title, description, type });
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    router.push(`/app/politico/pesquisas/${r.id}/editar`);
  }

  return (
    <div className="mx-auto max-w-[760px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Inteligência · Pesquisa"
        titulo="Nova pesquisa"
        subtitulo="Dê um título e a descrição. As perguntas você monta na próxima etapa."
        acoes={[{ href: "/app/politico/pesquisas", label: "← Pesquisas" }]}
      />

      <div className="wr-card space-y-4 p-5 sm:p-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Título da pesquisa</label>
          <input
            className="wr-input w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Prioridades do bairro — 2026"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Descrição <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>(aparece para quem vai responder)</span>
          </label>
          <textarea
            className="wr-input w-full"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explique rapidamente o objetivo da pesquisa."
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Como a pesquisa é aplicada</label>
          <select className="wr-input w-full" value={type} onChange={(e) => setType(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {erro && <p className="text-sm" style={{ color: "#E08079" }}>{erro}</p>}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || !title.trim()}
            className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {salvando ? "Criando…" : "Continuar → montar perguntas"}
          </button>
          <Link href="/app/politico/pesquisas" className="wr-btn">Cancelar</Link>
        </div>
      </div>
    </div>
  );
}
