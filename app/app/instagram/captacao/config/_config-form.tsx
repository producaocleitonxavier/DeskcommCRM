"use client";

/**
 * Setup GUIADO da Captação do Instagram — "à prova de criança" (regra de ouro).
 *
 * 4 blocos simples, tudo pré-preenchido: (1) quem você é, (2) sua região-alvo,
 * (3) sua mensagem, (4) seu material. O que é técnico (respostas extras, cidades
 * da região, opções finas) fica recolhido em "Avançado". Sem jargão: nada de
 * "flow", "trigger", "abrangência", "ManyChat". Reusa a mesma config por org.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Megaphone, MapPin, MessageCircle, Gift, Check, LinkIcon } from "lucide-react";
import { salvarCaptacaoConfig } from "@/app/actions/politico/captacaoConfig";
import type { CaptacaoConfig, Abrangencia } from "@/lib/politico/captacao-config";

const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

type Cargo = "vereador" | "prefeito" | "dep_estadual" | "dep_federal";
const CARGOS: { id: Cargo; titulo: string; desc: string; escopo: "cidade" | "estado" }[] = [
  { id: "vereador", titulo: "Vereador(a)", desc: "Alvo é a sua cidade", escopo: "cidade" },
  { id: "prefeito", titulo: "Prefeito(a)", desc: "Alvo é a sua cidade", escopo: "cidade" },
  { id: "dep_estadual", titulo: "Deputado(a) Estadual", desc: "Alvo é o seu estado", escopo: "estado" },
  { id: "dep_federal", titulo: "Deputado(a) Federal", desc: "Alvo é o seu estado", escopo: "estado" },
];

const inputCls = "w-full rounded-[12px] px-3.5 py-2.5 text-sm outline-none transition-colors";
const inputStyle: React.CSSProperties = {
  background: "var(--color-surface-elevated)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
};

function Bloco({ n, icone: Icone, titulo, children }: { n: number; icone: typeof MapPin; titulo: string; children: React.ReactNode }) {
  return (
    <section className="wr-card p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold" style={{ background: "rgba(215,243,106,0.14)", color: "#D7F36A" }}>
          {n}
        </span>
        <h2 className="flex items-center gap-2 font-heading text-[17px] font-bold" style={{ color: "var(--color-text)" }}>
          <Icone className="h-4 w-4" style={{ color: "var(--color-text-subtle)" }} aria-hidden /> {titulo}
        </h2>
      </div>
      {children}
    </section>
  );
}

export default function ConfigForm({ inicial }: { inicial: CaptacaoConfig }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [ativo, setAtivo] = useState(inicial.ativo);
  const [estadoAlvo, setEstadoAlvo] = useState(inicial.estadoAlvo ?? "MG");
  const [cidadeAlvo, setCidadeAlvo] = useState(inicial.cidadeAlvo ?? "");
  // Cargo inferido da abrangência salva (estado → deputado; senão → vereador).
  const [cargo, setCargo] = useState<Cargo>(inicial.abrangencia === "estado" ? "dep_estadual" : "vereador");
  const [incluirRegiao, setIncluirRegiao] = useState(inicial.abrangencia === "cidade_rm");
  const [cidadesExtra, setCidadesExtra] = useState(inicial.cidadesExtra.join("\n"));
  const [textoRespostaComentario, setTextoResposta] = useState(inicial.textoRespostaComentario);
  const [textoRespostaComentarioRetorno, setTextoRespostaRetorno] = useState(inicial.textoRespostaComentarioRetorno);
  const [textoDmPesquisa, setTextoDmPesquisa] = useState(inicial.textoDmPesquisa);
  const [textoDmWhatsapp, setTextoDmWhatsapp] = useState(inicial.textoDmWhatsapp);
  const [textoDmEntrega, setTextoDmEntrega] = useState(inicial.textoDmEntrega);
  const [textoDmRetorno, setTextoDmRetorno] = useState(inicial.textoDmRetorno);
  const [linkMaterial, setLinkMaterial] = useState(inicial.linkMaterial ?? "");
  const [pedirWhatsappSoAlvo, setPedirWhatsappSoAlvo] = useState(inicial.pedirWhatsappSoAlvo);
  const [avancado, setAvancado] = useState(false);

  const escopo = CARGOS.find((c) => c.id === cargo)?.escopo ?? "cidade";

  function abrangenciaFinal(): Abrangencia {
    if (escopo === "estado") return "estado";
    return incluirRegiao ? "cidade_rm" : "cidade";
  }

  const previa =
    escopo === "estado"
      ? estadoAlvo || "seu estado"
      : incluirRegiao
        ? `${cidadeAlvo || "sua cidade"} + região`
        : cidadeAlvo || "sua cidade";

  function salvar() {
    setMsg(null);
    startTransition(async () => {
      const r = await salvarCaptacaoConfig({
        ativo,
        estadoAlvo,
        cidadeAlvo,
        abrangencia: abrangenciaFinal(),
        cidadesExtra: cidadesExtra.split(/[\n,]/).map((c) => c.trim()).filter(Boolean),
        textoRespostaComentario,
        textoRespostaComentarioRetorno,
        textoDmPesquisa,
        textoDmWhatsapp,
        textoDmEntrega,
        textoDmRetorno,
        linkMaterial,
        pedirWhatsappSoAlvo,
      });
      if (r.ok) {
        setMsg({ tipo: "ok", texto: "Tudo salvo! Sua captação já está do seu jeito." });
        router.refresh();
      } else {
        setMsg({ tipo: "erro", texto: r.erro ?? "Falha ao salvar." });
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Liga/desliga em destaque */}
      <section className="wr-card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-heading text-[17px] font-bold" style={{ color: "var(--color-text)" }}>Captação {ativo ? "ligada" : "desligada"}</h2>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {ativo ? "Quem comentar vira lead e recebe sua mensagem automaticamente." : "Ligue para começar a captar quem interage."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAtivo((v) => !v)}
          className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors"
          style={{ background: ativo ? "#D7F36A" : "var(--color-border)" }}
          aria-pressed={ativo}
        >
          <span className="inline-block h-6 w-6 rounded-full bg-white transition-transform" style={{ transform: ativo ? "translateX(26px)" : "translateX(4px)" }} />
        </button>
      </section>

      {/* 1. Quem você é */}
      <Bloco n={1} icone={Megaphone} titulo="Quem você é?">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {CARGOS.map((c) => {
            const on = cargo === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCargo(c.id)}
                className="rounded-[14px] p-3 text-left transition-colors"
                style={{ background: on ? "rgba(215,243,106,0.12)" : "var(--color-surface-elevated)", border: `1px solid ${on ? "rgba(215,243,106,0.5)" : "var(--color-border)"}` }}
              >
                <span className="block text-sm font-bold" style={{ color: "var(--color-text)" }}>{c.titulo}</span>
                <span className="mt-0.5 block text-[11px]" style={{ color: "var(--color-text-subtle)" }}>{c.desc}</span>
              </button>
            );
          })}
        </div>
      </Bloco>

      {/* 2. Sua região-alvo */}
      <Bloco n={2} icone={MapPin} titulo="Qual a sua região-alvo?">
        {escopo === "estado" ? (
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Estado</label>
            <select className={inputCls} style={inputStyle} value={estadoAlvo} onChange={(e) => setEstadoAlvo(e.target.value)}>
              <option value="">Escolha…</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Sua cidade</label>
                <input className={inputCls} style={inputStyle} value={cidadeAlvo} onChange={(e) => setCidadeAlvo(e.target.value)} placeholder="Ex.: Belo Horizonte" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Estado</label>
                <select className={inputCls} style={inputStyle} value={estadoAlvo} onChange={(e) => setEstadoAlvo(e.target.value)}>
                  {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              <input type="checkbox" checked={incluirRegiao} onChange={(e) => setIncluirRegiao(e.target.checked)} />
              Incluir a região metropolitana (cidades vizinhas também contam)
            </label>
          </div>
        )}
        <p className="mt-3 rounded-[10px] px-3.5 py-2.5 text-sm" style={{ background: "rgba(215,243,106,0.1)", color: "var(--color-text-muted)" }}>
          Quem for de <strong style={{ color: "#D7F36A" }}>{previa}</strong> entra como <strong style={{ color: "#D7F36A" }}>qualificado</strong>. O resto recebe o material mesmo assim, num grupo à parte.
        </p>
      </Bloco>

      {/* 3. Sua mensagem */}
      <Bloco n={3} icone={MessageCircle} titulo="Sua mensagem (o que a pessoa recebe no direct)">
        <textarea className={inputCls} style={{ ...inputStyle, minHeight: 120 }} value={textoDmPesquisa} onChange={(e) => setTextoDmPesquisa(e.target.value)} />
        <p className="mt-2 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
          Dica: ofereça algo de valor (material gratuito todo mês) e peça estado, cidade, bairro e WhatsApp numa tacada. Use <code>{"{{username}}"}</code> pra chamar a pessoa pelo @.
        </p>
      </Bloco>

      {/* 4. Seu material */}
      <Bloco n={4} icone={Gift} titulo="O material que você entrega">
        <textarea className={inputCls} style={{ ...inputStyle, minHeight: 90 }} value={textoDmEntrega} onChange={(e) => setTextoDmEntrega(e.target.value)} />
        <p className="mt-2 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
          É isso que a pessoa recebe depois de responder. Onde está <code>{"{{link}}"}</code> entra, sozinho, o <strong>link do material</strong> — cole o link lá no <strong>Avançado</strong>, uma vez só.
        </p>
      </Bloco>

      {/* Avançado (recolhido) */}
      <section className="wr-card overflow-hidden p-0">
        <button type="button" onClick={() => setAvancado((v) => !v)} className="flex w-full items-center justify-between px-5 py-4 text-left">
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-muted)" }}>Avançado (mensagens extras e ajustes finos)</span>
          <ChevronDown className="h-5 w-5 transition-transform" style={{ color: "var(--color-text-subtle)", transform: avancado ? "rotate(180deg)" : "none" }} aria-hidden />
        </button>
        {avancado && (
          <div className="space-y-4 border-t px-5 py-4" style={{ borderColor: "var(--color-border)" }}>
            <div className="rounded-[12px] p-3.5" style={{ background: "rgba(215,243,106,0.08)", border: "1px solid rgba(215,243,106,0.25)" }}>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "#D7F36A" }}>
                <LinkIcon className="h-3.5 w-3.5" aria-hidden /> Link do material (ebook, PDF, vídeo)
              </label>
              <input
                className={inputCls}
                style={inputStyle}
                value={linkMaterial}
                onChange={(e) => setLinkMaterial(e.target.value)}
                placeholder="https://seusite.com.br/material.pdf"
                inputMode="url"
              />
              <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
                Cole o endereço <strong>uma vez</strong>. Ele entra sozinho na mensagem de entrega e na de retorno (onde está <code>{"{{link}}"}</code>). Trocou o material do mês? Troca só aqui.
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Resposta pública no comentário (1ª vez)</label>
              <input className={inputCls} style={inputStyle} value={textoRespostaComentario} onChange={(e) => setTextoResposta(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Resposta no comentário de quem JÁ é da sua base</label>
              <input className={inputCls} style={inputStyle} value={textoRespostaComentarioRetorno} onChange={(e) => setTextoRespostaRetorno(e.target.value)} />
              <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>Quem já respondeu antes vê esta — pra não parecer que você nunca falou com a pessoa.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Pedido de WhatsApp (se ainda faltar)</label>
              <input className={inputCls} style={inputStyle} value={textoDmWhatsapp} onChange={(e) => setTextoDmWhatsapp(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Mensagem de retorno (quem já é da base e comenta de novo)</label>
              <input className={inputCls} style={inputStyle} value={textoDmRetorno} onChange={(e) => setTextoDmRetorno(e.target.value)} />
            </div>
            {escopo === "cidade" && incluirRegiao && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>Cidades da região metropolitana</label>
                <textarea className={inputCls} style={{ ...inputStyle, minHeight: 80 }} value={cidadesExtra} onChange={(e) => setCidadesExtra(e.target.value)} placeholder={"Contagem\nBetim\nNova Lima"} />
                <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-subtle)" }}>Uma por linha. Contam como alvo junto com a cidade principal.</p>
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              <input type="checkbox" checked={pedirWhatsappSoAlvo} onChange={(e) => setPedirWhatsappSoAlvo(e.target.checked)} />
              Insistir no WhatsApp só de quem é da região-alvo
            </label>
          </div>
        )}
      </section>

      {msg && (
        <div className="rounded-[12px] px-4 py-3 text-sm" style={{ background: msg.tipo === "ok" ? "rgba(215,243,106,0.14)" : "rgba(239,68,68,0.14)", color: msg.tipo === "ok" ? "#D7F36A" : "#F87171" }}>
          {msg.texto}
        </div>
      )}

      <div className="sticky bottom-3 flex justify-end">
        <button
          onClick={salvar}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3 text-[15px] font-bold shadow-lg transition-transform hover:scale-[1.02] disabled:opacity-60"
          style={{ background: "#D7F36A", color: "#1B2206" }}
        >
          <Check className="h-4 w-4" aria-hidden /> {pending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
