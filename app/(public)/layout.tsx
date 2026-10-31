import { marcaDaSaida } from "@/lib/branding/saida";
import { createClient } from "@/lib/supabase/server";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { FundoDourado } from "@/components/auth/FundoDourado";

/**
 * Casca PREMIUM das telas de acesso — split screen (estilo das plataformas de
 * elite): à ESQUERDA a marca (elmo grande + posicionamento), à DIREITA o
 * formulário. No celular empilha: elmo grande no topo + formulário embaixo.
 * Fundo escuro com dourado animado (FundoDourado). Nome dinâmico (marcaDaSaida,
 * nunca lança); o tema dourado e o copy de posicionamento são do PRODUTO.
 */

const GIP_AUTH_CSS = `
.gip-card{background:linear-gradient(180deg, rgba(20,23,31,0.82), rgba(12,14,19,0.9));border:1px solid rgba(212,165,55,0.30);border-radius:20px;padding:28px 24px;box-shadow:0 24px 70px -20px rgba(0,0,0,0.78), 0 0 40px -12px rgba(212,165,55,0.22), inset 0 0 0 1px rgba(255,255,255,0.03);backdrop-filter:blur(10px)}
.gip-auth h1{color:#F4F6FA}
.gip-eyebrow{font-size:11px;font-weight:700;letter-spacing:0.32em;text-transform:uppercase;color:rgba(212,165,55,0.85)}
.gip-brand-name{font-weight:800;letter-spacing:0.04em;background:linear-gradient(90deg,#E7C260,#F3D37A,#C9A23A);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 1px 10px rgba(212,165,55,0.25)}
.gip-headline{font-weight:800;line-height:1.12;color:#F4F6FA;letter-spacing:-0.01em}
.gip-headline .accent{background:linear-gradient(90deg,#E7C260,#F3D37A,#C9A23A);-webkit-background-clip:text;background-clip:text;color:transparent}
.gip-tagline{font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:rgba(212,165,55,0.7)}
.gip-elmo{filter:drop-shadow(0 10px 42px rgba(212,165,55,0.5))}
.gip-auth button[type="submit"]{background:linear-gradient(180deg,#E7C260,#C9A23A);color:#1b1403;border:none;font-weight:700;box-shadow:0 8px 24px -8px rgba(201,162,58,0.6);transition:filter .15s ease, transform .1s ease}
.gip-auth button[type="submit"]:hover:not(:disabled){filter:brightness(1.07)}
.gip-auth button[type="submit"]:active:not(:disabled){transform:translateY(1px)}
.gip-auth input{background:rgba(255,255,255,0.04);border-color:rgba(212,165,55,0.22);color:#EEF1F6}
.gip-auth input::placeholder{color:rgba(238,241,246,0.45)}
.gip-auth input:focus,.gip-auth input:focus-visible{border-color:rgba(212,165,55,0.70);box-shadow:0 0 0 3px rgba(212,165,55,0.18);outline:none}
.gip-auth .gip-google-btn{color:#EDEFF4!important;border:1px solid rgba(212,165,55,0.38)!important;background:rgba(255,255,255,0.035)!important;font-weight:600}
.gip-auth .gip-google-btn:hover:not(:disabled){background:rgba(212,165,55,0.12)!important;border-color:rgba(212,165,55,0.6)!important}
`;

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const marca = await marcaDaSaida(null);
  let locale: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    locale = (user?.user_metadata?.locale as string | undefined) ?? null;
  } catch {
    // Falha de rede ou Supabase fora do ar não pode derrubar a única tela de entrada.
  }

  return (
    <IdiomaProvider locale={locale}>
      <div className="dark gip-auth" style={{ position: "relative", minHeight: "100dvh" }}>
        <style dangerouslySetInnerHTML={{ __html: GIP_AUTH_CSS }} />
        <FundoDourado />
        <div className="relative z-10 grid min-h-[100dvh] w-full lg:grid-cols-2">
          {/* ESQUERDA / TOPO — marca */}
          <div className="flex flex-col items-center justify-center gap-5 px-6 pt-10 pb-2 text-center lg:items-start lg:gap-7 lg:px-16 lg:py-12 lg:text-left">
            <span className="gip-eyebrow hidden lg:block">Estratégia de elite ✦</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-testid="logo-da-fachada"
              src="/gipchat-elmo.png"
              alt={marca.nome}
              className="gip-elmo h-36 w-auto object-contain sm:h-40 lg:h-64"
            />
            <div className="gip-brand-name text-lg lg:hidden">{marca.nome}</div>
            <h2 className="gip-headline hidden max-w-[16ch] text-[34px] lg:block xl:text-[40px]">
              Campanhas não são vencidas por sorte. <span className="accent">São vencidas por estratégia, dados e domínio da percepção pública.</span>
            </h2>
            <div className="gip-brand-name hidden text-base lg:block">{marca.nome}</div>
            <p className="gip-tagline hidden lg:block">Planejamento inteligente · Execução precisa · Resultados inegáveis</p>
          </div>

          {/* DIREITA / EMBAIXO — formulário */}
          <div className="flex items-center justify-center px-6 pb-12 pt-4 lg:px-16 lg:py-12">
            <div className="w-full max-w-[400px]">
              <div className="gip-card">{children}</div>
              <p className="gip-tagline mt-5 text-center lg:hidden">Estratégia de elite ✦</p>
            </div>
          </div>
        </div>
      </div>
    </IdiomaProvider>
  );
}
