/**
 * BotaoRequerimento — atalho da visita para a aba Requerimentos (Ofícios e
 * Requerimentos): abre um documento novo já com o assunto, o local e a data da
 * visita. O requerimento é um registro próprio; aqui só mora o atalho.
 */
import Link from "next/link";
import { FileSignature } from "lucide-react";

export function BotaoRequerimento({ demandaId }: { demandaId: string }) {
  return (
    <Link
      href={`/app/politico/requerimentos?demanda=${encodeURIComponent(demandaId)}&subtipo=visita_tecnica`}
      className="wr-btn inline-flex items-center gap-1.5 text-sm"
    >
      <FileSignature className="h-4 w-4" aria-hidden /> Requerimento
    </Link>
  );
}
