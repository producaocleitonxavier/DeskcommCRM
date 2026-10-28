/**
 * Adaptador do ElevenLabs para a "Voz do Mandato" (Fase 2).
 *
 * Duas operações: CLONAR (Instant Voice Cloning a partir da amostra do político)
 * e GERAR (text-to-speech com o clone). A chave vem do ENV `ELEVENLABS_API_KEY`
 * — SEM chave, tudo retorna `{ erro: "sem_chave" }` (dormente, não quebra). É a
 * única dependência externa; trocar de provedor = outro arquivo com a mesma
 * interface (ver `lib/voz/config.ts`).
 *
 * Nada aqui envia WhatsApp nem decide compliance — só fala com a API de voz.
 */

const API_BASE = "https://api.elevenlabs.io/v1";
// Multilíngue (inclui pt-BR). Trocável no futuro sem mexer na interface.
const MODELO_TTS = "eleven_multilingual_v2";

function chave(): string | null {
  const k = process.env.ELEVENLABS_API_KEY;
  return typeof k === "string" && k.length > 0 ? k : null;
}

export function vozProviderConfigurado(): boolean {
  return chave() !== null;
}

export type ResultadoClone =
  | { ok: true; voiceId: string }
  | { ok: false; erro: string };

/**
 * Clona a voz a partir de uma amostra (Instant Voice Cloning). `amostra` é o
 * áudio cru (ogg/mp3/wav). Devolve o `voice_id` do clone. Requer plano com
 * clonagem+licença comercial para uso real (Free só testa, com marca d'água).
 */
export async function clonarVoz(
  nome: string,
  amostra: Blob,
  nomeArquivo = "amostra.ogg",
): Promise<ResultadoClone> {
  const key = chave();
  if (!key) return { ok: false, erro: "sem_chave" };

  try {
    const form = new FormData();
    form.append("name", nome);
    form.append(
      "description",
      "Voz do Mandato — clone do próprio político, com consentimento (GIP).",
    );
    form.append("files", amostra, nomeArquivo);

    const res = await fetch(`${API_BASE}/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, erro: `elevenlabs_${res.status}: ${txt.slice(0, 180)}` };
    }
    const json = (await res.json()) as { voice_id?: string };
    if (!json.voice_id) return { ok: false, erro: "sem_voice_id_na_resposta" };
    return { ok: true, voiceId: json.voice_id };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message.slice(0, 180) : "excecao" };
  }
}

export type ResultadoAudio =
  | { ok: true; audio: ArrayBuffer; contentType: string }
  | { ok: false; erro: string };

/**
 * Gera um áudio (mp3) falando `texto` com o clone `voiceId`. NÃO adiciona o
 * rótulo de IA nem checa blackout — quem chama é responsável pelo compliance
 * (TSE 23.755/2026). Mantém a camada de voz burra de propósito.
 */
export async function gerarAudio(voiceId: string, texto: string): Promise<ResultadoAudio> {
  const key = chave();
  if (!key) return { ok: false, erro: "sem_chave" };
  if (!voiceId) return { ok: false, erro: "sem_voice_id" };
  const corpo = texto.trim();
  if (!corpo) return { ok: false, erro: "texto_vazio" };

  try {
    const res = await fetch(`${API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: corpo,
        model_id: MODELO_TTS,
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, erro: `elevenlabs_${res.status}: ${txt.slice(0, 180)}` };
    }
    const audio = await res.arrayBuffer();
    return { ok: true, audio, contentType: "audio/mpeg" };
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message.slice(0, 180) : "excecao" };
  }
}
