/**
 * Helper de cliente para subir a foto (avatar) de uma liderança.
 * Multipart contra /api/v1/politico/liderancas/[id]/foto. Módulo puro.
 */

export async function uploadFotoLideranca(liderancaId: string, file: File): Promise<{ ok: boolean; erro?: string }> {
  const fd = new FormData();
  fd.append("file", file);
  let res: Response;
  try {
    res = await fetch(`/api/v1/politico/liderancas/${liderancaId}/foto`, { method: "POST", body: fd });
  } catch {
    return { ok: false, erro: "Falha de rede ao enviar a foto." };
  }
  if (!res.ok) {
    let msg = "Não foi possível enviar a foto.";
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
