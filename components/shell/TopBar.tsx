"use client";
import { AlertsBell } from "./AlertsBell";
import { AvisoDePropostaEmDestaque } from "./AvisoDePropostaEmDestaque";
import { MobileSidebar } from "./MobileSidebar";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import { SearchTrigger } from "./SearchTrigger";

export function TopBar({ navy = false, temaClaro = false }: { navy?: boolean; temaClaro?: boolean }) {
  // Nas telas navy, a barra do topo entra no MESMO contexto marinho do conteúdo
  // (war-room + wr-claro + wr-navy-section) — assim o campo de busca, o seletor de
  // org e os botões herdam os tokens navy (fundo marinho, texto branco, borda
  // clara) sem recolorir um a um. Sem isso, a faixa branca do topo flutuava sobre
  // o marinho e "quebrava o padrão".
  return (
    <header
      className={`sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur md:gap-4 md:px-6${navy ? " war-room wr-claro wr-navy-section" : ""}`}
      {...(navy ? { "data-theme": "light" } : {})}
    >
      <div className="flex min-w-0 items-center gap-2">
        <MobileSidebar temaClaro={temaClaro} />
        <TenantSwitcher />
      </div>
      <div className="flex min-w-0 flex-1 justify-center md:max-w-md">
        <SearchTrigger />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <AlertsBell />
        <AvisoDePropostaEmDestaque />
        <UserMenu />
      </div>
    </header>
  );
}
