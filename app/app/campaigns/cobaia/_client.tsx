"use client";

/**
 * Laboratório de disparo (cobaia) — visual e interação. À prova de criança:
 * um interruptor para o modo laboratório, um botão de pânico grande e vermelho, e
 * a lista de telefones-semente (os únicos que podem receber no modo cobaia).
 * Toda escrita passa pelas server actions; depois de cada uma, recarrega os dados.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, OctagonX, Play, Plus, Trash2, ShieldAlert, Phone } from "lucide-react";

import { CommandHero } from "@/components/politico/command-hero";
import {
  definirModoCobaia,
  definirPanico,
  adicionarSemente,
  removerSemente,
  type ResultadoCobaia,
} from "@/app/actions/politico/cobaia-actions";

export interface SementeView {
  id: string;
  telefone: string;
  rotulo: string | null;
}

const MENSAGEM_ERRO: Record<string, string> = {
  validation_failed: "Confira o telefone e tente de novo.",
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden_tenant: "Organização não encontrada.",
  forbidden_role: "Só um administrador pode operar o laboratório.",
  mfa_required: "Confirme o segundo fator para continuar.",
  erro_ao_gravar: "Não deu para gravar agora. Tente de novo.",
};

export default function CobaiaClient({
  modoCobaia,
  envioPausado,
  sementes,
}: {
  modoCobaia: boolean;
  envioPausado: boolean;
  sementes: SementeView[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [telefone, setTelefone] = useState("");
  const [rotulo, setRotulo] = useState("");

  function executar(fn: () => Promise<ResultadoCobaia>, aoConcluir?: () => void) {
    setErro(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setErro(MENSAGEM_ERRO[r.error] ?? "Algo deu errado.");
        return;
      }
      aoConcluir?.();
      router.refresh();
    });
  }

  return (
    <div className="gip-ambient-bg mx-auto max-w-[1140px] space-y-[18px] px-4 py-7">
      <CommandHero
        eyebrow="Disparos · Laboratório"
        titulo="Laboratório de disparo"
        subtitulo="Onde o teste em escala roda com segurança: só os telefones-semente cadastrados aqui podem receber. Use isto na org-cobaia, nunca na operação real."
        acoes={[
          { href: "/app/campaigns/saude", label: "Ver saúde dos números" },
          { href: "/app/campaigns", label: "Voltar aos Disparos" },
        ]}
        extra={
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: "rgba(215,243,106,0.16)", color: "#D7F36A" }}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            {modoCobaia ? "Modo laboratório LIGADO" : "Modo laboratório desligado"}
          </span>
        }
      />

      {erro ? (
        <div
          className="rounded-2xl px-5 py-3 text-sm font-medium"
          style={{ background: "rgba(220,70,70,0.14)", color: "#C0392B" }}
          role="alert"
        >
          {erro}
        </div>
      ) : null}

      {/* BOTÃO DE PÂNICO — o maior e mais vermelho da tela */}
      <div
        className="gip-glass rounded-2xl p-5"
        style={envioPausado ? { boxShadow: "0 0 0 2px #C0392B inset" } : undefined}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--color-text)" }}>
              <ShieldAlert className="h-5 w-5" style={{ color: "#C0392B" }} />
              Botão de pânico
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
              {envioPausado
                ? "O envio desta organização está PARADO. Nada sai até você retomar. A fila fica guardada."
                : "Para TODO o disparo desta organização na hora. A fila não se perde — é só retomar depois."}
            </p>
          </div>
          {envioPausado ? (
            <button
              type="button"
              disabled={pendente}
              onClick={() => executar(() => definirPanico(false))}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-60"
              style={{ background: "var(--color-accent)", color: "#0c0f0d" }}
            >
              <Play className="h-4 w-4" />
              Retomar envio
            </button>
          ) : (
            <button
              type="button"
              disabled={pendente}
              onClick={() => executar(() => definirPanico(true))}
              className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-base font-extrabold disabled:opacity-60"
              style={{ background: "#C0392B", color: "#fff" }}
            >
              <OctagonX className="h-5 w-5" />
              PARAR TUDO AGORA
            </button>
          )}
        </div>
      </div>

      {/* MODO LABORATÓRIO */}
      <div className="gip-glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--color-text)" }}>
              <FlaskConical className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
              Modo laboratório
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Ligado, só os telefones-semente abaixo podem receber — qualquer outro número é recusado
              antes de sair. É a trava que garante que nenhum eleitor real entre no teste.
            </p>
          </div>
          <button
            type="button"
            disabled={pendente}
            onClick={() => executar(() => definirModoCobaia(!modoCobaia))}
            aria-pressed={modoCobaia}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-60"
            style={
              modoCobaia
                ? { background: "rgba(215,243,106,0.16)", color: "#D7F36A", boxShadow: "0 0 0 1px #D7F36A inset" }
                : { background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }
            }
          >
            {modoCobaia ? "Ligado — clique para desligar" : "Desligado — clique para ligar"}
          </button>
        </div>
      </div>

      {/* SEMENTES — a allowlist */}
      <div className="gip-glass rounded-2xl p-5">
        <p className="flex items-center gap-2 text-base font-bold" style={{ color: "var(--color-text)" }}>
          <Phone className="h-5 w-5" style={{ color: "var(--color-accent)" }} />
          Telefones-semente ({sementes.length})
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
          Os únicos números que podem receber no modo laboratório. Cadastre só aparelhos e chips que
          são nossos. Formato não importa (+55, espaços e traços são ignorados).
        </p>

        {/* Formulário de adicionar */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            Telefone
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="+55 31 99999-0001"
              inputMode="tel"
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--color-surface-elevated)", color: "var(--color-text)", minWidth: 180 }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            Rótulo (opcional)
            <input
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
              placeholder="celular do João — time"
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "var(--color-surface-elevated)", color: "var(--color-text)", minWidth: 200 }}
            />
          </label>
          <button
            type="button"
            disabled={pendente || telefone.trim() === ""}
            onClick={() =>
              executar(
                () => adicionarSemente(telefone, rotulo),
                () => {
                  setTelefone("");
                  setRotulo("");
                },
              )
            }
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50"
            style={{ background: "var(--color-accent)", color: "#0c0f0d" }}
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>

        {/* Lista */}
        <ul className="mt-4 space-y-2">
          {sementes.length === 0 ? (
            <li className="rounded-lg px-3 py-3 text-sm" style={{ color: "var(--color-text-muted)", background: "var(--color-surface-elevated)" }}>
              Nenhuma semente ainda. Com o modo laboratório ligado e a lista vazia, nada é enviado — é a
              posição mais segura.
            </li>
          ) : (
            sementes.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                style={{ background: "var(--color-surface-elevated)" }}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                    {s.telefone}
                  </p>
                  {s.rotulo ? (
                    <p className="truncate text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {s.rotulo}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => executar(() => removerSemente(s.id))}
                  aria-label={`Remover ${s.telefone}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                  style={{ background: "rgba(220,70,70,0.14)", color: "#C0392B" }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
