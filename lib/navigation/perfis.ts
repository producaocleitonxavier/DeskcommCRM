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
      "Campo: cadastrar pessoas, registrar demandas e visitas, ver a agenda, obras e locais. (Lideranças ficam com o gabinete; o QR dos eventos vem por link, enviado pelo gabinete.)",
    papelRecomendado: "agent",
    papelRotulo: "Atendente",
    // Menu enxuto do campo (7 itens): Hoje(placar dele), Pessoas, Agenda,
    // Demandas, Visitas Técnicas, Obras & Fiscalização, Locais & Eventos.
    // NÃO: Lideranças (o político define — é do gabinete) nem QR no menu (o
    // gabinete gera o link e manda no dia). Mapa travado com o cliente 07/nov.
    destinos: [
      "/app/politico",
      "/app/politico/leads",
      "/app/agenda",
      "/app/politico/demandas",
      "/app/politico/visitas",
      "/app/politico/obras",
      "/app/politico/locais",
    ],
  },
  {
    chave: "gabinete",
    nome: "Assessor de gabinete",
    descricao:
      "Escritório: tudo do dia-a-dia do gabinete — demandas, visitas, ofícios, lideranças, projetos de lei, emendas, obras e locais. (Atendimento/Inbox é liberado à parte, só para 1-2 pessoas designadas.)",
    papelRecomendado: "agent",
    papelRotulo: "Atendente",
    // Todo o dia-a-dia de Gabinete. NÃO entra aqui: Funil e Materiais (são
    // Operação/estratégia, do gestor), QR no menu (gestor gera e manda), nem
    // configuração do mandato (Identidade/Configurar/Portal = admin, já travados
    // por papel). Atendimento (Inbox/Casos) NÃO vem no perfil-base: é liberado
    // por pessoa, só para 1-2 designados. Mapa travado com o cliente 07/nov.
    destinos: [
      "/app/politico",
      "/app/politico/leads",
      "/app/agenda",
      "/app/politico/demandas",
      "/app/politico/visitas",
      "/app/politico/oficios",
      "/app/politico/liderancas",
      "/app/politico/projetos-lei",
      "/app/politico/emendas",
      "/app/politico/obras",
      "/app/politico/locais",
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
