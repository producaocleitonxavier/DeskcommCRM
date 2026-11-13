/**
 * MediaSource do WAHA: baixa o binário hospedado pelo container WAHA.
 *
 * A URL anunciada no webhook NÃO é confiável nem correta: o HMAC é
 * best-effort (payload forjado é possível) e o WAHA anuncia seu endereço
 * INTERNO (ex.: localhost:3000 dentro do container, mapeado p/ 3030 no
 * host). Por isso o fetch é SEMPRE reconstruído sobre WAHA_API_BASE_URL,
 * aproveitando apenas path+query da URL anunciada. A futura MetaMediaSource
 * implementa a mesma assinatura baixando via media_id + Graph API.
 *
 * ⚠️ "O host nunca vem do payload" era FALSO (auditoria de 13/nov/2026): o
 * caminho era resolvido como referência RELATIVA, e um caminho começando com
 * "//" troca o host — a chave do gateway (X-Api-Key) ia junto para o endereço
 * de quem montou a URL. E qualquer caminho da API do gateway era aceito, não só
 * arquivo de mídia: dava para ler a lista de sessões e as conversas de toda a
 * instalação. Agora: (1) a origem final tem de ser a da base; (2) só o prefixo
 * de arquivo de mídia do gateway; (3) redirecionamento é erro.
 */
import {
  MAX_MEDIA_BYTES,
  MediaTooLargeError,
  type FetchedMedia,
} from "@/lib/messaging/media/types";

const FETCH_TIMEOUT_MS = 30_000;

/** O único lugar da API do gateway que este proxy pode ler: os arquivos de mídia. */
const CAMINHO_DE_ARQUIVO = /^\/api\/files\/[^\\]+$/;

/**
 * A URL que será buscada no gateway — ou `null` se não for um arquivo de mídia
 * dele. Pura, para o teste provar que nenhum caminho leva a outro endereço.
 */
export function urlDeArquivoDoWaha(mediaUrl: string, base: string | undefined): URL | null {
  let anunciada: URL;
  let destino: URL;
  try {
    anunciada = new URL(mediaUrl);
    destino = new URL(base ?? "");
  } catch {
    return null;
  }
  const origemDaBase = destino.origin;
  const caminho = anunciada.pathname;
  // "//host/x" como caminho é o que trocava o host; trecho vazio nunca é arquivo.
  if (caminho.includes("//") || !CAMINHO_DE_ARQUIVO.test(caminho)) return null;
  // Barra, ponto, barra invertida ou "%" codificados: um proxy que normalize o
  // caminho na frente do gateway poderia transformá-los em saída da pasta.
  if (/%(2f|5c|2e|25)/i.test(caminho)) return null;
  // Atribuição por partes: `pathname` não consegue mudar o host (ao contrário
  // de resolver o caminho como referência relativa).
  destino.pathname = caminho;
  destino.search = anunciada.search;
  destino.hash = "";
  if (destino.origin !== origemDaBase || !CAMINHO_DE_ARQUIVO.test(destino.pathname)) return null;
  return destino;
}

export async function fetchWahaMedia(
  mediaUrl: string,
  hintMime?: string | null,
): Promise<FetchedMedia> {
  // Host/porta descartados: só path+query sobrevivem, e só se forem um arquivo
  // de mídia do gateway.
  const url = urlDeArquivoDoWaha(mediaUrl, process.env.WAHA_API_BASE_URL);
  if (!url) throw new Error("waha_media_untrusted_host");

  const apiKey = process.env.WAHA_API_KEY;
  const res = await fetch(url.toString(), {
    headers: apiKey ? { "X-Api-Key": apiKey } : {},
    // A chave do gateway não acompanha redirecionamento para lugar nenhum.
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`waha_media_${res.status}`);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES) throw new MediaTooLargeError();

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_MEDIA_BYTES) throw new MediaTooLargeError();

  const mime = res.headers.get("content-type") || hintMime || "application/octet-stream";
  return { buffer, mime };
}
