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
