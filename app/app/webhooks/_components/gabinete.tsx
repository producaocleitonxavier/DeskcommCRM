"use client";

/**
 * A tela "Formulários do site" serve a dois públicos com a MESMA máquina por baixo:
 * o produto-base (vendas: lead, funil, negócio) e o gabinete (cadastro, pessoa da
 * base). Este contexto diz aos componentes da tela qual vocabulário e quais opções
 * mostrar — sem mudar o que a máquina faz.
 *
 * Também pinta de marinho as janelas e listas que abrem por cima da tela: elas são
 * desenhadas fora da área da página (direto no corpo do documento) e, sem isto,
 * saíam claras sobre uma tela marinho.
 */
import { createContext, useContext, useEffect, type ReactNode } from "react";

const Contexto = createContext(false);

/** Esta organização é um gabinete parlamentar? */
export function useEhGabinete(): boolean {
  return useContext(Contexto);
}

export function ModoGabinete({ gabinete, children }: { gabinete: boolean; children: ReactNode }) {
  useEffect(() => {
    if (!gabinete) return;
    document.body.classList.add("gip-portais-marinho");
    return () => document.body.classList.remove("gip-portais-marinho");
  }, [gabinete]);
  return <Contexto.Provider value={gabinete}>{children}</Contexto.Provider>;
}

/** O texto do gabinete quando a organização é gabinete; senão o do produto-base. */
export function palavra(gabinete: boolean, base: string, doGabinete: string): string {
  return gabinete ? doGabinete : base;
}
