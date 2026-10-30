/**
 * Temas da Pesquisa Relâmpago — fonte ÚNICA (nova pesquisa, construtor, resultados).
 * Ícones lucide monocromáticos (nada de emoji infantil), uma cor de acento sóbria
 * por tema, e um exemplo de pergunta que vira placeholder no construtor.
 */
import {
  HeartPulse, GraduationCap, Shield, Construction, HandHeart, Briefcase,
  Bus, Leaf, Trophy, Vote, MessageCircle, type LucideIcon,
} from "lucide-react";

export interface TemaPesquisa {
  v: string;
  l: string;
  Icon: LucideIcon;
  cor: string;
  tse?: boolean;
  exemplo: string;
}

export const TEMAS_PESQUISA: TemaPesquisa[] = [
  { v: "saude", l: "Saúde", Icon: HeartPulse, cor: "#D7574F", exemplo: "Ex.: Como você avalia a saúde pública na sua cidade?" },
  { v: "educacao", l: "Educação", Icon: GraduationCap, cor: "#3B7DC4", exemplo: "Ex.: Como você avalia a educação pública na sua cidade?" },
  { v: "seguranca", l: "Segurança", Icon: Shield, cor: "#2F6FB0", exemplo: "Ex.: Como você avalia a segurança no seu bairro?" },
  { v: "infraestrutura", l: "Infraestrutura", Icon: Construction, cor: "#C08A2B", exemplo: "Ex.: Qual o principal problema de infraestrutura no seu bairro?" },
  { v: "assistencia", l: "Assistência Social", Icon: HandHeart, cor: "#C2568C", exemplo: "Ex.: Os programas sociais atendem bem a sua comunidade?" },
  { v: "emprego", l: "Emprego e Renda", Icon: Briefcase, cor: "#7A6CC4", exemplo: "Ex.: A geração de empregos é uma prioridade para você?" },
  { v: "transporte", l: "Transporte", Icon: Bus, cor: "#3A9AA6", exemplo: "Ex.: Como você avalia o transporte público na sua região?" },
  { v: "meio_ambiente", l: "Meio Ambiente", Icon: Leaf, cor: "#4FA86A", exemplo: "Ex.: Como você avalia a limpeza e as áreas verdes do bairro?" },
  { v: "cultura_esporte", l: "Cultura e Esporte", Icon: Trophy, cor: "#C9A23A", exemplo: "Ex.: Falta espaço de cultura e esporte no seu bairro?" },
  { v: "intencao_voto", l: "Intenção de Voto", Icon: Vote, cor: "#A3302A", tse: true, exemplo: "Ex.: Se a eleição fosse hoje, em quem você votaria?" },
  { v: "geral", l: "Geral", Icon: MessageCircle, cor: "#6B7280", exemplo: "Ex.: Qual o assunto mais importante para você hoje?" },
];

export const temaPesquisaDe = (v: string | null | undefined): TemaPesquisa =>
  TEMAS_PESQUISA.find((t) => t.v === v) ?? TEMAS_PESQUISA[TEMAS_PESQUISA.length - 1]!;
