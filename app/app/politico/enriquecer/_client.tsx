"use client";

/**
 * Enriquecimento do mandato — tela da FASE 2: dispara a busca, mostra os achados
 * nos 2 baldes, e você APROVA item a item (com a fonte à vista). O aprovado do
 * balde 🟢 entra no conhecimento do agente; o 🔵 fica só interno.
 */
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Search, Loader2, Globe, ShieldCheck, EyeOff, Check, Plus } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { Button } from "@/components/ui/button";
import { pesquisarMandatoAtual, aplicarEnriquecimento } from "@/app/actions/politico/enriquecer-mandato";
import type { AchadoEnriquecimento } from "@/lib/politico/pesquisar-mandato";

export default function EnriquecerClient() {
  const [achados, setAchados] = useState<AchadoEnriquecimento[] | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, startBusca] = useTransition();
  const [aplicando, startAplicar] = useTransition();

  function pesquisar() {
    setErro(null);
    setAchados(null);
    setSel(new Set());
    startBusca(async () => {
      const r = await pesquisarMandatoAtual();
      if (!r.ok) return setErro(r.erro);
      setAchados(r.achados);
      // Pré-seleciona o balde do cidadão (factual); o da equipe (sensível) entra por escolha.
      setSel(new Set(r.achados.map((a, i) => (a.balde === "cidadao" ? i : -1)).filter((i) => i >= 0)));
    });
  }

  function toggle(i: number) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  function acrescentar() {
    if (!achados || sel.size === 0) return;
    const aprovados = [...sel].map((i) => achados[i]!);
    startAplicar(async () => {
      const r = await aplicarEnriquecimento(aprovados);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(`${r.acrescentados} ite${r.acrescentados === 1 ? "m" : "ns"} acrescentado(s) à inteligência do mandato.`);
      setAchados(null);
      setSel(new Set());
    });
  }

  const indices = (achados ?? []).map((a, i) => ({ a, i }));
  const cidadao = indices.filter((x) => x.a.balde === "cidadao");
  const equipe = indices.filter((x) => x.a.balde === "equipe");

  return (
    <div className="gip-ambient-bg mx-auto max-w-[900px] px-4 py-7 space-y-5">
      <CommandHero
        eyebrow="Inteligência · Enriquecimento"
        titulo="Aprofundar o mandato"
        subtitulo="A inteligência busca, na fonte oficial do seu mandato, o que ainda não foi preenchido — e separa o que o cidadão pode saber do que é só da equipe."
      />

      <div className="gip-glass flex flex-col items-start gap-3 p-5">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Busca na <strong>Câmara/Assembleia</strong> do seu mandato + <strong>TSE</strong> + notícias locais. Nada entra sem você aprovar.
        </p>
        <Button onClick={pesquisar} disabled={buscando || aplicando}>
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {buscando ? "Pesquisando na web…" : achados ? "Pesquisar de novo" : "Pesquisar o mandato"}
        </Button>
        {buscando && (
          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Pode levar até 1 minuto — ela está lendo as fontes oficiais.</p>
        )}
      </div>

      {erro && <div className="gip-glass p-4 text-sm" style={{ color: "#E08079" }}>{erro}</div>}

      {achados && achados.length === 0 && !erro && (
        <div className="gip-glass p-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Não encontrei nada confiável com fonte. (Normal para mandatos novos ou com pouca pegada pública.)
        </div>
      )}

      {cidadao.length > 0 && (
        <Balde titulo="Para a IA atender o cidadão" sub="Factual e seguro — entra no conhecimento do agente. Confira a fonte e aprove." cor="#34D399" Icone={ShieldCheck} itens={cidadao} sel={sel} onToggle={toggle} />
      )}
      {equipe.length > 0 && (
        <Balde titulo="Inteligência para a equipe" sub="Sensível/estratégico — fica só interno, nunca no que o cidadão vê. Aprove com cuidado." cor="#5CC9F2" Icone={EyeOff} itens={equipe} sel={sel} onToggle={toggle} />
      )}

      {achados && achados.length > 0 && (
        <div className="gip-glass sticky bottom-3 flex items-center justify-between gap-3 p-4">
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            <strong style={{ color: "var(--color-text)" }}>{sel.size}</strong> de {achados.length} selecionado(s).
          </span>
          <Button onClick={acrescentar} disabled={aplicando || sel.size === 0}>
            {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Acrescentar ao mandato
          </Button>
        </div>
      )}
    </div>
  );
}

function Balde({
  titulo, sub, cor, Icone, itens, sel, onToggle,
}: {
  titulo: string; sub: string; cor: string; Icone: typeof Globe;
  itens: { a: AchadoEnriquecimento; i: number }[];
  sel: Set<number>; onToggle: (i: number) => void;
}) {
  return (
    <div className="gip-glass p-5">
      <div className="mb-1 flex items-center gap-2">
        <Icone className="h-4 w-4" style={{ color: cor }} aria-hidden />
        <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>{titulo}</h2>
        <span className="rounded-full px-2 text-xs font-semibold" style={{ background: `color-mix(in srgb, ${cor} 18%, transparent)`, color: cor }}>{itens.length}</span>
      </div>
      <p className="mb-3 text-xs" style={{ color: "var(--color-text-subtle)" }}>{sub}</p>
      <ul className="space-y-2.5">
        {itens.map(({ a, i }) => {
          const on = sel.has(i);
          return (
            <li key={i} className="flex gap-3 rounded-xl p-3 transition-colors"
              style={{ background: on ? `color-mix(in srgb, ${cor} 10%, transparent)` : "color-mix(in srgb, var(--color-text) 4%, transparent)", border: `1px solid ${on ? `color-mix(in srgb, ${cor} 40%, transparent)` : "transparent"}` }}>
              <button type="button" onClick={() => onToggle(i)} role="checkbox" aria-checked={on}
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md transition-all"
                style={{ background: on ? cor : "transparent", border: `1.5px solid ${on ? cor : "var(--color-text-subtle)"}` }}>
                {on && <Check className="h-3 w-3" style={{ color: "#0B1220" }} aria-hidden />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{a.titulo}</p>
                <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>{a.resumo}</p>
                {a.fonte && (
                  <a href={a.fonte} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] underline-offset-2 hover:underline" style={{ color: cor }}>
                    <Globe className="h-3 w-3" aria-hidden /> fonte
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
