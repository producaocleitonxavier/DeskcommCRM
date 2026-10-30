/**
 * Perfis de acesso prontos — atalhos para o MENU típico de cada função do
 * gabinete, aplicados na interface do VÍNCULO (por pessoa) em Equipe.
 *
 * ⚠️ Isto é APRESENTAÇÃO (o que a pessoa VÊ no menu), nunca autorização. O PODER
 * (o que ela pode FAZER) é o PAPEL — definido na coluna Papel de cada membro.
 * Por isso cada perfil traz o `papelRecomendado`: a dupla menu + papel é o que
 * descreve uma função de verdade.
 *
 * `destinos` ausente = menu COMPLETO (não estreita); nesse caso é o papel que
 * limita (ex.: Gerente não vê configuração de plataforma/cobrança).
 */
import type { NavDestinationId } from "./catalogo";
import type { Role } from "@/lib/auth/types";

export interface PerfilDeAcesso {
  chave: "rua" | "gabinete" | "tecnica" | "completo";
  nome: string;
  descricao: string;
  papelRecomendado: Role;
  papelRotulo: string;
  destinos?: NavDestinationId[];
}

export const PERFIS_DE_ACESSO: readonly PerfilDeAcesso[] = [
  {
    chave: "rua",
    nome: "Assessor de rua",
    descricao:
      "Campo: cadastrar pessoas, registrar demandas, ver a agenda, lideranças, locais e o QR dos eventos.",
    papelRecomendado: "agent",
    papelRotulo: "Atendente",
    destinos: [
      "/app/politico",
      "/app/politico/leads",
      "/app/politico/demandas",
      "/app/politico/agenda",
      "/app/politico/liderancas",
      "/app/politico/locais",
      "/app/captacao-qr",
    ],
  },
  {
    chave: "gabinete",
    nome: "Assessor de gabinete",
    descricao:
      "Escritório: demandas, ofícios, projetos de lei, emendas, obras, materiais, atendimento e o QR.",
    papelRecomendado: "agent",
    papelRotulo: "Atendente",
    destinos: [
      "/app/politico",
      "/app/politico/leads",
      "/app/politico/funil",
      "/app/politico/demandas",
      "/app/politico/oficios",
      "/app/politico/liderancas",
      "/app/politico/projetos-lei",
      "/app/politico/emendas",
      "/app/politico/obras",
      "/app/politico/agenda",
      "/app/politico/materiais",
      "/app/politico/locais",
      "/app/inbox",
      "/app/ai/cases",
      "/app/captacao-qr",
    ],
  },
  {
    chave: "tecnica",
    nome: "Assessoria técnica",
    descricao:
      "Opera tudo: disparos, inteligência, redes e IA. O papel Gerente já esconde a configuração de plataforma e a cobrança.",
    papelRecomendado: "manager",
    papelRotulo: "Gerente",
    // sem destinos = menu completo; o papel limita o resto.
  },
  {
    chave: "completo",
    nome: "Político / Administrador",
    descricao: "Acesso total, incluindo configurações.",
    papelRecomendado: "admin",
    papelRotulo: "Admin",
  },
];
