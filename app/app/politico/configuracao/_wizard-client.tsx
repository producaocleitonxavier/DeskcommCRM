"use client";

/**
 * SETUP DO MANDATO — assistente de pré-configuração "liga e está pronto".
 *
 * ⚠️ ESQUELETO para validação visual (Passo 2 da generalização multi-mandato).
 * A navegação entre passos e os campos já funcionam (estado local); a GRAVAÇÃO e
 * a GERAÇÃO (conhecimento da IA + prompt + funil por tipo de mandato) entram
 * depois que o cliente aprovar o visual. Regra de ouro: simples a ponto de uma
 * idosa e uma criança fazerem, com layout premium.
 */

import { useState } from "react";
import {
  Landmark, Building2, Users, Flag, Check, ArrowLeft, ArrowRight,
  MessageCircle, Clock, AtSign, Globe, Sparkles, ShieldCheck,
} from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";

type TipoMandato = "vereador" | "prefeito" | "dep_estadual" | "dep_federal";

const TIPOS: { id: TipoMandato; Icon: typeof Landmark; titulo: string; onde: string; cargo: string }[] = [
  { id: "vereador", Icon: Landmark, titulo: "Vereador(a)", onde: "Câmara Municipal", cargo: "Vereador" },
  { id: "prefeito", Icon: Building2, titulo: "Prefeito(a)", onde: "Executivo municipal", cargo: "Prefeito" },
  { id: "dep_estadual", Icon: Users, titulo: "Deputado(a) Estadual", onde: "Assembleia Legislativa", cargo: "Deputado Estadual" },
  { id: "dep_federal", Icon: Flag, titulo: "Deputado(a) Federal", onde: "Câmara dos Deputados", cargo: "Deputado Federal" },
];

const PASSOS = ["Tipo de mandato", "Identidade", "Canais", "Atendimento", "Sobre o mandato"];

function Campo({ label, children, dica }: { label: string; children: React.ReactNode; dica?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--color-text)" }}>{label}</label>
      {children}
      {dica && <p className="mt-1 text-xs" style={{ color: "var(--color-text-subtle)" }}>{dica}</p>}
    </div>
  );
}

const inputCls = "wr-input w-full";

export default function SetupWizard({ inicial }: { inicial: { nome: string; cargo: string; cidade: string; subtitulo: string } }) {
  const [passo, setPasso] = useState(0);
  const [tipo, setTipo] = useState<TipoMandato | null>(null);
  const [nome, setNome] = useState(inicial.nome);
  const [cargo, setCargo] = useState(inicial.cargo);
  const [cidade, setCidade] = useState(inicial.cidade);
  const [uf, setUf] = useState("");
  const [subtitulo, setSubtitulo] = useState(inicial.subtitulo);
  const [whats, setWhats] = useState("");
  const [horario, setHorario] = useState("");
  const [insta, setInsta] = useState("");
  const [portal, setPortal] = useState("");
  const [orgaos, setOrgaos] = useState("");
  const [bio, setBio] = useState("");
  const [temas, setTemas] = useState("");

  const ultimo = PASSOS.length - 1;
  const podeAvancar = passo !== 0 || tipo !== null;

  function escolherTipo(t: TipoMandato) {
    setTipo(t);
    const meta = TIPOS.find((x) => x.id === t);
    if (meta && !cargo) setCargo(meta.cargo);
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-[18px] px-4 py-7">
      <CommandHero
        eyebrow="Gabinete · Configuração"
        titulo="Configuração do Mandato"
        subtitulo="Em poucos passos simples, deixamos o sistema pronto para o seu mandato. A sua equipe só preenche; a inteligência monta o resto."
        acoes={[{ href: "/app/politico", label: "← Gabinete" }]}
      />

      {/* Stepper */}
      <div className="wr-card p-4 sm:p-5">
        <div className="flex items-center gap-2 overflow-x-auto">
          {PASSOS.map((p, i) => {
            const feito = i < passo;
            const atual = i === passo;
            return (
              <div key={p} className="flex items-center gap-2 shrink-0">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors"
                  style={
                    feito
                      ? { background: "#D7F36A", color: "#16181D" }
                      : atual
                        ? { background: "#16181D", color: "#FFFFFF", border: "2px solid #D7F36A" }
                        : { background: "var(--color-surface-elevated)", color: "var(--color-text-subtle)" }
                  }
                >
                  {feito ? <Check size={16} /> : i + 1}
                </span>
                <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: atual ? "var(--color-text)" : "var(--color-text-subtle)" }}>
                  {p}
                </span>
                {i < ultimo && <span className="mx-1 h-px w-6" style={{ background: "var(--color-border)" }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Conteúdo do passo */}
      <div className="wr-card p-6 sm:p-7 min-h-[320px]">
        {passo === 0 && (
          <div>
            <h2 className="font-heading text-[22px] font-bold">Qual é o seu mandato?</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
              É só isto que muda a base do sistema — funil, modelos e o jeito de atender já vêm prontos para o seu caso.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {TIPOS.map(({ id, Icon, titulo, onde }) => {
                const sel = tipo === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => escolherTipo(id)}
                    className="flex items-center gap-3.5 rounded-[16px] p-4 text-left transition-transform hover:scale-[1.01]"
                    style={{
                      border: sel ? "2px solid #D7F36A" : "1px solid var(--color-border)",
                      background: sel ? "rgba(215,243,106,0.08)" : "var(--color-surface-elevated)",
                    }}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: sel ? "#D7F36A" : "rgba(215,243,106,0.12)", color: sel ? "#16181D" : "#8AA62E" }}>
                      <Icon size={22} />
                    </span>
                    <div>
                      <p className="text-base font-bold">{titulo}</p>
                      <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>{onde}</p>
                    </div>
                    {sel && <Check size={20} className="ml-auto" style={{ color: "#8AA62E" }} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {passo === 1 && (
          <div>
            <h2 className="font-heading text-[22px] font-bold">Identidade do mandato</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>Entra no timbre dos ofícios e no jeito que a IA se apresenta.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Campo label="Nome do parlamentar" dica="Nome completo, como assina os ofícios"><input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome que aparece no timbre" /></Campo>
              <Campo label="Cargo" dica="Já sugerido pelo tipo de mandato"><input className={inputCls} value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Cargo na assinatura" /></Campo>
              <Campo label="Cidade" dica="Base do mandato"><input className={inputCls} value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Sua cidade" /></Campo>
              <Campo label="Estado (UF)" dica="Sigla de 2 letras"><input className={inputCls} value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="Ex.: SP, MG, RJ…" /></Campo>
              <div className="sm:col-span-2"><Campo label="Subtítulo" dica="Lema ou área de atuação (opcional)"><input className={inputCls} value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} placeholder="Linha de apoio no cabeçalho" /></Campo></div>
            </div>
          </div>
        )}

        {passo === 2 && (
          <div>
            <h2 className="font-heading text-[22px] font-bold">Canais do gabinete</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>Por onde o cidadão fala com o mandato.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Campo label="WhatsApp do gabinete" dica="Número que atende o cidadão"><div className="flex items-center gap-2"><MessageCircle size={18} style={{ color: "#8AA62E" }} /><input className={inputCls} value={whats} onChange={(e) => setWhats(e.target.value)} placeholder="(00) 00000-0000" /></div></Campo>
              <Campo label="Horário de atendimento" dica="Quando a equipe responde"><div className="flex items-center gap-2"><Clock size={18} style={{ color: "#8AA62E" }} /><input className={inputCls} value={horario} onChange={(e) => setHorario(e.target.value)} placeholder="Ex.: seg a sex, 8h às 18h" /></div></Campo>
              <div className="sm:col-span-2"><Campo label="Instagram (opcional)" dica="Perfil oficial do mandato"><div className="flex items-center gap-2"><AtSign size={18} style={{ color: "#8AA62E" }} /><input className={inputCls} value={insta} onChange={(e) => setInsta(e.target.value)} placeholder="@seuperfil" /></div></Campo></div>
            </div>
          </div>
        )}

        {passo === 3 && (
          <div>
            <h2 className="font-heading text-[22px] font-bold">Onde o cidadão resolve</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>A IA usa isto para orientar o cidadão ao caminho certo — e registrar o que é do gabinete.</p>
            <div className="mt-5 grid gap-4">
              <Campo label="Portal de serviços do seu município/estado" dica="O site onde o cidadão abre pedidos (zeladoria, serviços). A IA manda o link certo."><div className="flex items-center gap-2"><Globe size={18} style={{ color: "#8AA62E" }} /><input className={inputCls} value={portal} onChange={(e) => setPortal(e.target.value)} placeholder="Ex.: servicos.suacidade.gov.br" /></div></Campo>
              <Campo label="Principais órgãos para onde o gabinete encaminha" dica="Um por linha. Ex.: Secretaria de Obras, Saúde, Água/Esgoto, Ouvidoria."><textarea className={`${inputCls} min-h-[96px]`} value={orgaos} onChange={(e) => setOrgaos(e.target.value)} placeholder={"Secretaria de Obras\nSaúde\nÁgua e Esgoto\nOuvidoria"} /></Campo>
            </div>
          </div>
        )}

        {passo === 4 && (
          <div>
            <h2 className="font-heading text-[22px] font-bold">Sobre o mandato</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>Para a IA responder com a cara do mandato — sempre factual, nunca campanha.</p>
            <div className="mt-5 grid gap-4">
              <Campo label="Breve biografia (factual)" dica="Quem é o parlamentar, formação, bandeiras — sem pedir voto."><textarea className={`${inputCls} min-h-[96px]`} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Ex.: Fulano é professor, atua na área de educação e segurança…" /></Campo>
              <Campo label="Temas de atuação" dica="Separe por vírgula."><input className={inputCls} value={temas} onChange={(e) => setTemas(e.target.value)} placeholder="Ex.: educação, segurança, saúde, infância" /></Campo>
            </div>

            {/* Prévia do que será gerado */}
            <div className="mt-6 rounded-[14px] p-4" style={{ border: "1px solid rgba(215,243,106,0.3)", background: "rgba(215,243,106,0.06)" }}>
              <div className="flex items-center gap-2">
                <Sparkles size={18} style={{ color: "#8AA62E" }} />
                <p className="text-sm font-bold">Quando você concluir, o sistema monta sozinho:</p>
              </div>
              <ul className="mt-2 grid gap-1.5 text-[13px] sm:grid-cols-2" style={{ color: "var(--color-text-muted)" }}>
                <li className="flex items-center gap-2"><Check size={14} style={{ color: "#8AA62E" }} /> O conhecimento que a IA usa pra atender</li>
                <li className="flex items-center gap-2"><Check size={14} style={{ color: "#8AA62E" }} /> O timbre do ofício com a sua identidade</li>
                <li className="flex items-center gap-2"><Check size={14} style={{ color: "#8AA62E" }} /> O funil e os modelos do seu tipo de mandato</li>
                <li className="flex items-center gap-2"><ShieldCheck size={14} style={{ color: "#8AA62E" }} /> A blindagem jurídica já ativa</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Navegação */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPasso((p) => Math.max(0, p - 1))}
          disabled={passo === 0}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-opacity disabled:opacity-40"
          style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
        >
          <ArrowLeft size={16} /> Voltar
        </button>
        {passo < ultimo ? (
          <button
            type="button"
            onClick={() => podeAvancar && setPasso((p) => Math.min(ultimo, p + 1))}
            disabled={!podeAvancar}
            className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "#D7F36A", color: "#16181D" }}
          >
            Avançar <ArrowRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
            style={{ background: "#D7F36A", color: "#16181D" }}
            title="Esqueleto — a geração entra depois da sua validação"
          >
            <Check size={16} /> Concluir configuração
          </button>
        )}
      </div>

      <p className="text-center text-[11px]" style={{ color: "var(--color-text-subtle)" }}>
        Pré-visualização do assistente · a gravação e a geração automática entram após a sua validação do visual.
      </p>
    </div>
  );
}
