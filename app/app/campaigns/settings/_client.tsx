"use client";
/**
 * Ajustes dos disparos (War Room 2.0, redesign premium + didático).
 *
 * Três coisas que valem para TODOS os disparos: a velocidade padrão, a janela de
 * resposta, os textos prontos e a lista de exclusão. Regra do cliente: já vem no
 * MODO SEGURO (velocidade Calmo + 72h), explicado em linguagem prática — o
 * usuário só mexe se quiser. A velocidade em cards é a MESMA das outras telas
 * (consistência): o número cru fica no Avançado.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { CommandHero } from "@/components/politico/command-hero";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useApagarTexto,
  useConfiguracaoDeCampanhas,
  useExclusoes,
  useExcluirNumero,
  useSalvarConfiguracao,
  useSalvarTexto,
  useTextosSalvos,
  useTirarDaExclusao,
} from "@/hooks/campanhas/useConfiguracao";
import { useT } from "@/hooks/i18n/useT";
import { Gauge, ChevronDown, Clock, BookText, UserX, CheckCircle2 } from "lucide-react";

const VELOCIDADES = [
  { id: "calmo", label: "Calmo", emoji: "🐢", desc: "Protege o número. Recomendado.", intervalo: 90, teto: 40 },
  { id: "normal", label: "Normal", emoji: "🚶", desc: "Equilíbrio entre rapidez e segurança.", intervalo: 45, teto: 150 },
  { id: "rapido", label: "Rápido", emoji: "🏃", desc: "Só com número aquecido.", intervalo: 20, teto: 400 },
] as const;

export function ConfiguracaoDeCampanhas() {
  const t = useT();
  return (
    <div className="mx-auto max-w-[760px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Operação · Comunicação"
        titulo="Ajustes dos disparos"
        subtitulo="O que vale para TODOS os disparos. Já vem no modo seguro — você só mexe se quiser."
        acoes={[{ href: "/app/campaigns", label: "← Disparos" }]}
      />
      <Padroes />
      <TextosSalvos />
      <ListaDeExclusao />
    </div>
  );
}

function Padroes() {
  const t = useT();
  const q = useConfiguracaoDeCampanhas();
  const salvar = useSalvarConfiguracao();
  const [atribuicao, setAtribuicao] = useState("72");
  const [velId, setVelId] = useState<string>("calmo");
  const [avancado, setAvancado] = useState(false);
  const [intervalo, setIntervalo] = useState("");
  const [tetoDia, setTetoDia] = useState("");
  const [tetoHora, setTetoHora] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    const c = q.data?.configuracao;
    if (!c || carregado) return;
    setAtribuicao(String(c.atribuicao_horas ?? 72));
    setIntervalo(txt(c.intervalo_segundos));
    setTetoDia(txt(c.teto_diario));
    setTetoHora(txt(c.teto_horario));
    setInicio(txt(c.janela_inicio_hora));
    setFim(txt(c.janela_fim_hora));
    setVelId(detectarVelocidade(c.intervalo_segundos, c.teto_diario));
    setCarregado(true);
  }, [q.data, carregado]);

  if (q.isLoading || !carregado) return <Skeleton className="h-72 w-full rounded-2xl" />;

  function salvarComVelocidade(novoVelId: string) {
    setVelId(novoVelId);
    const v = VELOCIDADES.find((x) => x.id === novoVelId);
    if (!v) return;
    setIntervalo(String(v.intervalo));
    setTetoDia(String(v.teto));
    setTetoHora("");
    salvar.mutate({
      atribuicao_horas: Number(atribuicao) || 72,
      intervalo_segundos: v.intervalo,
      teto_diario: v.teto,
      teto_horario: null,
      janela_inicio_hora: num(inicio),
      janela_fim_hora: num(fim),
    });
  }

  return (
    <section className="wr-card wr-anim-in space-y-5 p-5 sm:p-6" style={{ animationDelay: "0.04s" }}>
      <div className="flex items-center gap-2">
        <Gauge className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
        <h2 className="font-heading text-[18px] font-bold" style={{ color: "var(--color-text)" }}>{t("Velocidade padrão")}</h2>
      </div>
      <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
        {t("A velocidade com que todo disparo novo começa. Pode deixar mais devagar em cada disparo — nunca mais rápido que o número aguenta.")}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {VELOCIDADES.map((v) => {
          const ativo = velId === v.id;
          return (
            <button key={v.id} type="button" disabled={salvar.isPending} onClick={() => salvarComVelocidade(v.id)} className="wr-lift rounded-xl border p-3 text-left transition-colors disabled:opacity-60" style={ativo ? { borderColor: "var(--color-accent)", background: "rgba(215,243,106,0.08)" } : { borderColor: "var(--color-border)" }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{v.emoji}</span>
                <span className="font-heading text-sm font-bold" style={{ color: "var(--color-text)" }}>{t(v.label)}</span>
                {ativo && <CheckCircle2 className="ml-auto h-4 w-4" style={{ color: "var(--color-accent)" }} />}
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>{t(v.desc)}</p>
              <p className="mt-1.5 text-[11px] font-bold tabular-nums" style={{ color: ativo ? "var(--color-accent)" : "var(--color-text-muted)" }}>
                {t("até")} {v.teto}/{t("dia")} · 1 {t("a cada")} {v.intervalo}s
              </p>
            </button>
          );
        })}
      </div>

      {/* Janela de resposta */}
      <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" style={{ color: "var(--color-accent)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>{t("Até quando uma resposta conta como “respondeu ao disparo”?")}</span>
        </div>
        <div className="flex items-center gap-2">
          <input type="number" min={1} max={720} value={atribuicao} onChange={(e) => setAtribuicao(e.target.value)} className="wr-input" style={{ maxWidth: 110 }} />
          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("horas depois do envio")}</span>
        </div>
        <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
          {t("Se a pessoa responder depois desse prazo, o sistema trata como conversa nova (não como resposta ao disparo). 72h é um bom padrão.")}
        </p>
        <button className="wr-btn-dark mt-1 px-5" disabled={salvar.isPending} onClick={() => salvar.mutate({ atribuicao_horas: Number(atribuicao) || 72, intervalo_segundos: num(intervalo), teto_diario: num(tetoDia), teto_horario: num(tetoHora), janela_inicio_hora: num(inicio), janela_fim_hora: num(fim) })}>
          {salvar.isPending ? t("Salvando…") : t("Salvar janela de resposta")}
        </button>
        {salvar.isSuccess && !salvar.isPending && <span className="ml-2 text-sm" style={{ color: "#4ADE80" }}>{t("Salvo!")}</span>}
      </div>

      {/* Avançado */}
      <button type="button" onClick={() => setAvancado((v) => !v)} className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>
        <Gauge className="h-4 w-4" /> {t("Ajuste fino do ritmo (avançado)")}
        <ChevronDown className="h-4 w-4 transition-transform" style={{ transform: avancado ? "rotate(180deg)" : "none" }} />
      </button>
      {avancado && (
        <div className="wr-anim-in space-y-3">
          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            {t("Campo vazio = herda o número. A proteção do número inteiro fica em")}{" "}
            <Link href="/app/connections" className="underline" style={{ color: "var(--color-accent)" }}>{t("Conexões › Proteção de envio")}</Link>.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoNum id="p-int" rotulo={t("Intervalo mínimo (segundos)")} valor={intervalo} onChange={setIntervalo} dica={t("Tempo de espera entre uma mensagem e a próxima.")} />
            <CampoNum id="p-dia" rotulo={t("Máximo por dia")} valor={tetoDia} onChange={setTetoDia} dica={t("Teto de mensagens por dia.")} />
            <CampoNum id="p-hora" rotulo={t("Máximo por hora")} valor={tetoHora} onChange={setTetoHora} placeholder={t("sem limite")} dica={t("Em branco = vale só o teto do dia.")} />
            <div />
            <CampoNum id="p-ini" rotulo={t("Enviar só a partir das (hora)")} valor={inicio} onChange={setInicio} placeholder={t("ex.: 8")} dica={t("Em branco = sem restrição. Ex.: 8 = só a partir das 8h.")} />
            <CampoNum id="p-fim" rotulo={t("Parar de enviar às (hora)")} valor={fim} onChange={setFim} placeholder={t("ex.: 20")} dica={t("Em branco = sem restrição. Ex.: 20 = para às 20h.")} />
          </div>
          <button className="wr-btn-dark px-5" disabled={salvar.isPending} onClick={() => salvar.mutate({ atribuicao_horas: Number(atribuicao) || 72, intervalo_segundos: num(intervalo), teto_diario: num(tetoDia), teto_horario: num(tetoHora), janela_inicio_hora: num(inicio), janela_fim_hora: num(fim) })}>
            {salvar.isPending ? t("Salvando…") : t("Salvar ajuste fino")}
          </button>
        </div>
      )}
    </section>
  );
}

function TextosSalvos() {
  const t = useT();
  const q = useTextosSalvos();
  const salvar = useSalvarTexto();
  const apagar = useApagarTexto();
  const [nome, setNome] = useState("");
  const [corpo, setCorpo] = useState("");

  return (
    <section className="wr-card wr-anim-in space-y-4 p-5 sm:p-6" style={{ animationDelay: "0.08s" }}>
      <div className="flex items-center gap-2">
        <BookText className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
        <h2 className="font-heading text-[18px] font-bold" style={{ color: "var(--color-text)" }}>{t("Modelos de mensagem")}</h2>
      </div>
      <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
        {t("Textos prontos pra reusar em novos disparos, sem reescrever. Mudar aqui não altera disparo já enviado.")}
      </p>
      <div className="space-y-2">
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t("Nome do modelo. Ex.: Convite proteção digital")} className="wr-input" />
        <textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={4} placeholder={t("Escreva o texto…")} className="block w-full resize-y rounded-xl border px-4 py-3 text-sm" style={{ minHeight: 110, lineHeight: 1.55, background: "var(--color-surface)", borderColor: "var(--color-border)", color: "var(--color-text)" }} />
        <button className="wr-btn-dark px-5" disabled={nome.trim() === "" || corpo.trim() === "" || salvar.isPending} onClick={async () => { await salvar.mutateAsync({ name: nome.trim(), body: corpo.trim() }); setNome(""); setCorpo(""); }}>
          {salvar.isPending ? t("Salvando…") : t("Salvar modelo")}
        </button>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
        {(q.data ?? []).map((texto) => (
          <div key={texto.id} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="font-heading text-sm font-bold" style={{ color: "var(--color-text)" }}>{texto.name}</p>
              <p className="truncate text-sm" style={{ color: "var(--color-text-subtle)" }}>{texto.body}</p>
            </div>
            <button className="wr-btn text-xs" disabled={apagar.isPending} onClick={() => apagar.mutate(texto.id)}>{t("Apagar")}</button>
          </div>
        ))}
        {(q.data ?? []).length === 0 && !q.isLoading && <p className="py-2 text-sm" style={{ color: "var(--color-text-subtle)" }}>{t("Nenhum modelo salvo ainda.")}</p>}
      </div>
    </section>
  );
}

function ListaDeExclusao() {
  const t = useT();
  const q = useExclusoes();
  const excluir = useExcluirNumero();
  const tirar = useTirarDaExclusao();
  const [telefone, setTelefone] = useState("");
  const [motivo, setMotivo] = useState("");

  return (
    <section className="wr-card wr-anim-in space-y-4 p-5 sm:p-6" style={{ animationDelay: "0.12s" }}>
      <div className="flex items-center gap-2">
        <UserX className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
        <h2 className="font-heading text-[18px] font-bold" style={{ color: "var(--color-text)" }}>{t("Números que nunca recebem disparo")}</h2>
      </div>
      <p className="text-sm" style={{ color: "var(--color-text-subtle)" }}>
        {t("Decisão sua (ex.: imprensa, adversário, número interno). Diferente de quem pediu para sair: aqui, se a pessoa escrever, o atendimento responde normal.")}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>{t("Telefone (com DDI e DDD)")}</span>
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="+5531999990000" className="wr-input" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>{t("Motivo (opcional)")}</span>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className="wr-input" />
        </label>
      </div>
      <button className="wr-btn-dark px-5" disabled={telefone.trim() === "" || excluir.isPending} onClick={async () => { await excluir.mutateAsync({ address: telefone.trim(), reason: motivo.trim() || null }); setTelefone(""); setMotivo(""); }}>
        {excluir.isPending ? t("Salvando…") : t("Adicionar à lista")}
      </button>
      <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
        {(q.data ?? []).map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span style={{ color: "var(--color-text)" }}>{t("termina em")} {e.address_tail ?? "—"}{e.reason ? ` · ${e.reason}` : ""}</span>
            <button className="wr-btn text-xs" disabled={tirar.isPending} onClick={() => tirar.mutate(e.id)}>{t("Tirar da lista")}</button>
          </div>
        ))}
        {(q.data ?? []).length === 0 && !q.isLoading && <p className="py-2 text-sm" style={{ color: "var(--color-text-subtle)" }}>{t("Nenhum número na lista.")}</p>}
      </div>
    </section>
  );
}

function CampoNum({ id, rotulo, valor, onChange, dica, placeholder }: { id: string; rotulo: string; valor: string; onChange: (v: string) => void; dica?: string; placeholder?: string }) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>{rotulo}</span>
      <input id={id} type="number" min={0} value={valor} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="wr-input" />
      {dica && <span className="block text-xs" style={{ color: "var(--color-text-subtle)" }}>{dica}</span>}
    </label>
  );
}

function detectarVelocidade(intervalo: number | null, teto: number | null): string {
  const v = VELOCIDADES.find((x) => x.intervalo === intervalo && x.teto === teto);
  if (v) return v.id;
  if (intervalo == null && teto == null) return "calmo";
  return "calmo";
}

function txt(valor: number | null): string {
  return valor === null || valor === undefined ? "" : String(valor);
}
function num(valor: string): number | null {
  const limpo = valor.trim();
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}
