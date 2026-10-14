import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { marcaDaSaida } from "@/lib/branding/saida";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing page da GIP - Guerrilheiros Inteligencia Politica.
 *
 * Pagina de marca propria para o War Room. Mantém o contrato da branding
 * system (`marcaDaSaida`) para o nome, mas o conteudo e visual sao
 * inteiramente customizados para a identidade GIP.
 *
 * `/` ja e caminho publico no `proxy` (`lib/auth/public-paths.ts`).
 * `getUser()` e nunca `getSession()`.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/app");

  const marca = await marcaDaSaida(null);

  return (
    <div className="gip-landing">
      <style>{`
        .gip-landing {
          --gip-gold: #C4943D;
          --gip-gold-light: #D4A94F;
          --gip-gold-dark: #A07830;
          --gip-bg: #0A0A0A;
          --gip-bg-card: #111111;
          --gip-bg-card-hover: #1A1A1A;
          --gip-text: #F5F5F5;
          --gip-text-muted: #999999;
          --gip-border: #222222;
          min-height: 100vh;
          background: var(--gip-bg);
          color: var(--gip-text);
          font-family: system-ui, -apple-system, sans-serif;
        }

        .gip-landing * {
          box-sizing: border-box;
        }

        /* ── Header ── */
        .gip-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 50;
          backdrop-filter: blur(12px);
          background: rgba(10, 10, 10, 0.85);
          border-bottom: 1px solid var(--gip-border);
        }

        .gip-header-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 24px;
        }

        .gip-header-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .gip-header-logo {
          width: 36px;
          height: 36px;
          border-radius: 6px;
          object-fit: cover;
        }

        .gip-header-name {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--gip-gold);
        }

        .gip-btn-login {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 20px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--gip-bg);
          background: var(--gip-gold);
          border: none;
          border-radius: 6px;
          text-decoration: none;
          transition: background 0.2s;
          cursor: pointer;
        }

        .gip-btn-login:hover {
          background: var(--gip-gold-light);
        }

        /* ── Hero ── */
        .gip-hero {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 120px 24px 80px;
          text-align: center;
          overflow: hidden;
        }

        .gip-hero::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background:
            radial-gradient(ellipse 60% 50% at 50% 40%, rgba(196, 148, 61, 0.08) 0%, transparent 70%),
            radial-gradient(circle at 50% 100%, rgba(196, 148, 61, 0.04) 0%, transparent 50%);
          pointer-events: none;
        }

        .gip-hero-logo {
          position: relative;
          width: 220px;
          height: 220px;
          margin-bottom: 32px;
          filter: drop-shadow(0 0 60px rgba(196, 148, 61, 0.3));
        }

        .gip-hero-title {
          position: relative;
          font-size: 48px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          line-height: 1.1;
          margin: 0 0 8px;
        }

        .gip-hero-title span {
          background: linear-gradient(135deg, var(--gip-gold-light) 0%, var(--gip-gold) 50%, var(--gip-gold-dark) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .gip-hero-subtitle {
          position: relative;
          font-size: 18px;
          font-weight: 400;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--gip-text-muted);
          margin: 0 0 48px;
        }

        .gip-hero-tagline {
          position: relative;
          max-width: 640px;
          font-size: 20px;
          line-height: 1.6;
          color: var(--gip-text-muted);
          margin: 0 0 40px;
        }

        .gip-hero-cta {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 36px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--gip-bg);
          background: linear-gradient(135deg, var(--gip-gold-light), var(--gip-gold));
          border: none;
          border-radius: 8px;
          text-decoration: none;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 24px rgba(196, 148, 61, 0.3);
        }

        .gip-hero-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(196, 148, 61, 0.4);
        }

        /* ── Divider ── */
        .gip-divider {
          width: 80px;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--gip-gold), transparent);
          margin: 0 auto;
        }

        /* ── Pillars ── */
        .gip-pillars {
          max-width: 1200px;
          margin: 0 auto;
          padding: 80px 24px;
        }

        .gip-pillars-header {
          text-align: center;
          margin-bottom: 56px;
        }

        .gip-pillars-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--gip-gold);
          margin: 0 0 12px;
        }

        .gip-pillars-title {
          font-size: 32px;
          font-weight: 700;
          margin: 0;
        }

        .gip-pillars-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        @media (max-width: 768px) {
          .gip-pillars-grid { grid-template-columns: 1fr; }
          .gip-hero-title { font-size: 32px; }
          .gip-hero-subtitle { font-size: 14px; letter-spacing: 0.12em; }
          .gip-hero-tagline { font-size: 17px; }
          .gip-hero-logo { width: 160px; height: 160px; }
          .gip-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }

        .gip-pillar-card {
          background: var(--gip-bg-card);
          border: 1px solid var(--gip-border);
          border-radius: 12px;
          padding: 32px 28px;
          transition: border-color 0.3s, background 0.3s;
        }

        .gip-pillar-card:hover {
          border-color: rgba(196, 148, 61, 0.3);
          background: var(--gip-bg-card-hover);
        }

        .gip-pillar-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: rgba(196, 148, 61, 0.1);
          color: var(--gip-gold);
          font-size: 22px;
          margin-bottom: 20px;
        }

        .gip-pillar-name {
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 10px;
        }

        .gip-pillar-desc {
          font-size: 14px;
          line-height: 1.7;
          color: var(--gip-text-muted);
          margin: 0;
        }

        /* ── Stats ── */
        .gip-stats {
          border-top: 1px solid var(--gip-border);
          border-bottom: 1px solid var(--gip-border);
          background: var(--gip-bg-card);
          padding: 64px 24px;
        }

        .gip-stats-grid {
          max-width: 900px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 32px;
          text-align: center;
        }

        .gip-stat-number {
          font-size: 36px;
          font-weight: 800;
          color: var(--gip-gold);
          margin: 0 0 4px;
        }

        .gip-stat-label {
          font-size: 13px;
          color: var(--gip-text-muted);
          letter-spacing: 0.04em;
          margin: 0;
        }

        /* ── Capabilities ── */
        .gip-capabilities {
          max-width: 1200px;
          margin: 0 auto;
          padding: 80px 24px;
        }

        .gip-cap-header {
          text-align: center;
          margin-bottom: 56px;
        }

        .gip-cap-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--gip-gold);
          margin: 0 0 12px;
        }

        .gip-cap-title {
          font-size: 32px;
          font-weight: 700;
          margin: 0;
        }

        .gip-cap-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        @media (max-width: 768px) {
          .gip-cap-grid { grid-template-columns: 1fr; }
        }

        .gip-cap-item {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding: 24px;
          border-radius: 10px;
          border: 1px solid var(--gip-border);
          background: var(--gip-bg-card);
          transition: border-color 0.3s;
        }

        .gip-cap-item:hover {
          border-color: rgba(196, 148, 61, 0.25);
        }

        .gip-cap-dot {
          flex-shrink: 0;
          width: 8px;
          height: 8px;
          margin-top: 7px;
          border-radius: 50%;
          background: var(--gip-gold);
        }

        .gip-cap-name {
          font-size: 15px;
          font-weight: 600;
          margin: 0 0 4px;
        }

        .gip-cap-desc {
          font-size: 13px;
          color: var(--gip-text-muted);
          line-height: 1.6;
          margin: 0;
        }

        /* ── CTA Final ── */
        .gip-cta-section {
          text-align: center;
          padding: 80px 24px;
        }

        .gip-cta-title {
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 16px;
        }

        .gip-cta-desc {
          font-size: 16px;
          color: var(--gip-text-muted);
          margin: 0 0 32px;
          max-width: 500px;
          margin-left: auto;
          margin-right: auto;
        }

        /* ── Footer ── */
        .gip-footer {
          border-top: 1px solid var(--gip-border);
          padding: 24px;
        }

        .gip-footer-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
        }

        .gip-footer-copy {
          font-size: 12px;
          color: var(--gip-text-muted);
          margin: 0;
        }

        .gip-footer-links {
          display: flex;
          gap: 24px;
        }

        .gip-footer-links a {
          font-size: 12px;
          color: var(--gip-text-muted);
          text-decoration: none;
          transition: color 0.2s;
        }

        .gip-footer-links a:hover {
          color: var(--gip-gold);
        }
      `}</style>

      {/* Header */}
      <header className="gip-header">
        <div className="gip-header-inner">
          <div className="gip-header-brand">
            <Image
              src="/gip-logo.jpg"
              alt={marca.nome}
              width={36}
              height={36}
              className="gip-header-logo"
              priority
            />
            <span className="gip-header-name">GIP</span>
          </div>
          <Link href="/login" className="gip-btn-login">
            Acessar Plataforma
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="gip-hero">
        <div className="gip-hero-logo">
          <Image
            src="/gip-logo.jpg"
            alt={marca.nome}
            width={220}
            height={220}
            style={{ borderRadius: "16px", objectFit: "cover" }}
            priority
          />
        </div>
        <h1 className="gip-hero-title">
          <span>Guerrilheiros</span>
        </h1>
        <p className="gip-hero-subtitle">Inteligência Política</p>
        <p className="gip-hero-tagline">
          Plataforma de comando e controle para campanhas políticas.
          Inteligência artificial, dados em tempo real e estratégia de elite
          para quem não aceita perder.
        </p>
        <Link href="/login" className="gip-hero-cta">
          Entrar no War Room
        </Link>
      </section>

      <div className="gip-divider" />

      {/* Pilares */}
      <section className="gip-pillars">
        <div className="gip-pillars-header">
          <p className="gip-pillars-label">Pilares Estratégicos</p>
          <h2 className="gip-pillars-title">Domínio Total da Operação</h2>
        </div>
        <div className="gip-pillars-grid">
          <div className="gip-pillar-card">
            <div className="gip-pillar-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </div>
            <h3 className="gip-pillar-name">Inteligência Artificial</h3>
            <p className="gip-pillar-desc">
              Agentes de IA treinados para o contexto político. Atendimento
              automatizado a lideranças, análise de demandas e resposta
              imediata pelo WhatsApp.
            </p>
          </div>
          <div className="gip-pillar-card">
            <div className="gip-pillar-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <h3 className="gip-pillar-name">Gestão de Lideranças</h3>
            <p className="gip-pillar-desc">
              CRM completo para mapear, classificar e nutrir sua base de
              lideranças. Funil de relacionamento com visão 360 de cada
              contato político.
            </p>
          </div>
          <div className="gip-pillar-card">
            <div className="gip-pillar-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            </div>
            <h3 className="gip-pillar-name">Gabinete Digital</h3>
            <p className="gip-pillar-desc">
              Controle de demandas parlamentares, projetos de lei, agenda de
              reuniões e prestação de contas. Tudo organizado e rastreável.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="gip-stats">
        <div className="gip-stats-grid">
          <div>
            <p className="gip-stat-number">24/7</p>
            <p className="gip-stat-label">Atendimento por IA</p>
          </div>
          <div>
            <p className="gip-stat-number">360°</p>
            <p className="gip-stat-label">Visão do Eleitor</p>
          </div>
          <div>
            <p className="gip-stat-number">100%</p>
            <p className="gip-stat-label">Dados Próprios</p>
          </div>
          <div>
            <p className="gip-stat-number">0</p>
            <p className="gip-stat-label">Dependência Externa</p>
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="gip-capabilities">
        <div className="gip-cap-header">
          <p className="gip-cap-label">Arsenal Completo</p>
          <h2 className="gip-cap-title">O que a Plataforma Entrega</h2>
        </div>
        <div className="gip-cap-grid">
          <div className="gip-cap-item">
            <div className="gip-cap-dot" />
            <div>
              <p className="gip-cap-name">WhatsApp Inteligente</p>
              <p className="gip-cap-desc">
                Canal direto com lideranças via WhatsApp. Agente de IA responde,
                qualifica e encaminha automaticamente.
              </p>
            </div>
          </div>
          <div className="gip-cap-item">
            <div className="gip-cap-dot" />
            <div>
              <p className="gip-cap-name">Funil de Relacionamento</p>
              <p className="gip-cap-desc">
                Pipeline visual para acompanhar cada liderança do primeiro
                contato até o compromisso firmado.
              </p>
            </div>
          </div>
          <div className="gip-cap-item">
            <div className="gip-cap-dot" />
            <div>
              <p className="gip-cap-name">Central de Demandas</p>
              <p className="gip-cap-desc">
                Receba, classifique e acompanhe demandas da comunidade com
                rastreamento de ponta a ponta.
              </p>
            </div>
          </div>
          <div className="gip-cap-item">
            <div className="gip-cap-dot" />
            <div>
              <p className="gip-cap-name">Controle de Projetos de Lei</p>
              <p className="gip-cap-desc">
                Acompanhe a tramitação de cada projeto. Timeline de status,
                prazo e responsáveis num só lugar.
              </p>
            </div>
          </div>
          <div className="gip-cap-item">
            <div className="gip-cap-dot" />
            <div>
              <p className="gip-cap-name">Automação de Instagram</p>
              <p className="gip-cap-desc">
                Resposta automática a comentários e DMs. Captação de leads
                direto das redes sociais para o funil.
              </p>
            </div>
          </div>
          <div className="gip-cap-item">
            <div className="gip-cap-dot" />
            <div>
              <p className="gip-cap-name">Relatórios de Inteligência</p>
              <p className="gip-cap-desc">
                Dashboards em tempo real com métricas de atendimento, conversão
                e desempenho da equipe.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="gip-divider" />

      {/* CTA Final */}
      <section className="gip-cta-section">
        <h2 className="gip-cta-title">Pronto para o Comando</h2>
        <p className="gip-cta-desc">
          Acesse o War Room e assuma o controle da sua operação política.
        </p>
        <Link href="/login" className="gip-hero-cta">
          Acessar Agora
        </Link>
      </section>

      {/* Footer */}
      <footer className="gip-footer">
        <div className="gip-footer-inner">
          <p className="gip-footer-copy">
            {marca.nome} — Estratégia de Elite
          </p>
          <nav className="gip-footer-links">
            <Link href="/legal/privacy">Privacidade</Link>
            <Link href="/legal/terms">Termos de Uso</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
