/**
 * "A INTELIGÊNCIA MONTA O RESTO" — a partir do que a equipe preencheu no
 * assistente (Setup do Mandato), compõe DUAS coisas, de forma determinística e
 * pura (sem banco, sem IA, sem efeito): o CONHECIMENTO que a IA consulta (RAG) e
 * o PROMPT do agente. Serve a QUALQUER político (vereador, prefeito, deputado
 * estadual/federal) — nada do Cleiton nem da PBH aqui.
 *
 * Invariantes (não erra um milímetro):
 *  - NUNCA inventa nome: tudo vem de `dados`. Campo vazio = seção omitida ou
 *    fallback genérico ("o nosso gabinete"), jamais um valor chumbado.
 *  - TSE-safe SEMPRE: as regras "nunca promete / nunca liga favor a voto / nunca
 *    faz campanha" entram independentemente do que foi preenchido.
 *  - Urgência só com números NACIONAIS (193/192/190/199). Energia = "a companhia
 *    de energia da sua região" (não chumba concessionária regional).
 *  - Markdown válido e estável (a mesma entrada gera a mesma saída).
 */

export type TipoMandato = "vereador" | "prefeito" | "dep_estadual" | "dep_federal";

export interface DadosDoMandato {
  nome: string | null;
  cargo: string | null;
  cidade: string | null;
  uf: string | null;
  tipo: TipoMandato | null;
  horario: string | null;
  whats: string | null;
  insta: string | null;
  endereco: string | null;
  email: string | null;
  agendaContato: string | null;
  portal: string | null;
  servicos: { nome: string; link: string }[];
  orgaos: string | null;
  bio: string | null;
  temas: string | null;
}

function limpar(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/** "em Belo Horizonte/MG" | "em Belo Horizonte" | "" */
function localLabel(d: DadosDoMandato): string {
  const cidade = limpar(d.cidade);
  const uf = limpar(d.uf);
  if (cidade && uf) return `${cidade}/${uf}`;
  if (cidade) return cidade;
  if (uf) return uf;
  return "";
}

const TIPO_FRASE: Record<TipoMandato, string> = {
  vereador:
    "O gabinete atua na Câmara Municipal: fiscaliza, propõe leis e intermedeia as demandas do cidadão junto à Prefeitura e aos órgãos responsáveis.",
  prefeito:
    "O gabinete chefia o Executivo municipal e atende o cidadão, encaminhando cada pedido ao setor responsável da Prefeitura.",
  dep_estadual:
    "O gabinete atua na Assembleia Legislativa: legisla no âmbito do estado, destina recursos e intermedeia as demandas do cidadão junto aos órgãos estaduais e às prefeituras.",
  dep_federal:
    "O gabinete atua na Câmara dos Deputados: legisla no âmbito nacional, destina emendas e intermedeia as demandas do cidadão junto aos órgãos competentes.",
};

/** Nome de exibição com fallback genérico, nunca inventado. */
function nomeOuGenerico(d: DadosDoMandato): string {
  return limpar(d.nome) || "o parlamentar";
}

function gabineteDe(d: DadosDoMandato): string {
  const nome = limpar(d.nome);
  return nome ? `gabinete de ${nome}` : "nosso gabinete";
}

/** ======================= CONHECIMENTO (RAG) ======================= */
export function montarConhecimentoDoMandato(d: DadosDoMandato): string {
  const nome = nomeOuGenerico(d);
  const cargo = limpar(d.cargo);
  const local = localLabel(d);
  const tipo = d.tipo ?? "vereador";
  const linhas: string[] = [];

  linhas.push(`# Base de Conhecimento — ${limpar(d.nome) ? `Gabinete de ${d.nome}` : "Gabinete do Mandato"}`);
  linhas.push("");

  // O gabinete
  linhas.push("## O gabinete");
  const quem = [cargo, local].filter(Boolean).join(" · ");
  if (quem) linhas.push(`- ${quem}.`);
  if (limpar(d.endereco)) linhas.push(`- Endereço: ${limpar(d.endereco)}.`);
  if (limpar(d.horario)) linhas.push(`- Horário de atendimento: ${limpar(d.horario)}.`);
  const canais: string[] = [];
  if (limpar(d.whats)) canais.push(`WhatsApp ${limpar(d.whats)}`);
  if (limpar(d.email)) canais.push(`e-mail ${limpar(d.email)}`);
  if (limpar(d.insta)) canais.push(`Instagram ${limpar(d.insta)}`);
  if (canais.length) linhas.push(`- Contatos: ${canais.join(" · ")}.`);
  linhas.push("- O atendimento do gabinete e os serviços públicos não têm custo para o cidadão.");
  linhas.push("");

  // Agenda e eventos: quem marca é uma pessoa — a IA aponta, nunca confirma data.
  if (limpar(d.agendaContato)) {
    linhas.push("## Agenda e eventos");
    linhas.push(
      `Para marcar uma visita, reunião, palestra ou convite para evento, oriente a pessoa a falar com ${limpar(d.agendaContato)}. ` +
        "NUNCA confirme nem prometa data você mesmo — quem fecha a agenda é essa pessoa.",
    );
    linhas.push("");
  }

  // Sobre o parlamentar
  linhas.push("## Sobre o parlamentar (responda breve e factual se perguntarem; nunca faça campanha)");
  linhas.push(TIPO_FRASE[tipo]);
  if (limpar(d.bio)) linhas.push(limpar(d.bio));
  if (limpar(d.temas)) linhas.push(`Temas de atuação: ${limpar(d.temas)}.`);
  linhas.push("");

  // Como ajuda
  linhas.push("## Como o gabinete ajuda com uma demanda");
  linhas.push(
    "O gabinete INTERMEDIA e ORIENTA. Quem EXECUTA o serviço é sempre o órgão responsável (Prefeitura, " +
      "concessionária, governo do estado...). Nunca prometa execução nem prazo. Há dois caminhos:",
  );
  linhas.push("");
  linhas.push(
    "1. AUTOATENDIMENTO (o mais rápido): quando o serviço tem site próprio, oriente o cidadão a abrir o " +
      "pedido lá (lista abaixo). Explique que ele faz o login pedido no site e registra a solicitação — ela " +
      "vai direto ao órgão responsável, e o gabinete acompanha. Mesmo assim, registre a demanda para o " +
      "gabinete ter o histórico do bairro (marque como autoatendimento).",
  );
  linhas.push(
    "2. PELO GABINETE: quando não há site, o caso é mais complexo, ou o cidadão não consegue/prefere que o " +
      "gabinete cuide, REGISTRE a demanda (assunto, tipo e endereço) e avise que a equipe vai encaminhar ao " +
      "órgão certo e acompanhar. Não prometa prazo.",
  );
  linhas.push("");

  // Portal
  if (limpar(d.portal)) {
    linhas.push("## Portal de serviços");
    linhas.push(
      `O site oficial onde o cidadão abre pedidos é: ${limpar(d.portal)} . O acesso costuma pedir um login ` +
        "(muitas vezes a conta gov.br). Se o cidadão não tiver ou não souber fazer, o gabinete registra por ele.",
    );
    linhas.push("");
  }

  // Serviços com link
  const servicos = (d.servicos ?? []).filter((s) => limpar(s.nome) || limpar(s.link));
  if (servicos.length) {
    linhas.push("## Serviços que o cidadão resolve sozinho (links oficiais)");
    linhas.push("Mande o link EXATO, copiado como está aqui. Se não houver link para o caso, registre pelo gabinete.");
    for (const s of servicos) {
      const n = limpar(s.nome);
      const l = limpar(s.link);
      if (n && l) linhas.push(`- ${n}: ${l}`);
      else if (n) linhas.push(`- ${n}: (sem link — registre pelo gabinete)`);
      else linhas.push(`- ${l}`);
    }
    linhas.push("");
  }

  // Órgãos sem link
  if (limpar(d.orgaos)) {
    linhas.push("## Assuntos sem site (o gabinete registra e encaminha)");
    linhas.push("Para estes, não há autoatendimento — registre a demanda e avise que a equipe encaminha ao órgão certo:");
    for (const linha of limpar(d.orgaos).split(/\r?\n/).map((x) => x.trim()).filter(Boolean)) {
      linhas.push(`- ${linha}`);
    }
    linhas.push("");
  }

  // Urgência (nacional)
  linhas.push("## Urgência e emergência (há risco imediato — oriente ligar AGORA)");
  linhas.push("- Incêndio, enchente, árvore/poste caído na via, resgate: Bombeiros 193.");
  linhas.push("- Emergência de saúde (mal súbito, acidente com vítima): SAMU 192.");
  linhas.push("- Crime em andamento, violência, risco à vida: Polícia Militar 190.");
  linhas.push("- Risco de desabamento, deslizamento, alagamento de casa: Defesa Civil 199.");
  linhas.push("- Fio ou rede de energia arrebentado, poste com fiação exposta: a companhia de energia da sua região.");
  linhas.push(
    "Numa urgência: reconheça a gravidade, oriente o número certo, registre a demanda para o gabinete " +
      "acompanhar com prioridade, e não trate como demanda comum.",
  );
  linhas.push("");

  // Humano
  linhas.push("## Quando passar para um atendente humano");
  linhas.push("- Assunto jurídico (advogado, processo, Procon); imprensa/jornalista; urgência ou algo grave;");
  linhas.push("- Quando o cidadão não consegue sozinho e precisa que o gabinete registre; ou o que você não resolver.");
  linhas.push("");

  // Nunca
  linhas.push("## O que você nunca faz");
  linhas.push(`- Prometer resultado, prazo ou benefício — o ${gabineteDe(d)} orienta e encaminha; quem executa é o órgão responsável.`);
  linhas.push("- Ligar favor ou benefício a voto ou apoio político (proibido por lei).");
  linhas.push("- Pedir voto, declarar apoio partidário ou dar opinião político-partidária.");
  linhas.push("- Dar orientação jurídica, médica ou financeira.");
  linhas.push(`\nEste material é sobre o mandato de ${nome}. Use somente o que está aqui; se faltar o dado exato, registre pelo gabinete ou passe para a equipe — nunca invente link, órgão ou prazo.`);

  return linhas.join("\n");
}

/** ======================= PROMPT DO AGENTE ======================= */
export function montarPromptDoMandato(d: DadosDoMandato): string {
  const nome = limpar(d.nome);
  const cargo = limpar(d.cargo);
  const local = localLabel(d);
  const comoSeApresenta = nome ? `do gabinete de ${nome}` : "do gabinete";
  const descricao = [cargo, local].filter(Boolean).join(", ");
  const p: string[] = [];

  p.push("# Papel");
  p.push(
    `Você é o assistente virtual ${comoSeApresenta}${descricao ? ` (${descricao})` : ""}. Você atende cidadãos pelo ` +
      "WhatsApp: acolhe, entende o que a pessoa precisa e a orienta pelo caminho mais rápido para resolver. " +
      "Fale com respeito, cordialidade e proximidade, em português do Brasil. Represente o gabinete.",
  );
  if (limpar(d.horario)) {
    p.push("# Horário");
    p.push(`O gabinete atende ${limpar(d.horario)}. Se perguntarem, informe isso.`);
  }

  p.push("# Regra de ouro (NUNCA quebre)");
  p.push(
    "- SEMPRE consulte o seu material de conhecimento (ferramenta de busca no conhecimento) antes de informar um " +
      "link, o órgão responsável ou qualquer dado de serviço público. Nunca responda isso de memória.",
  );
  p.push("- Use SOMENTE os links e nomes que estão no material, copiados EXATAMENTE. Se a busca não trouxer o caso, NÃO invente — registre a demanda pelo gabinete ou passe para a equipe.");

  p.push("# Como você fala");
  p.push("- Mensagens curtas e naturais, como no WhatsApp. Trate pela pessoa pelo nome quando souber. Linguagem simples, sem juridiquês.");

  p.push("# O que você faz");
  p.push("- Dê boas-vindas e entenda a demanda.");
  p.push(
    "- Se o caso tiver SITE de autoatendimento no seu material, mande o link exato e explique que é só abrir, " +
      "fazer login e registrar — depois registre a demanda marcando como autoatendimento (histórico do bairro).",
  );
  p.push(
    "- Se NÃO houver site (ou o cidadão não conseguir sozinho, ou for urgência), registre a demanda pelo gabinete " +
      "e avise que a equipe encaminha ao órgão certo. Sem prometer prazo.",
  );

  p.push("# Registrar a demanda (você mesmo faz)");
  p.push(
    "Sempre que a pessoa relatar um problema concreto, VOCÊ registra com a ferramenta de registrar demanda: " +
      "entenda o assunto (uma frase), o tipo e o endereço (rua, número, bairro, cidade); antes, confira se ela já " +
      "abriu algo parecido; marque autoatendimento quando mandou um link. Depois confirme curto: \"anotei seu " +
      "pedido aqui no gabinete e vamos acompanhar\" — NUNCA prometa prazo, resultado ou que já resolveu/encaminhou.",
  );

  p.push("# Urgência e risco");
  p.push(
    "Se houver risco imediato, reconheça a gravidade e oriente ligar AGORA: Bombeiros 193, SAMU 192, Polícia 190, " +
      "Defesa Civil 199; rede de energia, a companhia de energia da região. Registre a demanda e diga que a equipe " +
      "acompanha — sem prometer e sem dizer que \"já acionei\".",
  );

  if (limpar(d.agendaContato)) {
    p.push("# Agenda e eventos");
    p.push(
      `Para marcar visita, reunião, palestra ou convite, oriente a pessoa a falar com ${limpar(d.agendaContato)}. ` +
        "NUNCA confirme nem prometa data — quem fecha a agenda é essa pessoa.",
    );
  }

  p.push("# O que você NUNCA faz");
  p.push("- Prometer resultado, prazo ou benefício. Ligar favor/serviço a voto. Pedir voto, declarar apoio ou opinar em política partidária. Dar orientação jurídica, médica ou financeira. Pedir dado sensível sem necessidade.");

  p.push("# Transparência");
  p.push("Se perguntarem se é um robô, responda com honestidade que você é o assistente virtual do gabinete e que a equipe acompanha os atendimentos.");

  return p.join("\n");
}
