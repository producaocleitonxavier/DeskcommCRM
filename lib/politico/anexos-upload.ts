/**
 * Helper de cliente para subir e exibir anexos de demanda (Gabinete).
 * O upload é multipart contra a rota /api/v1/politico/demandas/[id]/anexos.
 * Sem "use server"/"use client": é módulo puro importado por componentes client.
 */

export interface UploadAnexoResultado {
  ok: boolean;
  erro?: string;
}

export async function uploadAnexoDemanda(demandaId: string, file: File): Promise<UploadAnexoResultado> {
  const fd = new FormData();
  fd.append("file", file);
  let res: Response;
  try {
    res = await fetch(`/api/v1/politico/demandas/${demandaId}/anexos`, { method: "POST", body: fd });
  } catch {
    return { ok: false, erro: "Falha de rede ao enviar o arquivo." };
  }
  if (!res.ok) {
    let msg = "Não foi possível enviar o arquivo.";
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j?.error?.message) msg = j.error.message;
    } catch {
      /* corpo não-JSON */
    }
    return { ok: false, erro: msg };
  }
  return { ok: true };
}

export function formatarBytes(n: number): string {
  if (!n || n <= 0) return "0 KB";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/** Limite e tipos aceitos, para texto de ajuda e validação leve no cliente. */
export const ANEXO_MAX_BYTES = 52_428_800; // 50MB — espelha o bucket/validação do servidor
