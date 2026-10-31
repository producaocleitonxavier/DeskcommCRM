import { marcaDaSaida } from "@/lib/branding/saida";
import { createClient } from "@/lib/supabase/server";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { FundoDourado } from "@/components/auth/FundoDourado";

/**
 * Casca PREMIUM das telas de acesso (login, cadastro, recuperação, MFA...).
 * Fundo escuro com dourado animado (FundoDourado) + cartão de vidro. Hero da marca:
 * o elmo do produto (PNG transparente) grande, sem caixa, com o nome em dourado.
 * O nome é dinâmico (`marcaDaSaida`), que nunca lança. O tema dourado é a identidade
 * do produto; nas telas de acesso ele é fixo de propósito (é a porta de entrada).
 */

const GIP_AUTH_CSS = `
.gip-card{background:linear-gradient(180deg, rgba(20,23,31,0.82), rgba(12,14,19,0.9));border:1px solid rgba(212,165,55,0.30);border-radius:20px;padding:28px 24px;box-shadow:0 24px 70px -20px rgba(0,0,0,0.78), 0 0 40px -12px rgba(212,165,55,0.22), inset 0 0 0 1px rgba(255,255,255,0.03);backdrop-filter:blur(10px)}
.gip-auth h1{color:#F4F6FA}
.gip-brand-name{font-weight:800;font-size:15px;letter-spacing:0.02em;text-align:center;background:linear-gradient(90deg,#E7C260,#F3D37A,#C9A23A);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 1px 10px rgba(212,165,55,0.25)}
.gip-auth button[type="submit"]{background:linear-gradient(180deg,#E7C260,#C9A23A);color:#1b1403;border:none;font-weight:700;box-shadow:0 8px 24px -8px rgba(201,162,58,0.6);transition:filter .15s ease, transform .1s ease}
.gip-auth button[type="submit"]:hover:not(:disabled){filter:brightness(1.07)}
.gip-auth button[type="submit"]:active:not(:disabled){transform:translateY(1px)}
.gip-auth input{background:rgba(255,255,255,0.04);border-color:rgba(212,165,55,0.22);color:#EEF1F6}
.gip-auth input::placeholder{color:rgba(238,241,246,0.45)}
.gip-auth input:focus,.gip-auth input:focus-visible{border-color:rgba(212,165,55,0.70);box-shadow:0 0 0 3px rgba(212,165,55,0.18);outline:none}
.gip-auth .gip-google-btn{color:#EDEFF4!important;border:1px solid rgba(212,165,55,0.38)!important;background:rgba(255,255,255,0.035)!important;font-weight:600}
.gip-auth .gip-google-btn:hover:not(:disabled){background:rgba(212,165,55,0.12)!important;border-color:rgba(212,165,55,0.6)!important}
.gip-logo-wrap img{filter:drop-shadow(0 8px 28px rgba(212,165,55,0.45))}
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
      <div
        className="dark gip-auth"
        style={{ position: "relative", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}
      >
        <style dangerouslySetInnerHTML={{ __html: GIP_AUTH_CSS }} />
        <FundoDourado />
        <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 400 }}>
          {/* Hero da marca: elmo transparente grande, sem caixa, + nome dourado */}
          <div className="gip-logo-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              data-testid="logo-da-fachada"
              src="/gipchat-elmo.png"
              alt={marca.nome}
              style={{ height: 112, width: "auto", objectFit: "contain" }}
            />
            <div className="gip-brand-name">{marca.nome}</div>
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
