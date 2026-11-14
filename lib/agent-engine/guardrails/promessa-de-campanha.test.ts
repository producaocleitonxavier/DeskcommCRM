import { describe, expect, it } from 'vitest';

import {
  detectarPromessaDeCampanha,
  renderVetoDePromessaDeCampanha,
  type CategoriaDeCampanha,
} from './promessa-de-campanha';

/**
 * O corpus do detector de PROMESSA DE CAMPANHA. Cada termo novo no detector entra aqui
 * com um caso nos DOIS sentidos: uma frase que ele PEGA e uma vizinha legítima que ele
 * DEIXA passar. A metade "deixa passar" é a mais importante — é a rotina do gabinete, e
 * um detector que a barrasse calaria o atendimento legítimo do mandato.
 */

function categorias(texto: string): CategoriaDeCampanha[] {
  return detectarPromessaDeCampanha(texto).categorias.sort();
}

describe('detectarPromessaDeCampanha — captação de sufrágio (voto ↔ entrega)', () => {
  it.each([
    'Vote em mim que eu te consigo a vaga.',
    'Vota em mim que eu te arranjo um emprego.',
    'Em troca do seu voto, eu te arranjo um emprego.',
    'Se você votar em mim, eu te arranjo um emprego.',
    'Eu te dou uma cesta básica se você votar no 15.',
    'Seu voto em troca da consulta marcada.',
  ])('barra: %s', (frase) => {
    expect(categorias(frase)).toContain('captacao_de_sufragio');
  });

  it('é oferta mesmo em pergunta — pergunta não desarma a captação', () => {
    expect(categorias('Vota em mim que eu te arranjo um emprego?')).toContain('captacao_de_sufragio');
  });

  it.each([
    'Obrigado pelo seu voto de confiança no nosso trabalho.',
    'Para votar, é só levar o título e um documento com foto.',
    'O senhor já decidiu seu voto para esta eleição?',
  ])('deixa passar (voto sem troca): %s', (frase) => {
    expect(categorias(frase)).not.toContain('captacao_de_sufragio');
  });
});

describe('detectarPromessaDeCampanha — promessa de benefício pessoal', () => {
  it.each([
    'Vou conseguir sua aposentadoria.',
    'Garanto sua vaga na creche.',
    'Consigo seu benefício do INSS.',
    'Te dou uma cesta básica ainda esta semana.',
    'Vou te arranjar um emprego na prefeitura.',
    'Vou liberar seu auxílio.',
  ])('barra: %s', (frase) => {
    expect(categorias(frase)).toContain('promessa_de_beneficio');
  });

  it.each([
    'Não posso garantir sua aposentadoria, mas vou encaminhar o pedido.',
    'A gente não promete vaga, mas registra e acompanha sua demanda.',
    'Você precisa conseguir uma vaga na creche para seu filho?',
  ])('deixa passar (negado/pergunta): %s', (frase) => {
    expect(categorias(frase)).not.toContain('promessa_de_beneficio');
  });

  it('não confunde carinho com benefício: "vou te dar um abraço" passa', () => {
    expect(categorias('Pode deixar, vou te dar um abraço quando te ver.')).toHaveLength(0);
  });
});

describe('detectarPromessaDeCampanha — garantia eleitoral (resultado prometido)', () => {
  it.each([
    'Prometo que vou resolver a iluminação da sua rua.',
    'Com certeza vou acabar com a fila do SUS.',
    'Pode ter certeza que vou asfaltar sua rua.',
    'Resultado garantido na saúde do município.',
    'Vou acabar com a fila do postinho.',
  ])('barra: %s', (frase) => {
    expect(categorias(frase)).toContain('garantia_eleitoral');
  });

  it.each([
    'Quando eu for eleito, vou trabalhar pela saúde da cidade.',
    'Nossa bandeira é lutar por mais creches no bairro.',
    'Não posso prometer resultado, mas vou cobrar a secretaria.',
  ])('deixa passar (visão ampla/negado): %s', (frase) => {
    expect(categorias(frase)).not.toContain('garantia_eleitoral');
  });
});

describe('detectarPromessaDeCampanha — a rotina do gabinete passa inteira', () => {
  it.each([
    'Vou encaminhar seu pedido de poda de árvore à secretaria de meio ambiente.',
    'Registrei sua demanda e a equipe vai analisar e te dar um retorno.',
    'Vou verificar com a secretaria o andamento e te aviso assim que souber.',
    'Protocolamos seu pedido. O número do protocolo é 2026-1234.',
    'Obrigado por nos procurar. Vou acompanhar de perto e te mantenho informado.',
    'Seu pedido foi recebido. Assim que a secretaria responder, te retorno por aqui.',
    // Controles do ENDURECIMENTO: plural/"a gente" + verbo de PROCESSO continuam
    // passando (o endurecimento pegou plural só nos verbos de ENTREGA).
    'A gente registra sua demanda e te retorna.',
    'Vamos analisar seu pedido com a secretaria.',
    'A gente vai verificar e te avisa assim que souber.',
  ])('não barra nada: %s', (frase) => {
    expect(detectarPromessaDeCampanha(frase).achou).toBe(false);
  });
});

describe('detectarPromessaDeCampanha — furos fechados (endurecimento TSE)', () => {
  it.each([
    'Garanto sua vaga na creche, combinado?',
    'Vou conseguir sua aposentadoria, pode deixar?',
  ])('promessa disfarçada de PERGUNTA não desarma o benefício: %s', (frase) => {
    expect(categorias(frase)).toContain('promessa_de_beneficio');
  });

  it('garantia disfarçada de pergunta também não escapa', () => {
    expect(categorias('Prometo que vou acabar com a fila do SUS, pode confiar?')).toContain('garantia_eleitoral');
  });

  it.each([
    'Nós vamos conseguir sua aposentadoria.',
    'Vamos conseguir sua vaga na creche.',
    'A gente consegue seu benefício do INSS.',
    'Vou assegurar seu auxílio.',
  ])('PLURAL, "a gente" e SINÔNIMO agora são pegos: %s', (frase) => {
    expect(categorias(frase)).toContain('promessa_de_beneficio');
  });

  it('ADVÉRBIO entre o verbo e o benefício não quebra o casamento', () => {
    expect(categorias('Vou conseguir rapidinho a sua aposentadoria.')).toContain('promessa_de_beneficio');
  });

  it.each([
    'Vou conseguir sua prótese.',
    'Garanto sua cadeira de rodas.',
    'Consigo seus óculos novos.',
    'Vou liberar sua CNH.',
  ])('BENEFÍCIOS que antes escapavam da lista agora entram: %s', (frase) => {
    expect(categorias(frase)).toContain('promessa_de_beneficio');
  });
});

describe('detectarPromessaDeCampanha — bateria adversarial "nada passa" (11/nov)', () => {
  // FURO 1 — FUTURO SINTÉTICO: o detector antigo só via a perífrase "vou conseguir".
  it.each([
    'Conseguirei sua aposentadoria.',
    'Garantirei seu auxílio ainda este mês.',
    'Arranjarei um emprego pra você.',
    'Darei sua cesta básica na semana que vem.',
    'Liberarei seu benefício do INSS.',
    'Resolveremos sua vaga na creche.',
    'Conseguiremos sua consulta.',
  ])('futuro sintético agora é pego: %s', (frase) => {
    expect(categorias(frase)).toContain('promessa_de_beneficio');
  });

  // FURO 2 — PROMESSA CRUA: "prometo/juro + benefício", sem verbo de entrega.
  it.each([
    'Prometo sua vaga na creche.',
    'Prometo sua aposentadoria.',
    'Juro seu auxílio.',
    'Prometo o emprego na prefeitura.',
  ])('promessa crua com prometo/juro é pega: %s', (frase) => {
    expect(categorias(frase)).toContain('promessa_de_beneficio');
  });

  // FURO 3 — CAPTAÇÃO por conectivo que não é "que"/"se".
  it.each([
    'Vota no 15 e eu te arranjo o emprego.',
    'Vota em mim e eu te consigo a vaga.',
    'Vote aqui e eu te dou uma cesta básica.',
  ])('voto + conectivo + entrega de benefício = captação: %s', (frase) => {
    expect(categorias(frase)).toContain('captacao_de_sufragio');
  });

  // FURO 4 — NÚMERO DE URNA entre o voto e o "que" ("vota no 15 que eu te dou…"),
  // a forma mais comum de captação, que o grupo opcional sem dígitos deixava passar.
  it.each([
    'Vota no 15 que eu te dou a cesta.',
    'Vote no 1234 que eu te consigo a vaga.',
    'Se você votar no 13 eu te arranjo o emprego.',
  ])('número de urna não quebra a captação: %s', (frase) => {
    expect(categorias(frase)).toContain('captacao_de_sufragio');
  });

  // CONTROLES NEGATIVOS — a rotina legítima do gabinete com os MESMOS verbos novos
  // precisa seguir passando, senão o banner vira ruído e o assessor para de ler.
  it.each([
    'Darei um retorno sobre seu pedido assim que a secretaria responder.',
    'Garantirei que sua demanda seja protocolada hoje.',
    'Prometo que vou acompanhar seu caso de perto.',
    'Resolveremos isso pelos canais do gabinete.',
    'Obrigado pelo seu voto de confiança. Vou verificar sua demanda.',
    'Conte com meu voto para aprovar o projeto na câmara.',
    'Darei prioridade ao seu atendimento.',
    'Não prometo sua vaga, mas registro e acompanho seu pedido.',
    'Não vou conseguir sua aposentadoria sozinho, mas encaminho à secretaria.',
  ])('rotina legítima do gabinete NÃO dispara: %s', (frase) => {
    expect(detectarPromessaDeCampanha(frase).achou).toBe(false);
  });
});

describe('detectarPromessaDeCampanha — forma do retorno', () => {
  it('texto vazio não acha nada', () => {
    expect(detectarPromessaDeCampanha('')).toEqual({ achou: false, categorias: [] });
  });

  it('acumula categorias distintas no mesmo texto', () => {
    const texto = 'Vote em mim que eu te consigo a vaga. E prometo que vou acabar com a fila.';
    const cats = categorias(texto);
    expect(cats).toContain('captacao_de_sufragio');
    expect(cats).toContain('garantia_eleitoral');
  });

  it('o veto ensina o que fazer no lugar — encaminhar, sem garantir nem trocar por voto', () => {
    const veto = renderVetoDePromessaDeCampanha(['captacao_de_sufragio', 'promessa_de_beneficio']);
    expect(veto).toMatch(/não foi enviada/i);
    expect(veto).toMatch(/encaminhar/i);
    expect(veto).toMatch(/captação ilícita de sufrágio/i);
  });
});

describe('detectarPromessaDeCampanha — ampliação de 14/nov (parecer jurídico)', () => {
  const barra = (frase: string, categoria: string) =>
    expect(detectarPromessaDeCampanha(frase).categorias, frase).toContain(categoria);
  const passa = (frase: string) => expect(detectarPromessaDeCampanha(frase).achou, frase).toBe(false);

  it('terceira pessoa: promessa pela boca do parlamentar ou do gabinete', () => {
    for (const f of [
      'O vereador vai conseguir sua vaga na creche.',
      'O vereador Cleiton Xavier vai conseguir a sua consulta.',
      'A deputada vai garantir seu auxílio.',
      'O gabinete garante a sua vaga.',
      'O mandato conseguirá o seu benefício.',
      'A nossa equipe vai arranjar um emprego pra você.',
      'O vereador vai arrumar um emprego pra você.',
      'Os vereadores vão conseguir sua vaga.',
    ]) barra(f, 'promessa_de_beneficio');
  });

  it('terceira pessoa negada ou de outro sujeito passa', () => {
    for (const f of [
      'O vereador não vai conseguir sua vaga, mas vamos encaminhar o pedido.',
      'O gabinete não garante a vaga; quem decide é a Secretaria.',
      'A prefeitura vai liberar o auxílio emergencial na semana que vem, segundo o site oficial.',
      'O vereador vai encaminhar o seu pedido de consulta à Secretaria de Saúde.',
      'A equipe vai registrar a sua demanda e acompanhar.',
      'Ele vai analisar o caso com a assessoria.',
    ]) passa(f);
  });

  it('reciprocidade: pedir que a pessoa lembre do mandato na hora do voto', () => {
    for (const f of [
      'Resolvemos o seu problema, lembra da gente na eleição!',
      'Lembre-se da gente na eleição.',
      'Não esqueça do vereador na hora de votar.',
      'Conto com seu voto.',
      'Agora retribua nas urnas.',
      'Você sabe como é, uma mão lava a outra.',
    ]) barra(f, 'captacao_de_sufragio');
  });

  it('lembrar e contar sem voto passa', () => {
    for (const f of [
      'Lembra da gente se precisar de mais alguma coisa.',
      'Conto com a sua presença na audiência pública de quinta.',
      'Não esqueça de levar o documento com foto.',
      'A eleição do conselho tutelar é no domingo; a urna fica na escola.',
    ]) passa(f);
  });

  it('ameaça de perda de benefício', () => {
    for (const f of [
      'Se você não votar com a gente, perde o auxílio.',
      'Se vocês não votarem, perdem o auxílio.',
      'Quem não apoiar fica sem a cesta básica.',
      'Vai perder a sua vaga se não votar no vereador.',
    ]) barra(f, 'captacao_de_sufragio');
  });

  it('furar fila e dar um jeitinho', () => {
    for (const f of [
      'Eu furo a fila pra você.',
      'Pulo a fila pra você.',
      'Vou antecipar sua cirurgia.',
      'O vereador fura a fila do SUS pra senhora.',
      'Te passo na frente na lista de espera.',
      'A gente coloca você na frente.',
      'Adianto a sua cirurgia.',
      'Vamos agilizar seu exame.',
      'Deixa comigo, eu dou um jeitinho.',
    ]) barra(f, 'promessa_de_beneficio');
  });

  it('fila e adiantar no sentido comum passam', () => {
    for (const f of [
      'Não é possível furar a fila; o atendimento segue a ordem da Secretaria.',
      'Não dá para passar ninguém na frente.',
      'A fila do posto está grande hoje.',
      'Vou adiantar o registro da sua demanda aqui no sistema.',
      'O ônibus passa na frente da escola.',
    ]) passa(f);
  });
});

describe('detectarPromessaDeCampanha — rotina que a revisão independente achou barrada (14/nov)', () => {
  // Cada frase abaixo foi barrada pela primeira versão da ampliação. Todas têm de passar.
  const ROTINA = [
    'Para agilizar o atendimento, me informe seu nome completo e bairro.',
    'Para agilizar seu atendimento, pode me mandar uma foto do local?',
    'Pra adiantar o atendimento, já me passa o endereço.',
    'A equipe vai agilizar o atendimento da sua demanda.',
    'A UBS consegue adiantar a consulta em caso de urgência; procure a recepção.',
    'Sua mãe precisa ir ao CRAS; lá ela consegue o Bolsa Família.',
    'Seu filho tem direito: ele consegue a vaga fazendo a inscrição no site da prefeitura até sexta.',
    'A equipe do CRAS libera a cesta básica mediante cadastro.',
    'A equipe do posto de saúde vai dar a consulta conforme a ordem da fila.',
    'A equipe da prefeitura libera o alvará em até 30 dias.',
    'O prefeito vai liberar o auxílio emergencial na semana que vem, segundo a prefeitura.',
    'A prefeita anunciou que vai dar um vale-alimentação para os servidores.',
    'A doutora do posto libera o exame depois da consulta.',
    'O doutor vai dar o remédio certo, fique tranquila.',
    'Ela vai dar o remédio no horário certo, conforme a receita?',
    'Ele vai dar uma consulta na agenda e te retorna.',
    'A senhora perguntou se ele vai conseguir a vaga; quem decide é a secretaria.',
    'O vereador não promete que vai conseguir a vaga, mas vai cobrar.',
    'Não temos como dizer se o vereador vai conseguir a vaga.',
    'Nem o vereador consegue vaga fora da fila da central.',
    'O gabinete não te consegue vaga, mas encaminha o pedido à secretaria.',
    'O mandato garante vaga? Não: quem define é a central de vagas.',
    'O gabinete resolve exames? Não, quem marca é a UBS.',
    'O gabinete resolve consulta e exame? Encaminhamos à Secretaria de Saúde.',
    'Ninguém fura a fila: o atendimento segue a ordem da regulação.',
    'O gabinete não vai furar a fila de ninguém.',
    'Não vamos furar a fila, mas vamos cobrar a secretaria.',
    'Furar a fila não é correto e o gabinete não faz isso.',
    'Idoso e gestante têm prioridade por lei e passam na frente dos demais.',
    'Quem tem prioridade legal passa na frente na fila.',
    'Te passo na frente o contato da secretaria.',
    'Vamos cobrar a prefeitura para dar um jeito nesse buraco.',
    'Alguém precisa dar um jeito nessa iluminação, vou registrar.',
    'Não esqueça do mandato itinerante no dia 5 de outubro, na praça.',
    'Lembra da equipe que esteve na sua rua em outubro? Vamos voltar aí.',
    'Lembre da gente na campanha do agasalho: estamos recebendo doações.',
    'Lembra do vereador na campanha de vacinação do bairro?',
    'Não esqueça do vereador amanhã, na audiência pública antes da votação.',
    'Lembra da elaboração do projeto que vai a votação na quinta?',
    'Contamos com seu voto na enquete do orçamento participativo.',
    'O vereador conta com seu voto na consulta pública sobre a praça.',
    'Se você não votar na enquete até sexta, perde a chance de opinar.',
    'Quem não votar e não justificar fica sem poder tirar passaporte.',
    'Se não votar, o eleitor precisa justificar ou perde alguns direitos.',
    'Retribuir visita — voto de aplauso.',
    'O vereador vai encaminhar o seu pedido de vaga à Secretaria de Educação.',
    'O gabinete vai registrar o pedido de consulta e acompanhar.',
    'A gente vai dar retorno assim que a secretaria responder.',
    'Vou dar uma olhada no seu caso e te retorno.',
  ];
  it.each(ROTINA)('passa: %s', (frase) => {
    expect(detectarPromessaDeCampanha(frase).categorias).toEqual([]);
  });

  it('não trava com espaço em excesso (era cúbico): 20 mil espaços em menos de 300 ms', () => {
    const inicio = Date.now();
    detectarPromessaDeCampanha('vota' + ' '.repeat(20000) + 'x');
    detectarPromessaDeCampanha('seu voto' + '\t '.repeat(10000) + 'x');
    expect(Date.now() - inicio).toBeLessThan(300);
  });

  it('acento decomposto (NFD) casa igual', () => {
    const nfd = 'Se você não votar com a gente, perde o auxílio.'.normalize('NFD');
    expect(detectarPromessaDeCampanha(nfd).categorias).toContain('captacao_de_sufragio');
  });
});
