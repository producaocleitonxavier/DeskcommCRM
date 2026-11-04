/**
 * Traduz o erro CRU do provedor de voz (ElevenLabs) numa mensagem pt-BR que diz
 * O QUE FAZER — sem jargão. Puro (sem rede); usado pelas actions da Voz do Mandato.
 *
 * O caso mais importante: a trava ANTI-DEEPFAKE do ElevenLabs
 * (`voice_access_denied` / `detected_captcha` / "verify your voice"), que aparece
 * sobretudo em vozes de PESSOAS PÚBLICAS. A voz só volta a funcionar depois que o
 * dono da voz completa a verificação (captcha) no site do ElevenLabs.
 */
export function mensagemAmigavelDeErroVoz(raw: string | undefined | null): string {
  const e = (raw ?? "").toLowerCase();
  if (!e || e === "sem_chave") return "A voz ainda não está configurada no servidor (falta a chave do ElevenLabs).";

  if (/voice_access_denied|requires?[ _]?verification|verify your voice|detected_captcha|captcha|verifica/.test(e)) {
    return (
      "Essa voz precisa ser VERIFICADA no ElevenLabs (trava anti-deepfake, comum em vozes de pessoas públicas). " +
      "Entre em elevenlabs.io › Voices, abra a voz, clique em “Verify” e grave a frase que aparecer " +
      "na voz do próprio político. Depois volte aqui e tente de novo."
    );
  }
  if (/payment_required|paid_plan_required|quota|insufficient|character[ _]?limit/.test(e)) {
    return "O plano do ElevenLabs não permite isso agora ou está sem créditos. Verifique o plano e o uso em elevenlabs.io.";
  }
  if (/can_not_use|voice_cloning|instant.?voice|\bclon/.test(e)) {
    return "Seu plano do ElevenLabs não inclui clonagem de voz. Faça upgrade para o Starter (~US$5/mês) e tente de novo.";
  }
  return `Falha na voz: ${raw}`;
}
