"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2, Check } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { criarPesquisa } from "@/app/actions/politico/pesquisa-actions";
import { TEMAS_PESQUISA } from "../_temas";

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
  const [theme, setTheme] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!title.trim()) { setErro("Informe um título."); return; }
    if (!theme) { setErro("Escolha o tema principal da pesquisa."); return; }
    setErro(null);
    setSalvando(true);
    const r = await criarPesquisa({ title, description, type, theme });
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    router.push(`/app/politico/pesquisas/${r.id}/editar`);
  }

  return (
    <div className="mx-auto max-w-[760px] px-4 py-7 space-y-6" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Inteligência · Pesquisa"
        titulo="Nova pesquisa"
        subtitulo="Dê um título, escolha o tema e a descrição. As perguntas você monta na próxima etapa."
        acoes={[{ href: "/app/politico/pesquisas", label: "← Pesquisas" }]}
      />

      <div className="wr-card space-y-5 p-5 sm:p-6">
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

        {/* Tema principal — seletor premium em grade */}
        <div>
          <label className="mb-1 block text-sm font-medium">Tema principal</label>
          <p className="mb-2.5 text-xs" style={{ color: "var(--color-text-subtle)" }}>
            É o assunto central da pesquisa. Ele guia as sugestões de perguntas e a leitura do resultado.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TEMAS_PESQUISA.map((t) => {
              const ativo = theme === t.v;
              return (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setTheme(t.v)}
                  className="relative flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
                  style={{
                    borderRadius: 10,
                    border: `1px solid ${ativo ? t.cor : "var(--color-border)"}`,
                    background: ativo ? `${t.cor}1A` : "var(--color-surface-elevated)",
                  }}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center"
                    style={{ borderRadius: 8, background: `${t.cor}26`, color: t.cor }}
                  >
                    <t.Icon size={17} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--color-text)" }}>{t.l}</span>
                    {t.tse && <span className="block text-[10px] font-semibold uppercase tracking-wide" style={{ color: t.cor }}>registro TSE</span>}
                  </span>
                  {ativo && <Check size={15} strokeWidth={3} style={{ color: t.cor }} />}
                </button>
              );
            })}
          </div>
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
            disabled={salvando || !title.trim() || !theme}
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
