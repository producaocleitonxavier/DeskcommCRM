"use client";

/**
 * Botão de DESCADASTRO / REATIVAÇÃO na ficha da pessoa.
 *
 * O caminho MANUAL do opt-out: a pessoa pediu para sair pessoalmente ou por
 * telefone, e o assessor registra aqui. Chama as server actions
 * `descadastrarPessoa` / `reativarPessoa` (gate admin, auditado). O estado
 * inicial (`bloqueado`) decide qual das duas faces o botão mostra.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserX, UserCheck } from "lucide-react";

import { descadastrarPessoa, reativarPessoa } from "@/app/actions/politico/descadastrar";

const MENSAGEM_ERRO: Record<string, string> = {
  forbidden_role: "Só um administrador pode descadastrar ou reativar.",
  mfa_required: "Confirme a verificação em duas etapas e tente de novo.",
  nao_encontrado: "Pessoa não encontrada.",
  unauthenticated: "Sessão expirada. Entre de novo.",
  erro_ao_gravar: "Não deu para salvar. Tente de novo.",
  forbidden_tenant: "Operação não permitida nesta conta.",
  validation_failed: "Dados inválidos.",
};

export default function BotaoDescadastro({
  contactId,
  leadId,
  bloqueado,
}: {
  contactId: string;
  leadId: string;
  bloqueado: boolean;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function descadastrar() {
    const ok = window.confirm(
      "Descadastrar esta pessoa?\n\n" +
        "Ela para de receber QUALQUER contato (WhatsApp, campanha, follow-up) e sai da base ativa. " +
        "O pedido fica registrado e sobrevive a importações futuras — é o direito de oposição da LGPD.\n\n" +
        "Você pode reativar depois, se ela voltar a pedir.",
    );
    if (!ok) return;
    setErro(null);
    startTransition(async () => {
      const r = await descadastrarPessoa({ contactId, leadId });
      if (!r.ok) {
        setErro(MENSAGEM_ERRO[r.error] ?? "Não deu para descadastrar.");
        return;
      }
      router.refresh();
    });
  }

  function reativar() {
    const ok = window.confirm(
      "Reativar esta pessoa?\n\n" +
        "Ela volta a poder receber contato e campanhas. Só faça isso se a pessoa pediu para voltar.",
    );
    if (!ok) return;
    setErro(null);
    startTransition(async () => {
      const r = await reativarPessoa({ contactId, leadId });
      if (!r.ok) {
        setErro(MENSAGEM_ERRO[r.error] ?? "Não deu para reativar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {bloqueado ? (
        <button
          type="button"
          onClick={reativar}
          disabled={pendente}
          className="wr-btn w-full justify-center disabled:opacity-60"
        >
          <UserCheck style={{ width: 16, height: 16 }} /> {pendente ? "Reativando…" : "Reativar pessoa"}
        </button>
      ) : (
        <button
          type="button"
          onClick={descadastrar}
          disabled={pendente}
          className="wr-btn w-full justify-center disabled:opacity-60"
          style={{ color: "#A3302A", borderColor: "#F3C9C5" }}
        >
          <UserX style={{ width: 16, height: 16 }} /> {pendente ? "Descadastrando…" : "Descadastrar (LGPD)"}
        </button>
      )}
      {erro && (
        <p className="text-xs font-semibold" style={{ color: "#A3302A" }} role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
