"use client";

/**
 * Enriquecimento do mandato — TELA DE TESTE (fase 1): dispara a busca e mostra os
 * achados nos 2 baldes, só leitura. A fase 2 liga isto ao assistente e adiciona o
 * APROVAR item a item antes de entrar no RAG.
 */
import { useState, useTransition } from "react";
import { Search, Loader2, Globe, ShieldCheck, EyeOff } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import { Button } from "@/components/ui/button";
import { pesquisarMandatoAtual } from "@/app/actions/politico/enriquecer-mandato";
import type { AchadoEnriquecimento } from "@/lib/politico/pesquisar-mandato";

export default function EnriquecerClient() {
  const [achados, setAchados] = useState<AchadoEnriquecimento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, start] = useTransition();

  function pesquisar() {
    setErro(null);
    setAchados(null);
    start(async () => {
      const r = await pesquisarMandatoAtual();
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setAchados(r.achados);
    });
  }

  const cidadao = (achados ?? []).filter((a) => a.balde === "cidadao");
  const equipe = (achados ?? []).filter((a) => a.balde === "equipe");

  return (
    <div className="gip-ambient-bg mx-auto max-w-[900px] px-4 py-7 space-y-5">
      <CommandHero
        eyebrow="Inteligência · Enriquecimento"
        titulo="Aprofundar o mandato"
        subtitulo="A inteligência busca, na fonte oficial do seu mandato, o que ainda não foi preenchido — e separa o que o cidadão pode saber do que é só da equipe."
      />

      <div className="gip-glass flex flex-col items-start gap-3 p-5">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Busca na <strong>Câmara/Assembleia</strong> do seu mandato + <strong>TSE</strong> + notícias locais. Nada é salvo agora — é só a pesquisa.
        </p>
        <Button onClick={pesquisar} disabled={buscando}>
          {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {buscando ? "Pesquisando na web…" : "Pesquisar o mandato"}
        </Button>
        {buscando && (
          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            Pode levar até um minuto — ela está lendo as fontes oficiais.
          </p>
        )}
      </div>

      {erro && (
        <div className="gip-glass p-4 text-sm" style={{ color: "#E08079" }}>{erro}</div>
      )}

      {achados && achados.length === 0 && !erro && (
        <div className="gip-glass p-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Não encontrei nada confiável com fonte. (Normal para mandatos novos ou com pouca pegada pública.)
        </div>
      )}

      {cidadao.length > 0 && (
        <Balde
          titulo="Para a IA atender o cidadão"
          sub="Factual e seguro — entra no conhecimento do agente depois de você aprovar."
          cor="#34D399"
          Icone={ShieldCheck}
          itens={cidadao}
        />
      )}
      {equipe.length > 0 && (
        <Balde
          titulo="Inteligência para a equipe"
          sub="Sensível/estratégico — fica só interno, nunca no que o cidadão vê."
          cor="#5CC9F2"
          Icone={EyeOff}
          itens={equipe}
        />
      )}
    </div>
  );
}

function Balde({
  titulo, sub, cor, Icone, itens,
}: {
  titulo: string; sub: string; cor: string; Icone: typeof Globe; itens: AchadoEnriquecimento[];
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
        {itens.map((a, i) => (
          <li key={i} className="rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--color-text) 4%, transparent)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{a.titulo}</p>
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>{a.resumo}</p>
            {a.fonte && (
              <a href={a.fonte} target="_blank" rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[12px] underline-offset-2 hover:underline" style={{ color: cor }}>
                <Globe className="h-3 w-3" aria-hidden /> fonte
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
