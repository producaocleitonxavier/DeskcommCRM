import type { Metadata } from "next";

import { nomeDoOperador, resolverOperador } from "@/lib/legal/operador";
import { createClient } from "@/lib/supabase/server";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Exclusão de dados do usuário" };

/**
 * Página pública de instruções de exclusão de dados — exigida pela Plataforma
 * da Meta (Data Deletion Instructions URL) e alinhada ao direito de eliminação
 * da LGPD. Fica sob `app/legal/`, então herda o layout público de leitura longa
 * e pode ser lida sem sessão.
 */
export default async function ExclusaoDeDadosPage() {
  const op = await resolverOperador();
  const operador = nomeDoOperador(op);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const idioma = await idiomaDoVisitante(
    (user?.user_metadata?.locale as string | undefined) ?? null,
  );
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("Exclusão de dados do usuário")}
        </h1>
        <p className="text-muted-foreground">
          {t("Como pedir a remoção dos seus dados tratados por esta instalação do")} {op.sistema}.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("1. Quem trata os dados")}</h2>
        <p>
          {t("O controlador dos dados é")} <strong>{operador}</strong>
          {op.cnpj ? ` (CNPJ ${op.cnpj})` : ""} —{" "}
          {t(
            "quem instalou e opera este sistema. Os autores do software não têm acesso a este servidor nem aos dados guardados nele.",
          )}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("2. O que você pode pedir")}</h2>
        <p>
          {t(
            "A LGPD garante a você pedir a eliminação ou a anonimização dos seus dados pessoais. Isso inclui os dados que chegaram por qualquer canal conectado — entre eles o Instagram (seu nome de usuário, comentários e mensagens diretas trocadas com a conta conectada) e as demais conversas e registros de atendimento.",
          )}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("3. Como pedir")}</h2>
        <p>
          {op.dpoEmail ? (
            <>
              {t("Envie um pedido de exclusão para o encarregado de dados:")}{" "}
              <a className="underline underline-offset-2" href={`mailto:${op.dpoEmail}?subject=${encodeURIComponent(t("Pedido de exclusão de dados"))}`}>
                {op.dpoEmail}
              </a>
              . {t("Informe o nome de usuário do Instagram (ou telefone/e-mail) usado no contato, para localizarmos seus dados.")}
            </>
          ) : (
            <>
              {t(
                "Faça o pedido pelos canais de atendimento da própria organização, informando o nome de usuário do Instagram (ou telefone/e-mail) usado no contato, para que seus dados sejam localizados.",
              )}
            </>
          )}
        </p>
        <p>
          {t(
            "Para interromper o acesso imediatamente, você também pode remover o app diretamente no Instagram, em Configurações → Apps e sites → Aplicativos ativos.",
          )}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("4. O que acontece depois")}</h2>
        <p>
          {t(
            "Confirmada a identidade, seus dados pessoais são eliminados ou anonimizados em até 30 dias. A anonimização remove a identificação preservando estatísticas agregadas e, por isso,",
          )}{" "}
          <strong>{t("não pode ser desfeita")}</strong>.{" "}
          {t(
            "Registros que a lei obriga a guardar (por exemplo, de auditoria) são mantidos apenas pelo prazo legal e depois eliminados. Você recebe a confirmação da conclusão.",
          )}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("5. Contato")}</h2>
        <p>
          {op.dpoEmail ? (
            <>
              {t("Dúvidas sobre privacidade ou sobre este pedido:")}{" "}
              <a className="underline underline-offset-2" href={`mailto:${op.dpoEmail}`}>
                {op.dpoEmail}
              </a>
              .
            </>
          ) : (
            t("Dúvidas sobre privacidade devem ser feitas pelos canais de atendimento da organização.")
          )}
        </p>
      </section>
    </>
  );
}
