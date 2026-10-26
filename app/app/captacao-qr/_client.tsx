"use client";
/**
 * Captação por QR — a tela.
 *
 * Cria pontos de captação (praça, escola, evento, bio) e mostra, pra cada um, o
 * QR + o link wa.me pronto. A pessoa escaneia, manda a mensagem, e cai no funil
 * recebendo o material — sem link pra clicar. Premium e didática.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { CommandHero } from "@/components/politico/command-hero";
import { KpiCard } from "@/components/politico/kpi-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/hooks/i18n/useT";
import { montarLinkWaMe, textoDoEnvio } from "@/lib/politico/qr-link";
import { QrCode, Megaphone, UserPlus, BookOpen, Trash2, Copy, Check, Download } from "lucide-react";

interface Material {
  id: string;
  titulo: string;
}
interface Canal {
  id: string;
  numero: string | null;
  rotulo: string;
  conectado: boolean;
}
interface Origem {
  id: string;
  nome: string;
  codigo: string;
  material_id: string | null;
  channel_session_id: string | null;
  mensagem: string;
  ativo: boolean;
  cadastros: number;
  materiais_entregues: number;
}

const MENSAGEM_PADRAO = "Olá! Me cadastrei e quero receber os materiais e novidades.";

export function CaptacaoQrClient({ materiais, canais }: { materiais: Material[]; canais: Canal[] }) {
  const t = useT();
  const canalPadrao = canais.find((c) => c.conectado) ?? canais[0];

  const [origens, setOrigens] = useState<Origem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [materialId, setMaterialId] = useState<string>(materiais[0]?.id ?? "");
  const [canalId, setCanalId] = useState<string>(canalPadrao?.id ?? "");
  const [mensagem, setMensagem] = useState(MENSAGEM_PADRAO);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/v1/qr-origens", { credentials: "same-origin" });
      const j = await r.json();
      setOrigens((j?.data ?? []) as Origem[]);
    } catch {
      setErro(t("Não consegui carregar as origens."));
    } finally {
      setCarregando(false);
    }
  }, [t]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function criar() {
    if (!nome.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/v1/qr-origens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          nome: nome.trim(),
          mensagem: mensagem.trim() || MENSAGEM_PADRAO,
          material_id: materialId || null,
          channel_session_id: canalId || null,
        }),
      });
      if (!r.ok) throw new Error("falha");
      const j = await r.json();
      setOrigens((prev) => [j.data as Origem, ...prev]);
      setNome("");
      setMensagem(MENSAGEM_PADRAO);
    } catch {
      setErro(t("Não consegui criar o ponto de captação."));
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(id: string, nomeOrigem: string) {
    if (!window.confirm(`${t("Apagar o ponto")} “${nomeOrigem}”?\n${t("O QR e o link param de funcionar.")}`)) return;
    await fetch(`/api/v1/qr-origens/${id}`, { method: "DELETE", credentials: "same-origin" });
    setOrigens((prev) => prev.filter((o) => o.id !== id));
  }

  async function alternarAtivo(o: Origem) {
    const novo = !o.ativo;
    setOrigens((prev) => prev.map((x) => (x.id === o.id ? { ...x, ativo: novo } : x)));
    await fetch(`/api/v1/qr-origens/${o.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ativo: novo }),
    });
  }

  const numeroDe = useCallback(
    (o: Origem): string | null => {
      const doCanal = canais.find((c) => c.id === o.channel_session_id)?.numero;
      return doCanal ?? canalPadrao?.numero ?? null;
    },
    [canais, canalPadrao],
  );

  const kpis = useMemo(() => {
    const totalCad = origens.reduce((s, o) => s + o.cadastros, 0);
    const totalEnt = origens.reduce((s, o) => s + o.materiais_entregues, 0);
    const ativos = origens.filter((o) => o.ativo).length;
    return { pontos: origens.length, ativos, cadastros: totalCad, entregues: totalEnt };
  }, [origens]);

  const semNumero = canais.length === 0 || !canalPadrao?.numero;

  return (
    <div className="mx-auto max-w-[1140px] space-y-[18px] px-4 py-7" style={{ background: "var(--color-bg)" }}>
      <CommandHero
        eyebrow="Operação · Captação"
        titulo="Captação por QR"
        subtitulo="Gere um QR (e um link) por lugar. A pessoa escaneia, manda a mensagem pronta e recebe o material na hora — sem link pra clicar, risco de bloqueio quase zero."
      />

      {origens.length > 0 && (
        <div className="wr-anim-in grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label={t("Pontos de captação")} valor={kpis.pontos} icone={QrCode} />
          <KpiCard label={t("Ativos")} valor={kpis.ativos} icone={Megaphone} cor="#4ADE80" />
          <KpiCard label={t("Cadastros")} valor={kpis.cadastros} icone={UserPlus} />
          <KpiCard label={t("Materiais entregues")} valor={kpis.entregues} icone={BookOpen} />
        </div>
      )}

      {semNumero && (
        <div className="wr-card p-4" style={{ borderColor: "rgba(250,204,21,0.4)", background: "rgba(250,204,21,0.06)" }}>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {t("Conecte um número de WhatsApp primeiro — o QR precisa apontar pra ele.")}
          </p>
        </div>
      )}

      {/* Novo ponto */}
      <section className="wr-card wr-anim-in space-y-4 p-5 sm:p-6">
        <h2 className="font-heading text-[16px] font-bold" style={{ color: "var(--color-text)" }}>
          {t("Novo ponto de captação")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
              {t("Nome do lugar")}
            </span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={t("Ex.: Praça 7 de Setembro")}
              className="block w-full rounded-xl border px-4 py-3 text-sm"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
              {t("Material entregue")}
            </span>
            <select
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              className="block w-full rounded-xl border px-4 py-3 text-sm"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
            >
              <option value="">{t("Nenhum (só cadastra)")}</option>
              {materiais.map((m) => (
                <option key={m.id} value={m.id}>{m.titulo}</option>
              ))}
            </select>
          </label>
        </div>
        {canais.length > 1 && (
          <label className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
              {t("Número que recebe")}
            </span>
            <select
              value={canalId}
              onChange={(e) => setCanalId(e.target.value)}
              className="block w-full rounded-xl border px-4 py-3 text-sm"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
            >
              {canais.map((c) => (
                <option key={c.id} value={c.id}>{c.rotulo}{c.conectado ? "" : ` (${t("desconectado")})`}</option>
              ))}
            </select>
          </label>
        )}
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-subtle)" }}>
            {t("Mensagem que já vem escrita")}
          </span>
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={2}
            className="block w-full resize-y rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
          />
          <span className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            {t("A pessoa só aperta enviar. Um código discreto de rastreio entra no fim automaticamente.")}
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button className="wr-btn-dark px-6" disabled={salvando || !nome.trim() || semNumero} onClick={() => void criar()}>
            {salvando ? t("Criando…") : t("Criar ponto de captação")}
          </button>
          {erro && <span className="text-sm" style={{ color: "#F87171" }}>{erro}</span>}
        </div>
      </section>

      {/* Lista */}
      {carregando ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-56 w-full rounded-2xl" />)}
        </div>
      ) : origens.length === 0 ? (
        <div className="wr-card flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(215,243,106,0.12)" }}>
            <QrCode className="h-7 w-7" style={{ color: "var(--color-accent)" }} />
          </span>
          <p className="max-w-md text-sm" style={{ color: "var(--color-text-subtle)" }}>
            {t("Crie seu primeiro ponto acima. Imprima o QR e cole na praça, na escola, no evento — ou use o link na bio do Instagram.")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {origens.map((o, i) => (
            <CartaoOrigem
              key={o.id}
              origem={o}
              numero={numeroDe(o)}
              materialNome={materiais.find((m) => m.id === o.material_id)?.titulo ?? null}
              delay={Math.min(i, 8) * 0.04}
              onApagar={() => void apagar(o.id, o.nome)}
              onAlternar={() => void alternarAtivo(o)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoOrigem({
  origem,
  numero,
  materialNome,
  delay,
  onApagar,
  onAlternar,
  t,
}: {
  origem: Origem;
  numero: string | null;
  materialNome: string | null;
  delay: number;
  onApagar: () => void;
  onAlternar: () => void;
  t: (s: string) => string;
}) {
  const [copiado, setCopiado] = useState(false);
  const link = numero ? montarLinkWaMe(numero, origem.mensagem, origem.codigo) : "";
  const imagemUrl = `/api/v1/qr-origens/${origem.id}/imagem`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* clipboard bloqueado — ignora */
    }
  }

  return (
    <div className="wr-card wr-anim-in flex flex-col gap-3 p-5" style={{ animationDelay: `${delay}s`, opacity: origem.ativo ? 1 : 0.6 }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-heading text-[16px] font-bold" style={{ color: "var(--color-text)" }}>{origem.nome}</p>
          <p className="text-xs" style={{ color: "var(--color-text-subtle)" }}>
            {t("código")} <span className="font-mono font-semibold" style={{ color: "var(--color-text-muted)" }}>{origem.codigo}</span>
            {" · "}{origem.cadastros} {origem.cadastros === 1 ? t("cadastro") : t("cadastros")}
          </p>
        </div>
        <button type="button" onClick={onApagar} className="opacity-40 transition-opacity hover:opacity-100" title={t("Apagar")} aria-label={t("Apagar ponto")}>
          <Trash2 className="h-4 w-4" style={{ color: "#F87171" }} />
        </button>
      </div>

      <div className="flex gap-4">
        <div className="shrink-0 rounded-xl bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagemUrl} alt={`QR ${origem.nome}`} width={112} height={112} className="h-28 w-28" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          {materialNome && (
            <span className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(215,243,106,0.12)", color: "#8AA62E" }}>
              <BookOpen className="h-3 w-3" /> {materialNome}
            </span>
          )}
          <p className="text-xs leading-snug" style={{ color: "var(--color-text-subtle)" }}>
            “{textoDoEnvio(origem.mensagem, origem.codigo)}”
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copiar()} disabled={!link} className="wr-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
              {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiado ? t("Copiado!") : t("Copiar link")}
            </button>
            <a href={imagemUrl} download={`qr-${origem.codigo}.png`} className="wr-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> {t("Baixar QR")}
            </a>
          </div>
        </div>
      </div>

      <label className="mt-1 flex items-center gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
        <input type="checkbox" checked={origem.ativo} onChange={onAlternar} />
        {origem.ativo ? t("Ativo — recebendo cadastros") : t("Pausado — não recebe")}
      </label>
    </div>
  );
}
