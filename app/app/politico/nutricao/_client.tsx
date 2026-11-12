"use client";

/**
 * Nutrição mensal — três passos, na ordem em que o gabinete pensa:
 * 1) de qual número sai, 2) o que cada mensagem diz, 3) ligar.
 * Nasce desligada; o interruptor só destrava com número e textos salvos.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Lock, Plus, Power, Save, Trash2 } from "lucide-react";

import { ligarNutricao, salvarNutricao, type EstadoDaNutricao } from "@/app/actions/politico/nutricao-actions";
import { BannerAvisoTse, useAvisoTse } from "@/components/politico/aviso-tse";
import { CommandHero } from "@/components/politico/command-hero";

function CampoDoMes({ n, valor, onChange, onRemover, podeRemover }: { n: number; valor: string; onChange: (v: string) => void; onRemover: () => void; podeRemover: boolean }) {
  const aviso = useAvisoTse(valor);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`mes-${n}`} className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Mês {n}
        </label>
        <span className="flex items-center gap-3 text-xs tabular-nums" style={{ color: valor.trim().length > 600 ? "#B91C1C" : "var(--color-text-subtle)" }}>
          {valor.trim().length}/600
          {podeRemover && (
            <button type="button" onClick={onRemover} className="inline-flex items-center gap-1 underline underline-offset-2" aria-label={`Remover a mensagem do mês ${n}`}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> remover
            </button>
          )}
        </span>
      </div>
      <textarea id={`mes-${n}`} className="wr-input w-full" rows={4} value={valor} onChange={(e) => onChange(e.target.value)} />
      <BannerAvisoTse aviso={aviso} />
    </div>
  );
}

export default function NutricaoClient({ inicial }: { inicial: EstadoDaNutricao }) {
  const router = useRouter();
  const [textos, setTextos] = useState<string[]>(inicial.textos);
  const [canalId, setCanalId] = useState<string | null>(inicial.canalId);
  const [salvando, iniciarSalvar] = useTransition();
  const [virando, iniciarVirar] = useTransition();

  const mudou = canalId !== inicial.canalId || textos.length !== inicial.textos.length || textos.some((t, i) => t !== inicial.textos[i]);
  const textosValidos = textos.length > 0 && textos.every((t) => t.trim().length >= 20 && t.trim().length <= 600);
  const prontaParaLigar = inicial.publicada && !!inicial.canalId && !mudou;
  const canalEscolhido = inicial.canais.find((c) => c.id === inicial.canalId) ?? null;

  function salvar() {
    iniciarSalvar(async () => {
      const r = await salvarNutricao({ textos: textos.map((t) => t.trim()), canalId });
      if (!r.ok) { toast.error(r.erro); return; }
      toast.success("Textos e número salvos. A nutrição continua como estava (ligada ou desligada).");
      router.refresh();
    });
  }

  function virar(ligar: boolean) {
    iniciarVirar(async () => {
      const r = await ligarNutricao(ligar);
      if (!r.ok) { toast.error(r.erro); return; }
      toast.success(ligar ? "Nutrição ligada." : "Nutrição desligada. Ninguém novo entra na cadência.");
      router.refresh();
    });
  }

  return (
    <div className="gip-ambient-bg mx-auto max-w-[860px] space-y-6 px-4 py-7">
      <CommandHero
        eyebrow="Gabinete · Relacionamento"
        titulo="Nutrição mensal"
        subtitulo="Uma mensagem por mês para quem se aproximou do mandato. Você escolhe o número, escreve os textos e liga quando quiser."
        extra={
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
            style={inicial.ligada ? { background: "var(--hero-btn-bg)", color: "var(--hero-btn-fg)" } : { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}
          >
            <Power className="h-3.5 w-3.5" aria-hidden /> {inicial.ligada ? "Ligada" : "Desligada"}
          </span>
        }
      />

      <div className="gip-glass space-y-2 p-5 text-sm" style={{ color: "var(--color-text-muted)" }}>
        <p>
          <strong style={{ color: "var(--color-text)" }}>Quem recebe:</strong> só quem virar simpatizante <em>depois</em> que a nutrição for ligada
          (respondeu, participou, pediu o material). A base antiga não recebe nada por aqui.
        </p>
        <p>
          <strong style={{ color: "var(--color-text)" }}>Como sai:</strong> a primeira mensagem vai 30 dias depois de a pessoa entrar, e as seguintes de 30 em 30 dias.
          Quem pedir para sair para de receber na hora.
        </p>
        <p className="tabular-nums">
          <strong style={{ color: "var(--color-text)" }}>Já entraram na cadência:</strong> {inicial.jaEntraram} {inicial.jaEntraram === 1 ? "pessoa" : "pessoas"}.
        </p>
      </div>

      {/* 1. Número */}
      <section className="gip-glass space-y-3 p-5" aria-labelledby="passo-numero">
        <h2 id="passo-numero" className="text-base font-semibold" style={{ color: "var(--color-text)" }}>1. De qual número sai</h2>
        {inicial.canais.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Nenhum número de WhatsApp conectado. Conecte o número de Relacionamento em Conexões e volte aqui.
          </p>
        ) : (
          <>
            <select className="wr-input w-full" value={canalId ?? ""} onChange={(e) => setCanalId(e.target.value || null)} aria-label="Número da nutrição">
              <option value="">Nenhum (a nutrição fica desligada)</option>
              {inicial.canais.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rotulo}{c.funcionando ? "" : " — desconectado"}
                </option>
              ))}
            </select>
            <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
              O ideal é um número só para relacionamento, separado do número de atendimento: se um for bloqueado, o outro continua.
            </p>
          </>
        )}
      </section>

      {/* 2. Textos */}
      <section className="gip-glass space-y-4 p-5" aria-labelledby="passo-textos">
        <div>
          <h2 id="passo-textos" className="text-base font-semibold" style={{ color: "var(--color-text)" }}>2. O que cada mensagem diz</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>
            O texto sai exatamente como está escrito, igual para todos (sem nome da pessoa). Evite promessa e pedido de voto: o aviso vermelho aparece se o texto parecer com isso.
          </p>
        </div>
        {textos.map((t, i) => (
          <CampoDoMes
            key={i}
            n={i + 1}
            valor={t}
            onChange={(v) => setTextos((atual) => atual.map((x, j) => (j === i ? v : x)))}
            onRemover={() => setTextos((atual) => atual.filter((_, j) => j !== i))}
            podeRemover={textos.length > 1}
          />
        ))}
        {textos.length < 6 && (
          <button type="button" onClick={() => setTextos((atual) => [...atual, ""])} className="wr-btn inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" aria-hidden /> Mais um mês
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button type="button" onClick={salvar} disabled={salvando || (!mudou && inicial.publicada) || !textosValidos} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            {salvando ? "Salvando…" : "Salvar textos e número"}
          </button>
          {!textosValidos && <span className="text-xs" style={{ color: "#B91C1C" }}>Cada mensagem precisa ter entre 20 e 600 letras.</span>}
          {textosValidos && !mudou && inicial.publicada && <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>Tudo salvo.</span>}
        </div>
      </section>

      {/* 3. Interruptor */}
      <section className="gip-glass space-y-3 p-5" aria-labelledby="passo-ligar">
        <h2 id="passo-ligar" className="text-base font-semibold" style={{ color: "var(--color-text)" }}>3. Ligar</h2>
        {inicial.ligada ? (
          <>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              Ligada no número <strong style={{ color: "var(--color-text)" }}>{canalEscolhido?.rotulo ?? "escolhido"}</strong>. Desligar impede novas entradas; quem já está na cadência segue até o fim.
            </p>
            <button type="button" onClick={() => virar(false)} disabled={virando} className="wr-btn inline-flex items-center gap-2 disabled:opacity-60">
              {virando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Power className="h-4 w-4" aria-hidden />} Desligar a nutrição
            </button>
          </>
        ) : (
          <>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {prontaParaLigar
                ? "Número e textos salvos. Ao ligar, quem virar simpatizante daqui para a frente entra na cadência."
                : mudou
                  ? "Salve as mudanças acima antes de ligar."
                  : !inicial.publicada
                    ? "Salve os textos (passo 2) para destravar."
                    : "Escolha o número (passo 1) e salve para destravar."}
            </p>
            <button type="button" onClick={() => virar(true)} disabled={virando || !prontaParaLigar} className="wr-btn-dark inline-flex items-center gap-2 disabled:opacity-60">
              {virando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : prontaParaLigar ? <Power className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />} Ligar a nutrição
            </button>
          </>
        )}
        {canalEscolhido?.segurado && (
          <p className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "rgba(242,166,90,0.16)", color: "#8A5A00" }} role="status">
            Este número ainda está aguardando a liberação de go-live (aviso aberto na Central). Enquanto o aviso estiver aberto, as mensagens da nutrição ficam em espera e não saem.
          </p>
        )}
      </section>
    </div>
  );
}
