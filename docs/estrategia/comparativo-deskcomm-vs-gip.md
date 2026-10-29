# Comparativo DeskcommCRM × Sistema de Mandato (GIP) + Plano

> **Para quem é este documento:** o time estratégico (painel de 4 vozes) + operação GIP.
> **Objetivo:** mapear TUDO que o alicerce (DeskcommCRM) oferece, cruzar com o que já
> construímos, achar o que ainda não ligamos e as novidades que nos colocam ainda mais
> acima — para então deixar a ferramenta **padronizada e pré-configurada** (cliente liga e
> está pronto), com inteligência **muito acima** do que o mercado oferece.
>
> **Regra de ouro em tudo:** à prova de criança. Engenharia complexa atrás, tela simples,
> experiência extremamente agradável.
>
> **Fontes:** curso em imagens do DeskcommCRM (15 módulos, 92 lições, 408 passos;
> `curso/licoes/` tem 61 telas), site deskcomm.com.br, código do nosso fork.

---

## 1. Resumo executivo (a leitura do time)

O DeskcommCRM é um **"Sistema Operacional Comercial"** — grátis (MIT), self-host, WhatsApp
via WAHA, com um motor de IA sério por baixo. Nós pegamos esse motor e construímos por cima
um **"Sistema Operacional do MANDATO"**. No nicho político **já não há concorrente com essa
profundidade** — ofício, demandas com ciclo real, voz clonada, emendas/obras/lideranças,
inteligência eleitoral, captação.

Mas o raio-x revelou **três frentes de ganho** que ainda não exploramos:
1. **O ouro que herdamos e subusamos** — RAG, skills, as 7 travas, telefonia SIP, MCP.
2. **Módulos-base que nunca viraram político** — Tarefas, Desempenho, Meta Ads, automações.
3. **Novidades que ninguém pensou** — a IA que *resolve* (não só conversa), o Painel do
   Mandato como vitrine de reeleição, e a pré-configuração de fábrica por tipo de mandato.

---

## 2. O alicerce — as 61 telas do DeskcommCRM

As lições do curso (uma por tela) revelam o mapa COMPLETO do que o base oferece:

| Grupo | Telas do base |
|---|---|
| **Atendimento** | inbox · radar · respostas-rápidas · distribuição-de-atendimento · casos |
| **IA / automação** | agentes · follow-ups · automações · servidor-mcp-externo · dados-externos |
| **Funil / CRM** | funis · contatos · tags · conversões · meta-de-vendas |
| **Agenda** | agenda · tipos-de-agendamento · aviso-de-agendamento |
| **Tarefas** | tarefas |
| **Comercial (venda)** | propostas · modelos-de-proposta · financeiro |
| **Canais** | conexões · meta-ads · trunk-sip (telefonia) · webhooks · api-tokens |
| **Gestão** | equipe · organização · desempenho · atividades · notificações |
| **Config** | marca · lgpd · segurança · perfil · extensões · recursos-opcionais · app-no-celular |
| **Admin/plataforma** | 20 telas (tenants, usage, cobrança, incidents, modulos, platform-admins…) |

**O motor de IA (o que vende o base):** base de conhecimento (RAG por tenant), **skills** que
o agente executa na conversa, memória, análise de sentimento, handoff IA→humano auditado, e
— a joia — **7 verificações antes de cada envio** (descadastro, LGPD, anti-banimento,
variação de texto, promessa determinística, promessa semântica, aviso de automação).

---

## 3. Mapa completo — capacidade base × nosso status

Legenda: ✅ temos e usamos · 🟡 herdado mas subusado · 🔴 existe no base, não ligamos · ⭐ nosso (não existe no base)

| Capacidade base | Nosso status no Mandato |
|---|---|
| Inbox (IA + humano) | ✅ atendente de IA (Cleiton-Gabinete), rascunhos |
| Radar (demandas por risco) | ✅ Radar + Central do Dia (leads quentes esfriando) |
| Respostas rápidas | ✅ no menu (falta leva de scripts políticos prontos) |
| Distribuição de atendimento | 🔴 rotear demandas entre a equipe do gabinete |
| Casos (escalação auditada) | ✅ motor de casos (awaiting_human) |
| **Agentes (IA)** | ✅ agente publicado · 🟡 **RAG e skills do gabinete não ligados** |
| Follow-ups | ✅ niche político (3 modelos) + drip mensal |
| **Automações (builder)** | 🟡 motor existe; builder visual pro gabinete subaproveitado |
| **servidor-mcp-externo** | 🔴 integrar dados/ferramentas externas via MCP |
| **dados-externos** | 🔴 puxar dados de fora (gov, protocolo) |
| Funis | ⭐ funil por engajamento (political_score) + ✅ funil base |
| Contatos | ✅ base de 18 mil |
| Tags | ✅ (etiquetas → Funil Político) |
| Conversões | 🟡 medir conversão captação→base→voto |
| Meta de vendas | 🔴 vira **Metas do Mandato** (demandas/mês, obras/ano) |
| Agenda / tipos / aviso | ✅ pol_agenda (agenda do mandato) |
| **Tarefas** | 🔴 **zerado pro gabinete** — maior buraco de gestão |
| Propostas / modelos / financeiro | (venda — fora do nicho; removível) |
| Conexões | ✅ WAHA + Instagram |
| Meta Ads | 🔴 vira **ROI do mandato** (anúncio→captação→bairro) |
| **trunk-sip (telefonia)** | 🔴 **linha telefônica do gabinete** (ligações + IA) |
| Webhooks | ✅ (IG, captação) · 🟡 integrações gov |
| api-tokens | 🔴 abrir API pra integrações do cliente |
| Equipe | ✅ (assessores) |
| **Desempenho** | 🔴 **escondido** (lê funil de vendas) → **Painel do Mandato** |
| Atividades | ✅ linha do tempo |
| Notificações | ✅ |
| Marca / LGPD / segurança / perfil | ✅ |
| **app-no-celular (PWA)** | 🟡 garantir experiência mobile impecável pro assessor |
| **7 verificações pré-envio** | 🟡 herdadas — viram **blindagem jurídica TSE** (argumento de venda) |

**Nosso (⭐) que o base NÃO tem:** Ofício (anexos, timbrado, número manual, personalização,
busca), demandas com ciclo Nova→Encaminhada→Atendida, **Voz do Mandato** (clonagem + recado
reutilizável), Emendas (beneficiários + responsável), Obras & Fiscalização, Projetos de Lei,
Lideranças, Portal da Transparência, Identidade do Mandato, Inteligência eleitoral (mapa TSE,
adversários, narrativas, motor-viral), Captação (IG + QR), guardrail de promessa de campanha,
opt-out durável. **→ Já somos um produto diferente e superior no nicho.**

---

## 4. O ouro herdado e SUBusado (o maior ROI de esforço)

1. **Base de conhecimento (RAG) do mandato** — alimentar a IA com o fluxo REAL do gabinete
   (secretarias, protocolo PBH, fluxo do ofício, FAQs — já está documentado na nossa memória)
   para ela responder o cidadão com **precisão**, não genérico.
2. **Skills do agente** — a IA **executa ações** na conversa: registra a demanda, agenda a
   visita, puxa o status do protocolo. Isso transforma a IA de *"conversa"* em *"resolve"* —
   **o maior salto de inteligência** disponível pra gente agora.
3. **As 7 verificações pré-envio** — no comercial protegem contra banimento; no político
   viram **blindagem jurídica** (nada ilegal/antirregra TSE sai). Não é feature, é *moat* e
   argumento de venda matador.
4. **Telefonia SIP (trunk-sip)** — linha de telefone do gabinete dentro do sistema (ligações
   registradas, com a IA ajudando). O gabinete hoje vive de ligação — isto encaixa.
5. **MCP externo + dados-externos** — ponte com sistemas de fora (gov, protocolo, TSE) sem
   gambiarra.

---

## 5. Os buracos a LIGAR (módulos base que nunca viraram político)

| Buraco | Vira, no mandato |
|---|---|
| **Tarefas** | Quadro de tarefas do gabinete (cobrar secretaria, seguir demanda, aniversário de liderança). Simples, arrastável. |
| **Desempenho** | **Painel do Mandato**: demandas resolvidas, tempo médio, ofícios emitidos, obras entregues, áudios enviados, base crescendo — a prestação de contas virada em tela. |
| **Meta Ads** | **ROI do mandato**: anúncio → captação → base no bairro. |
| **Automações** | Regras visuais prontas do gabinete (ex.: "demanda resolvida → avisa + agradece em áudio"). |
| **Distribuição de atendimento** | Rotear demandas entre assessores por secretaria/bairro. |
| **Conversões / Metas** | Metas do mandato e taxa de conversão captação→base. |

---

## 6. ⭐ Novidades — o que ninguém pensou (inteligência MUITO acima)

1. **"Sistema Operacional do Mandato"** como posicionamento (espelha o "SO comercial vivo"
   deles): toda interação com o cidadão retroalimenta **relacionamento + inteligência +
   prestação de contas** num laço só. É o moat de marca.
2. **IA do gabinete que RESOLVE** (RAG + skills + 7 travas + guardrail TSE): o cidadão manda
   no WhatsApp, a IA entende, **registra a demanda, roteia pra secretaria certa e responde** —
   com blindagem jurídica. Nenhum concorrente tem isso.
3. **Painel do Mandato** como **vitrine de reeleição**: um clique vira relatório de prestação
   de contas (pro cidadão) e dossiê de campanha (pro político). Transforma trabalho invisível
   em voto mensurável.
4. **Pré-configuração de fábrica por tipo de mandato** (vereador / deputado / prefeito):
   funil, modelos de follow-up, scripts, estilo de ofício, metas — tudo já vem pronto. Cliente
   liga e está operando.
5. **Linha do tempo do cidadão 360°**: toda demanda, ofício, visita, áudio e evento daquele
   cidadão num só lugar — o gabinete sabe TUDO antes de atender. (Confiança irreversível.)
6. **Inteligência preditiva** (passo além): cruzar demandas + mapa TSE + captação para dizer
   **onde investir o próximo esforço** (bairro que pede muito e vota pouco = oportunidade).

---

## 7. Princípio inegociável — à prova de criança

Cada item acima só entra se a tela final for **óbvia, agradável e simples**. Quem opera no
gabinete do Cleiton é uma senhora de ~58 anos. Padrões já provados nesta fase:
rótulos claros + exemplo dentro do campo, campos estruturados (não texto solto), inputs
retangulares, um clique faz a coisa certa, nada de jargão. Engenharia complexa escondida.

---

## 8. Plano priorizado (fases)

**Fase A — Inteligência que resolve (maior salto):**
1. RAG do mandato (alimentar a IA com o fluxo real do gabinete).
2. Skills do agente (registrar demanda / agendar / status na conversa).
3. Garantir as 7 travas + guardrail TSE visíveis como blindagem.

**Fase B — Gestão e prestação de contas:**
4. Painel do Mandato (ex-Desempenho).
5. Tarefas do gabinete.
6. Metas do mandato.

**Fase C — Alcance:**
7. ROI do Meta Ads. 8. Telefonia SIP. 9. Integrações (MCP/webhooks/gov).

**Fase D — Produto/escala:**
10. Pré-configuração de fábrica por tipo de mandato. 11. PWA/mobile impecável.
12. Linha do tempo 360° + inteligência preditiva.

**Transversal (já em curso):** Instagram funcionando (App Review) + go-live supervisionado.

---

## 9. Pré-configuração de fábrica (cliente liga e está pronto)

O objetivo final: ao instalar para um cliente novo, **já vem configurado** — funil político,
modelos de follow-up, scripts de resposta, estilo de ofício, metas, RAG com o básico do
mandato. Esta é a entrega que transforma a ferramenta num **produto vendável em escala**.

---

## 10. No fim — documentação + material prático

Com a visão completa, montamos: (a) a **documentação do sistema** e (b) um **material de
funcionalidades muito mais prático que o do CRM** (vídeo-guia/telas reais no nosso estilo, não
408 passos de texto). O curso deles é referência de método (imagens do app real); nós fazemos
melhor e mais leve.

---

*Documento vivo — revisar a cada decisão. Próximo passo sugerido pelo time: começar pela
**Fase A (RAG + Skills)** — o salto que torna a IA de "conversa" em "resolve".*
