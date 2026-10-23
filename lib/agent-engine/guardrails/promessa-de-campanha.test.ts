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
  ])('não barra nada: %s', (frase) => {
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
