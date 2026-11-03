/**
 * CLASSIFICADOR DE ÁREA DA EMENDA — puro, determinístico, testável.
 *
 * Por quê: a destinação de uma emenda é INFINITA (campo de futebol, APAE, abrigo,
 * casa de criança com câncer...). Forçar o assessor a escolher "Saúde/Segurança"
 * num dropdown trava o preenchimento. Regra de ouro: ele ESCREVE livre onde a
 * emenda vai; o sistema LÊ o texto e arquiva sozinho na área certa — só pra
 * alimentar os gráficos e o medidor de piso de saúde. Se errar, é 1 clique pra
 * corrigir (o form deixa trocar); nunca é obrigatório.
 *
 * Determinístico por palavra-chave (primeira regra que casa vence — ordem
 * importa: saúde vem antes de esporte porque "campo" é fraco e "câncer/hospital"
 * é forte). Casos ambíguos de verdade a IA resolve na camada de cima; aqui é a
 * rede de segurança barata e offline.
 */

export type AreaTematica =
  | "saude"
  | "educacao"
  | "seguranca"
  | "assistencia_social"
  | "infraestrutura"
  | "cultura"
  | "esporte"
  | "meio_ambiente"
  | "agricultura"
  | "tecnologia"
  | "outro";

export const AREAS_EMENDA: { area: AreaTematica; nome: string }[] = [
  { area: "saude", nome: "Saúde" },
  { area: "educacao", nome: "Educação" },
  { area: "seguranca", nome: "Segurança" },
  { area: "assistencia_social", nome: "Assistência social" },
  { area: "infraestrutura", nome: "Infraestrutura" },
  { area: "cultura", nome: "Cultura" },
  { area: "esporte", nome: "Esporte" },
  { area: "meio_ambiente", nome: "Meio ambiente" },
  { area: "agricultura", nome: "Agricultura" },
  { area: "tecnologia", nome: "Tecnologia" },
  { area: "outro", nome: "Outro" },
];

/** Rótulo amigável de uma área (ou a própria chave se desconhecida). */
export function rotuloArea(area: string): string {
  return AREAS_EMENDA.find((a) => a.area === area)?.nome ?? area;
}

/**
 * Regras em ORDEM (a primeira que casar vence). Saúde no topo de propósito —
 * "custeio de campo pra criança com câncer" é SAÚDE, não esporte. Infra antes de
 * esporte por causa de "quadra/campo" em praça. Cada termo já é sem acento e
 * minúsculo (o texto também é normalizado antes de comparar).
 */
const REGRAS: { area: AreaTematica; termos: string[] }[] = [
  { area: "saude", termos: ["cancer", "oncolog", "hospital", "upa", "posto de saude", "ambulancia", "medicament", "saude", "hemodialise", "anestesia", "cirurgia", "maternidade", "samu", "medico", "enfermeir", "farmacia", "ubs", "fisioterapia", "odontolog", "mamografo"] },
  { area: "educacao", termos: ["escola", "creche", "educa", "formatura", "mobiliario escolar", "caixa escolar", "aluno", "professor", "biblioteca", "merenda", "fanfarra", "transporte escolar", "onibus escolar", "van escolar"] },
  { area: "seguranca", termos: ["viatura", "policia", "bombeiro", "drone", "armament", "arma ", "seguranca", "defesa civil", "motocicleta", "guarda municipal", "guarda civil", "delegacia", "radio movel", "batalhao", "pelotao", "kit guarani", "monitoramento", "cameras", "colete"] },
  { area: "infraestrutura", termos: ["pavimenta", "calcament", "asfalt", "mata-burro", "mata burro", "veiculo utilitario", "pick-up", "pickup", "ponte", "iluminacao", "drenagem", "esgoto", "retroescavadeira", "trator cortador", "caminhao"] },
  { area: "esporte", termos: ["campo de futebol", "quadra", "esporte", "academia ao ar livre", "academia da saude", "parquinho", "parque infantil", "ginasio", "atleta", "futebol", "material esportivo", "kit esportivo", "arquibancada", "vestiario"] },
  { area: "cultura", termos: ["turismo", "cultura", "evento", "feira", "festival", "show", "banda de musica", "museu", "teatro", "carnaval", "gastronom", "barracas", "instrumentos musicais", "sinalizacao turistica", "biblioteca municipal"] },
  { area: "assistencia_social", termos: ["abrigo", "apae", "idoso", "crianca", "assistencia", "associacao", "cesta", "terceiro setor", "vulnerab", "acolhiment", "lar dos", "conselho tutelar", "casa de apoio", "deficiente", "inclusao", "pessoa com deficiencia", "autis"] },
  { area: "agricultura", termos: ["trator", "irrigacao", "rural", "semente", "agric", "produtor", "horta", "implementos agricolas", "gradao", "arado", "kit feira", "fossas septicas"] },
  { area: "meio_ambiente", termos: ["meio ambiente", "ambiental", "reciclag", "arboriza", "nascente", "coleta seletiva", "sustentab"] },
  { area: "tecnologia", termos: ["informatica", "notebook", "computador", "software", "internet", "tecnologia", "digital", "servidor"] },
];

function normaliza(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lê o texto livre (objeto + entidade + descrição) e devolve a área provável.
 * Nunca lança; sem casamento → "outro".
 */
export function classificarArea(texto: string): AreaTematica {
  const t = normaliza(texto);
  if (!t) return "outro";
  for (const regra of REGRAS) {
    for (const termo of regra.termos) {
      if (t.includes(termo)) return regra.area;
    }
  }
  return "outro";
}
