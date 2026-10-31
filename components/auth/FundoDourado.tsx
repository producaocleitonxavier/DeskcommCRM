"use client";

/**
 * Fundo premium animado das telas de acesso: base escura + brilhos dourados que
 * fluem devagar + partículas subindo + um filete que percorre o topo. Puro CSS
 * (sem libs), leve e com `prefers-reduced-motion`. Posições fixas (determinísticas)
 * para não quebrar a hidratação. É decorativo — `aria-hidden`.
 */

const PARTICULAS = [
  { left: "6%", dur: 15, delay: 0 }, { left: "16%", dur: 19, delay: 4 },
  { left: "27%", dur: 13, delay: 2 }, { left: "38%", dur: 21, delay: 7 },
  { left: "47%", dur: 16, delay: 1 }, { left: "58%", dur: 18, delay: 5 },
  { left: "67%", dur: 14, delay: 3 }, { left: "76%", dur: 22, delay: 8 },
  { left: "85%", dur: 17, delay: 2 }, { left: "93%", dur: 20, delay: 6 },
  { left: "33%", dur: 24, delay: 10 }, { left: "71%", dur: 23, delay: 11 },
];

export function FundoDourado() {
  return (
    <>
      <style>{`
        @keyframes gipFlow1 { 0%,100%{transform:translate(-8%,-6%) scale(1)} 50%{transform:translate(10%,6%) scale(1.18)} }
        @keyframes gipFlow2 { 0%,100%{transform:translate(8%,8%) scale(1.12)} 50%{transform:translate(-8%,-6%) scale(1)} }
        @keyframes gipShimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes gipRise { 0%{transform:translateY(0);opacity:0} 12%{opacity:.8} 88%{opacity:.8} 100%{transform:translateY(-105vh);opacity:0} }
        @keyframes gipPulse { 0%,100%{opacity:.5} 50%{opacity:.9} }
        .gip-particle{position:absolute;bottom:-12px;width:3px;height:3px;border-radius:9999px;background:radial-gradient(circle,#F3D37A,#C9A23A);box-shadow:0 0 8px rgba(212,165,55,.9);animation:gipRise linear infinite}
        .gip-glow{position:absolute;border-radius:9999px;filter:blur(44px);will-change:transform}
        @media (prefers-reduced-motion: reduce){
          .gip-particle,.gip-glow{animation:none!important}
        }
      `}</style>
      <div
        aria-hidden
        style={{
          position: "fixed", inset: 0, overflow: "hidden", zIndex: 0,
          background: "radial-gradient(1100px 760px at 50% -5%, #11141C 0%, #0A0C11 55%, #06070A 100%)",
        }}
      >
        <div className="gip-glow" style={{ top: "-22%", left: "-12%", width: "62vw", height: "62vw", background: "radial-gradient(circle, rgba(212,165,55,0.20), transparent 62%)", animation: "gipFlow1 19s ease-in-out infinite" }} />
        <div className="gip-glow" style={{ bottom: "-26%", right: "-16%", width: "58vw", height: "58vw", background: "radial-gradient(circle, rgba(201,162,58,0.15), transparent 62%)", animation: "gipFlow2 23s ease-in-out infinite" }} />
        <div className="gip-glow" style={{ top: "30%", left: "55%", width: "34vw", height: "34vw", background: "radial-gradient(circle, rgba(242,206,110,0.08), transparent 65%)", animation: "gipPulse 8s ease-in-out infinite" }} />
        {/* filete dourado percorrendo o topo */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundImage: "linear-gradient(90deg, transparent, #D4A537, #F3D37A, #D4A537, transparent)", backgroundSize: "200% 100%", animation: "gipShimmer 7s linear infinite", opacity: 0.6 }} />
        {/* partículas douradas subindo */}
        {PARTICULAS.map((p, i) => (
          <span key={i} className="gip-particle" style={{ left: p.left, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }} />
        ))}
        {/* vinheta para focar o cartão */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(900px 600px at 50% 42%, transparent 40%, rgba(3,4,6,0.55) 100%)" }} />
      </div>
    </>
  );
}
