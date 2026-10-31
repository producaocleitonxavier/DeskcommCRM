import { LogotipoDoProduto } from "@/components/branding/MarcaDoProduto";
import { marcaEhADoProduto } from "@/lib/branding";
import { marcaDaSaida } from "@/lib/branding/saida";
import { createClient } from "@/lib/supabase/server";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { FundoDourado } from "@/components/auth/FundoDourado";

// Acentos dourados premium das telas de acesso. Escopados em `.gip-auth` para não
// vazar. O tema dourado é a identidade do PRODUTO; o logo/marca continua dinâmico
// (white-label preservado) — aqui só o acabamento.
const GIP_AUTH_CSS = `
.gip-card{background:linear-gradient(180deg, rgba(20,23,31,0.82), rgba(12,14,19,0.9));border:1px solid rgba(212,165,55,0.30);border-radius:20px;padding:28px 24px;box-shadow:0 24px 70px -20px rgba(0,0,0,0.78), 0 0 40px -12px rgba(212,165,55,0.22), inset 0 0 0 1px rgba(255,255,255,0.03);backdrop-filter:blur(10px)}
.gip-auth h1{color:#F4F6FA}
.gip-auth button[type="submit"]{background:linear-gradient(180deg,#E7C260,#C9A23A);color:#1b1403;border:none;font-weight:700;box-shadow:0 8px 24px -8px rgba(201,162,58,0.6);transition:filter .15s ease, transform .1s ease}
.gip-auth button[type="submit"]:hover:not(:disabled){filter:brightness(1.07)}
.gip-auth button[type="submit"]:active:not(:disabled){transform:translateY(1px)}
.gip-auth input{background:rgba(255,255,255,0.04);border-color:rgba(212,165,55,0.22)}
.gip-auth input:focus,.gip-auth input:focus-visible{border-color:rgba(212,165,55,0.70);box-shadow:0 0 0 3px rgba(212,165,55,0.18);outline:none}
.gip-logo-wrap img,.gip-logo-wrap svg{filter:drop-shadow(0 6px 22px rgba(212,165,55,0.42))}
`;

/**
 * A casca das telas de acesso — login, cadastro, recuperação, MFA, confirmar acesso.
 *
 * ── Por que o LOGO mora aqui, e não em `login/page.tsx` ───────────────────────
 *
 * São sete telas no grupo `(public)`, e todas são "antes de entrar": quem instala
 * o produto para clientes mostra a marca dele exatamente aí. Um `<img>` por
 * página seriam sete cópias que divergem na primeira vez que alguém mexer numa
 * só — e a que ficaria para trás é sempre a que ninguém abre (recuperação de
 * senha, cadastro de MFA), que é justamente onde o cliente do revendedor
 * aparece sozinho e sem contexto.
 *
 * ── Por que `marcaDaSaida(null)` ──────────────────────────────────────────────
 *
 * Aqui não existe organização resolvida: `null` é a declaração disso, e a pilha
 * resultante é a mesma do layout raiz (banco acima, `.env` embaixo). Montar a
 * pilha à mão nesta tela faria a fachada anunciar uma precedência que o resto do
 * produto não usa. E `marcaDaSaida` NUNCA lança (ver o cabeçalho dela): uma cor
 * ou um logo mal gravados não podem derrubar a única tela por onde se entra para
 * corrigi-los.
 *
 * Sem logo configurado E com o nome padrão, a fachada mostra o logotipo do
 * PRODUTO (`components/branding/MarcaDoProduto.tsx`) — inline, sem `<img>`,
 * para que `tests/e2e/marca-logo.spec.ts` continue medindo "a fachada está sem
 * `<img>`" como "sem logo do revendedor".
 *
 * O conteúdo de cada página resolve o próprio nome. A tela de login usa
 * `marcaDaSaida(null)`, como o título da aba, para que a marca alterada pela
 * instalação apareça também sob o botão "Entrar"; a casca usa a mesma resolução
 * para logo e tema.
 *
 * Com o login e a aba na MESMA pilha, `tests/e2e/icone-da-marca.spec.ts` deixou
 * de cruzar duas resoluções independentes: ele só prova que as duas concordam.
 * O que ancora o nome numa verdade de fora da pilha é o caso "o nome trocado em
 * /admin/marca…" de `tests/e2e/marca-logo.spec.ts`, que digita o nome na tela e
 * o confere no login de quem não entrou. Não apague um sem o outro.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const marca = await marcaDaSaida(null);
  // A maioria destas telas roda ANTES do login (não há usuário nenhum), mas
  // duas — `/login/mfa` e, em parte, `/login/recovery` — rodam com uma sessão
  // parcial já criada (primeiro fator verificado, segundo pendente). Onde há
  // sessão, o idioma salvo no perfil vale; sem ela, `IdiomaProvider` já cai no
  // padrão pt-BR sozinho (ver o cabeçalho do provider) — nunca lança.
  let locale: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    locale = (user?.user_metadata?.locale as string | undefined) ?? null;
  } catch {
    // Falha de rede ou Supabase fora do ar não pode derrubar a única tela
    // por onde se entra — segue com o idioma padrão.
  }

  return (
    <IdiomaProvider locale={locale}>
      <div
        className="dark gip-auth"
        style={{ position: "relative", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}
      >
        <style dangerouslySetInnerHTML={{ __html: GIP_AUTH_CSS }} />
        <FundoDourado />
        <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 400 }}>
          <div className="gip-logo-wrap" style={{ marginBottom: 22 }}>
          {marca.logoUrl || marca.logoDarkUrl ? (
            <div className="flex justify-center">
              {/*
                <img> em vez de next/image pelo mesmo motivo da barra lateral: a URL
                é de quem hospeda e o `next/image` exige allowlist de domínios
                fechada em BUILD — a imagem pré-buildada do self-host recusaria o
                domínio do operador. Altura máxima de 80 px e largura máxima de 192 px, sem distorcer
                arte de proporção desconhecida nem ampliar arquivos pequenos.

                O `alt` é o nome DESTA resolução (`marca.nome`), e não o de
                `branding()`: é a legenda da imagem que está ali, e nomeá-la com a
                marca de outra fonte descreveria uma marca que não é a do logo.

                O `data-testid` é lido por `tests/e2e/marca-logo.spec.ts`, que prova
                que o logo da EMPRESA não vaza para cá. Sem ele a spec caía na
                "primeira <img> da página", e uma asserção de negação com seletor
                largo passa sozinha assim que outra imagem entra na tela.
              */}
              <div
                className={
                  marca.logoDarkUrl
                    ? "rounded-md"
                    : "rounded-md dark:bg-white dark:px-3 dark:py-2 dark:shadow-sm"
                }
              >
                {marca.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    data-testid="logo-da-fachada"
                    src={marca.logoUrl}
                    alt={marca.nome}
                    className={
                      marca.logoDarkUrl
                        ? "h-auto max-h-20 w-auto max-w-[12rem] object-contain dark:hidden"
                        : "h-auto max-h-20 w-auto max-w-[12rem] object-contain"
                    }
                  />
                ) : (
                  <span className="dark:hidden">{marca.nome}</span>
                )}
                {marca.logoDarkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    data-testid="logo-escuro-da-fachada"
                    src={marca.logoDarkUrl}
                    alt={marca.nome}
                    className="hidden h-auto max-h-20 w-auto max-w-[12rem] object-contain dark:block"
                  />
                ) : null}
              </div>
            </div>
          ) : marcaEhADoProduto({ name: marca.nome, logoUrl: null }) ? (
            <div className="flex justify-center">
              <LogotipoDoProduto nome={marca.nome} className="h-14 w-auto" />
            </div>
          ) : null}
          </div>
          <div className="gip-card">{children}</div>
          <p style={{ textAlign: "center", marginTop: 18, fontSize: 10, letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(212,165,55,0.65)" }}>
            Estratégia de elite ✦
          </p>
        </div>
      </div>
    </IdiomaProvider>
  );
}
