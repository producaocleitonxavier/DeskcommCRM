"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarCaptacaoConfig } from "@/app/actions/politico/captacaoConfig";
import type { CaptacaoConfig, Abrangencia } from "@/lib/politico/captacao-config";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const labelCls = "block text-xs font-semibold uppercase tracking-wide mb-1.5";
const inputCls =
  "w-full rounded-[12px] px-3.5 py-2.5 text-sm outline-none transition-colors";
const inputStyle: React.CSSProperties = {
  background: "var(--color-surface-elevated)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
};

function Campo({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className={labelCls} style={{ color: "var(--color-text-subtle)" }}>{label}</label>
      {children}
      {hint && <p className="text-[11px] mt-1" style={{ color: "var(--color-text-subtle)" }}>{hint}</p>}
    </div>
  );
}

export default function ConfigForm({ inicial }: { inicial: CaptacaoConfig }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const [ativo, setAtivo] = useState(inicial.ativo);
  const [estadoAlvo, setEstadoAlvo] = useState(inicial.estadoAlvo ?? "");
  const [cidadeAlvo, setCidadeAlvo] = useState(inicial.cidadeAlvo ?? "");
  const [abrangencia, setAbrangencia] = useState<Abrangencia>(inicial.abrangencia);
  const [cidadesExtra, setCidadesExtra] = useState(inicial.cidadesExtra.join("\n"));
  const [textoRespostaComentario, setTextoResposta] = useState(inicial.textoRespostaComentario);
  const [textoDmPesquisa, setTextoDmPesquisa] = useState(inicial.textoDmPesquisa);
  const [textoDmWhatsapp, setTextoDmWhatsapp] = useState(inicial.textoDmWhatsapp);
  const [textoDmEntrega, setTextoDmEntrega] = useState(inicial.textoDmEntrega);
  const [pedirWhatsappSoAlvo, setPedirWhatsappSoAlvo] = useState(inicial.pedirWhatsappSoAlvo);

  function salvar() {
    setMsg(null);
    startTransition(async () => {
      const r = await salvarCaptacaoConfig({
        ativo,
        estadoAlvo,
        cidadeAlvo,
        abrangencia,
        cidadesExtra: cidadesExtra.split(/[\n,]/).map((c) => c.trim()).filter(Boolean),
        textoRespostaComentario,
        textoDmPesquisa,
        textoDmWhatsapp,
        textoDmEntrega,
        pedirWhatsappSoAlvo,
      });
      if (r.ok) {
        setMsg({ tipo: "ok", texto: "Personalização salva! O Kanban já se adaptou ao seu alvo." });
        router.refresh();
      } else {
        setMsg({ tipo: "erro", texto: r.erro ?? "Falha ao salvar." });
      }
    });
  }

  const previa =
    abrangencia === "estado"
      ? estadoAlvo || "estado"
      : abrangencia === "cidade_rm"
        ? `${cidadeAlvo || "cidade"} + região`
        : cidadeAlvo || "cidade";

  return (
    <div className="space-y-5">
      {/* Região-alvo */}
      <section className="wr-card-dark p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-[17px] font-bold" style={{ color: "var(--color-text)" }}>
            Região-alvo do candidato
          </h2>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--color-text-muted)" }}>
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Captação ativa
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Estado (UF)">
            <select className={inputCls} style={inputStyle} value={estadoAlvo} onChange={(e) => setEstadoAlvo(e.target.value)}>
              <option value="">—</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </Campo>
          <Campo label="Cidade-alvo" hint="A cidade onde o candidato concorre (ex.: Belo Horizonte).">
            <input className={inputCls} style={inputStyle} value={cidadeAlvo} onChange={(e) => setCidadeAlvo(e.target.value)} placeholder="Belo Horizonte" />
          </Campo>
        </div>

        <Campo label="Abrangência do alvo">
          <div className="flex flex-col gap-2">
            {([
              ["cidade", "Só a cidade", "Qualifica apenas quem é da cidade-alvo."],
              ["cidade_rm", "Cidade + região metropolitana", "Inclui as cidades vizinhas listadas abaixo."],
              ["estado", "Todo o estado", "Qualifica qualquer pessoa do estado-alvo."],
            ] as [Abrangencia, string, string][]).map(([val, titulo, desc]) => (
              <label key={val} className="flex items-start gap-2.5 cursor-pointer rounded-[10px] px-3 py-2" style={{ background: abrangencia === val ? "color-mix(in srgb, var(--color-accent) 10%, transparent)" : "transparent", border: `1px solid ${abrangencia === val ? "color-mix(in srgb, var(--color-accent) 35%, transparent)" : "var(--color-border)"}` }}>
                <input type="radio" name="abr" className="mt-0.5" checked={abrangencia === val} onChange={() => setAbrangencia(val)} />
                <span>
                  <span className="text-sm font-semibold block" style={{ color: "var(--color-text)" }}>{titulo}</span>
                  <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>{desc}</span>
                </span>
              </label>
            ))}
          </div>
        </Campo>

        {abrangencia === "cidade_rm" && (
          <Campo label="Cidades da região metropolitana" hint="Uma por linha (ou separadas por vírgula). Contam como alvo junto com a cidade principal.">
            <textarea className={inputCls} style={{ ...inputStyle, minHeight: 90 }} value={cidadesExtra} onChange={(e) => setCidadesExtra(e.target.value)} placeholder={"Contagem\nBetim\nNova Lima"} />
          </Campo>
        )}

        <div className="text-sm rounded-[10px] px-3.5 py-2.5" style={{ background: "color-mix(in srgb, var(--color-accent) 10%, transparent)", color: "var(--color-text-muted)" }}>
          No Kanban, a coluna de qualificados vai aparecer como{" "}
          <strong style={{ color: "var(--color-accent)" }}>Qualificado {previa}</strong>.
        </div>
      </section>

      {/* Textos do flow */}
      <section className="wr-card-dark p-5 space-y-4">
        <h2 className="font-heading text-[17px] font-bold" style={{ color: "var(--color-text)" }}>
          Mensagens automáticas (o ManyChat)
        </h2>
        <Campo label="Resposta pública ao comentário" hint="Aparece como resposta ao comentário. Puxa a pessoa pro direct.">
          <input className={inputCls} style={inputStyle} value={textoRespostaComentario} onChange={(e) => setTextoResposta(e.target.value)} />
        </Campo>
        <Campo label="DM — pergunta da pesquisa" hint="Primeira DM. Pergunta de onde a pessoa fala.">
          <input className={inputCls} style={inputStyle} value={textoDmPesquisa} onChange={(e) => setTextoDmPesquisa(e.target.value)} />
        </Campo>
        <Campo label="DM — pedido de WhatsApp" hint="Enviada a quem confirma estar no alvo.">
          <input className={inputCls} style={inputStyle} value={textoDmWhatsapp} onChange={(e) => setTextoDmWhatsapp(e.target.value)} />
        </Campo>
        <Campo label="DM — entrega da isca (e-book)" hint="Enviada após capturar os dados. COLE O LINK do e-book aqui dentro do texto.">
          <input className={inputCls} style={inputStyle} value={textoDmEntrega} onChange={(e) => setTextoDmEntrega(e.target.value)} />
        </Campo>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--color-text-muted)" }}>
          <input type="checkbox" checked={pedirWhatsappSoAlvo} onChange={(e) => setPedirWhatsappSoAlvo(e.target.checked)} />
          Pedir WhatsApp só de quem está no alvo
        </label>
      </section>

      {msg && (
        <div
          className="text-sm rounded-[12px] px-4 py-3"
          style={{
            background: msg.tipo === "ok" ? "color-mix(in srgb, var(--color-accent) 14%, transparent)" : "color-mix(in srgb, #EF4444 14%, transparent)",
            color: msg.tipo === "ok" ? "var(--color-accent)" : "#EF4444",
          }}
        >
          {msg.texto}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={salvar}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-full px-6 py-3 text-[15px] font-bold transition-transform hover:scale-[1.02] disabled:opacity-60"
          style={{ background: "var(--color-accent)", color: "#1B2206" }}
        >
          {pending ? "Salvando…" : "Salvar personalização"}
        </button>
      </div>
    </div>
  );
}
