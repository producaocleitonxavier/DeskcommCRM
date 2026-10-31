/**
 * CÉREBRO da importação inteligente de contatos (político).
 *
 * Recebe os cabeçalhos CRUS de uma planilha de gabinete (Excel/CSV, em qualquer
 * formato) e ADIVINHA qual coluna é cada campo do nosso sistema — mesmo que o
 * gabinete chame diferente ("Celular"/"Zap"/"Fone" → Telefone; "Município" →
 * Cidade). O usuário confirma/corrige na tela; o que não casa com nada vira
 * "campo extra" (guardado em custom_fields, nada se perde).
 *
 * PURO (sem supabase/next): a tela (client) e a rota (server) importam daqui.
 */

export type CampoPolitico =
  | "nome"
  | "telefone"
  | "cpf"
  | "email"
  | "nascimento"
  | "cidade"
  | "uf"
  | "bairro"
  | "zona_eleitoral"
  | "secao_eleitoral"
  | "genero"
  | "endereco"
  | "numero"
  | "complemento"
  | "cep"
  | "tags";

/** Rótulo amigável de cada campo (pt-BR), pra tela de conferência. */
export const ROTULO_CAMPO: Record<CampoPolitico, string> = {
  nome: "Nome",
  telefone: "Telefone / WhatsApp",
  cpf: "CPF",
  email: "E-mail",
  nascimento: "Data de nascimento",
  cidade: "Cidade",
  uf: "Estado (UF)",
  bairro: "Bairro",
  zona_eleitoral: "Zona eleitoral",
  secao_eleitoral: "Seção eleitoral",
  genero: "Gênero / Sexo",
  endereco: "Endereço (rua/logradouro)",
  numero: "Número",
  complemento: "Complemento",
  cep: "CEP",
  tags: "Etiquetas / Nível de apoio",
};

/** Ordem em que os campos aparecem na tela de conferência. */
export const CAMPOS_NA_ORDEM: CampoPolitico[] = [
  "nome", "telefone", "cpf", "email", "nascimento",
  "cidade", "uf", "bairro", "zona_eleitoral", "secao_eleitoral",
  "genero", "endereco", "numero", "complemento", "cep", "tags",
];

/**
 * Sinônimos de cabeçalho por campo (já normalizados: minúsculo, sem acento).
 * Quanto mais apelidos, mais a importação "entende sozinha" o formato do cliente.
 */
const SINONIMOS: Record<CampoPolitico, string[]> = {
  nome: [
    "nome", "nome completo", "nome e sobrenome", "nome do contato", "nome contato",
    "contato", "apoiador", "apoiadora", "eleitor", "eleitora", "cidadao", "cidada",
    "pessoa", "nome do eleitor", "nome do apoiador", "name", "full name", "lider",
    "lideranca", "nome lideranca",
  ],
  telefone: [
    "telefone", "telefone celular", "celular", "cel", "whatsapp", "whats", "whatzap",
    "zap", "wpp", "fone", "tel", "numero", "numero de telefone", "numero de celular",
    "contato telefonico", "telefone/whatsapp", "telefone whatsapp", "phone", "mobile",
    "ddd+numero", "telefone 1", "tel 1", "celular 1", "numero whatsapp",
  ],
  cpf: ["cpf", "documento", "doc", "cpf/cnpj", "nr cpf", "n cpf", "numero cpf", "cpf do contato"],
  email: ["email", "e-mail", "e mail", "correio eletronico", "endereco de email", "mail"],
  nascimento: [
    "nascimento", "data de nascimento", "data nascimento", "dt nascimento", "dt nasc",
    "nasc", "aniversario", "data aniversario", "data de aniversario", "birthday", "birthdate",
  ],
  cidade: ["cidade", "municipio", "cidade/municipio", "cidade municipio", "localidade cidade", "city", "cidade de residencia"],
  uf: ["uf", "estado", "unidade federativa", "sigla estado", "estado uf", "state"],
  bairro: ["bairro", "distrito", "regiao", "regiao administrativa", "localidade", "bairro/distrito", "comunidade"],
  zona_eleitoral: ["zona", "zona eleitoral", "zona eleit", "zona de votacao", "zona voto"],
  secao_eleitoral: ["secao", "secao eleitoral", "secao eleit", "secao de votacao", "secao voto", "sessao", "sessao eleitoral"],
  genero: ["genero", "sexo", "gender"],
  endereco: ["endereco", "logradouro", "rua", "endereco completo", "endereco residencial", "address", "avenida", "av", "rua avenida"],
  numero: ["numero", "num", "nr", "numero casa", "numero da casa", "numero residencia", "no", "number", "n casa"],
  complemento: ["complemento", "compl", "apto", "apartamento", "bloco", "complemento endereco", "ponto de referencia", "referencia"],
  cep: ["cep", "codigo postal", "codigo de endereco postal", "zip", "zipcode", "zip code"],
  tags: ["tags", "tag", "etiqueta", "etiquetas", "nivel", "nivel de apoio", "nivel apoio", "categoria", "grupo", "classificacao", "perfil", "segmento"],
};

/** Normaliza um cabeçalho pra comparar: minúsculo, sem acento, espaços colapsados. */
export function normalizarCabecalho(h: string): string {
  return (h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Adivinha, pra cada campo, o ÍNDICE da coluna da planilha (ou null).
 * - Primeiro tenta casamento EXATO do cabeçalho com um sinônimo.
 * - Depois tenta "contém" (ex.: "Telefone (WhatsApp)" contém "whatsapp").
 * - Uma coluna só é usada por UM campo (não repete).
 */
export function sugerirMapeamento(headers: string[]): Record<CampoPolitico, number | null> {
  const norm = headers.map(normalizarCabecalho);
  const usados = new Set<number>();
  const out = {} as Record<CampoPolitico, number | null>;

  const achar = (aliases: string[], modo: "exato" | "contem"): number | null => {
    for (let i = 0; i < norm.length; i++) {
      if (usados.has(i) || !norm[i]) continue;
      const h = norm[i]!;
      const bate = modo === "exato"
        ? aliases.includes(h)
        : aliases.some((a) => h.includes(a) && a.length >= 3);
      if (bate) return i;
    }
    return null;
  };

  // Passada 1: exatos (mais confiável). Passada 2: "contém", pros que sobraram.
  for (const modo of ["exato", "contem"] as const) {
    for (const campo of CAMPOS_NA_ORDEM) {
      if (out[campo] != null) continue;
      const i = achar(SINONIMOS[campo], modo);
      if (i != null) {
        out[campo] = i;
        usados.add(i);
      }
    }
  }
  for (const campo of CAMPOS_NA_ORDEM) if (out[campo] === undefined) out[campo] = null;
  return out;
}
