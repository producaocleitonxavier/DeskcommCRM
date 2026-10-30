"use server";

/**
 * Dossiê Estratégico (Pilar 4 — IA cross-data). O capstone do módulo: para um
 * candidato + município, cruza o desempenho dele no TSE (redutos por bairro), a
 * projeção VIVA (universo de votos × a base do CRM por zona) e o total estadual,
 * e a IA escreve um BRIEFING executivo de campanha. Nada de dado inventado —
 * só o que está nas tabelas. Caminho leve de IA (lib/ai/cerebro); degrada em PT.
 */

import { generateText } from "ai";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cerebroDaOrg, modeloDoCerebro } from "@/lib/ai/cerebro";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { resumoCandidato, drillCandidato } from "@/app/actions/politico/raioX";
import { projecaoZonal } from "@/app/actions/politico/projecao";

export type StatusEleitoral = "eleito" | "suplente" | "nao_eleito" | "desconhecido";

export interface AdversarioReduto {
  nome: string;
  partido: string | null;
  votosReduto: number; // votos do adversário nos redutos do candidato
  votosMunicipio: number; // votos totais do adversário no município
  situacao: string | null; // situação crua do TSE (ex.: "ELEITO POR QP")
  statusLabel: string; // rótulo curto: "eleito" | "suplente" | "não eleito" | ""
  statusCat: StatusEleitoral;
}

// Normaliza a situação do TSE (ex.: "ELEITO POR QP", "SUPLENTE", "NÃO ELEITO")
// em um rótulo curto + categoria estratégica. É o que diz quem GANHOU a vaga.
function classificarStatus(situacao: string | null | undefined): { label: string; cat: StatusEleitoral } {
  const s = (situacao ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  if (s.startsWith("ELEITO")) return { label: "eleito", cat: "eleito" };
  if (s === "SUPLENTE") return { label: "suplente", cat: "suplente" };
  if (s === "NAO ELEITO") return { label: "não eleito", cat: "nao_eleito" };
  return { label: "", cat: "desconhecido" };
}

export type ResultadoBriefing =
  | { ok: true; texto: string; candidato: string; adversarios: AdversarioReduto[]; redutos: string; votosCandidatoReduto: number; votosMunicipio: number; statusLabel: string; statusCat: StatusEleitoral }
  | { ok: false; erro: string };

export async function briefingEstrategico(
  electionId: number,
  sq: string,
  municipioTse: string,
  munNome: string,
  cargoAno: string,
  ano: number,
): Promise<ResultadoBriefing> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sessão ou organização inválida." };

  const cdMun = Number(municipioTse);
  const db = await createClient();
  const [resumo, bairros, proj, advRpc, regRows] = await Promise.all([
    resumoCandidato(electionId, sq),
    drillCandidato(electionId, sq, "bairro", cdMun),
    projecaoZonal(electionId, municipioTse, ano),
    db.rpc("intel_adversarios_reduto", { p_election: electionId, p_municipio: cdMun, p_sq: Number(sq), p_nbairros: 5, p_nadv: 4 }),
    db.from("intel_bairro_regional").select("bairro, regional").eq("cd_municipio", cdMun),
  ]);

  if (!resumo) return { ok: false, erro: "Candidato não encontrado." };

  // Mapa bairro→regional (geográfico, verificado) para a IA não inventar regional.
  const regionalDe = new Map<string, string>();
  for (const r of (regRows.data ?? []) as { bairro: string; regional: string }[]) regionalDe.set(r.bairro, r.regional);
  const temRegional = regionalDe.size > 0;
  // Força do candidato por regional (soma dos votos dos bairros dele em cada regional).
  const votosRegional = new Map<string, number>();
  for (const b of bairros) {
    const reg = regionalDe.get(b.rotulo);
    if (reg && b.votos > 0) votosRegional.set(reg, (votosRegional.get(reg) ?? 0) + b.votos);
  }
  const forcaRegional = [...votosRegional.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([reg, v]) => `${reg}: ${v.toLocaleString("pt-BR")} votos`);

  const advRows = (advRpc.data ?? []) as { sq_candidato: number | string; nome_urna: string; partido_sigla: string | null; votos_reduto: number; votos_municipio: number; bairros: string | null }[];
  // Status eleitoral (eleito/suplente/não eleito) de cada adversário NESTA eleição —
  // o TSE sabe quem GANHOU a vaga. Um adversário ELEITO já não disputa a mesma
  // cadeira; o risco dele vira a TRANSFERÊNCIA de voto a quem ele apoiar depois.
  const advSqs = advRows.map((a) => Number(a.sq_candidato)).filter((n) => Number.isFinite(n));
  const situacaoPorSq = new Map<number, string | null>();
  if (advSqs.length) {
    const { data: situRows } = await db
      .from("intel_candidatos")
      .select("sq_candidato, situacao")
      .eq("election_id", electionId)
      .in("sq_candidato", advSqs);
    for (const r of (situRows ?? []) as { sq_candidato: number; situacao: string | null }[]) situacaoPorSq.set(Number(r.sq_candidato), r.situacao);
  }
  const adversarios: AdversarioReduto[] = advRows.map((a) => {
    const situ = situacaoPorSq.get(Number(a.sq_candidato)) ?? null;
    const st = classificarStatus(situ);
    return {
      nome: a.nome_urna,
      partido: a.partido_sigla,
      votosReduto: Number(a.votos_reduto),
      votosMunicipio: Number(a.votos_municipio),
      situacao: situ,
      statusLabel: st.label,
      statusCat: st.cat,
    };
  });
  const redutosNome = advRows[0]?.bairros ?? "";

  const nome = resumo.nomeUrna;
  const statusCandidato = classificarStatus(resumo.situacao);
  const pctEstado = resumo.totalEleicao > 0 ? ((resumo.votos / resumo.totalEleicao) * 100).toFixed(2) : "0";
  const votosNoMun = bairros.reduce((s, b) => s + b.votos, 0);
  // Votos do candidato nos seus 5 maiores redutos (mesma base dos adversários) — para o confronto direto.
  const votosCandidatoReduto = bairros.filter((b) => b.votos > 0).slice(0, 5).reduce((s, b) => s + b.votos, 0);

  const redutos = bairros
    .filter((b) => b.votos > 0)
    .slice(0, 8)
    .map((b) => {
      const reg = regionalDe.get(b.rotulo);
      return `${b.rotulo}${reg ? ` [regional ${reg}]` : ""}: ${b.votos} votos (${b.universo > 0 ? ((b.votos / b.universo) * 100).toFixed(1) : "0"}% do bairro)`;
    });

  // Zonas de oportunidade (muito voto, pouca presença da NOSSA base) e redutos da base.
  const oportunidades = proj.zonas
    .filter((z) => z.classe === "oportunidade" || z.classe === "deserto")
    .slice(0, 6)
    .map((z) => `Zona ${z.zona} (${z.universo.toLocaleString("pt-BR")} votos, sua base ${z.base}${z.bairros.length ? `, bairros: ${z.bairros.slice(0, 4).join(", ")}` : ""})`);

  // ── ENTREGA DO MANDATO × VOTO (o cruzamento que só nós temos: governar × ganhar).
  //    Demandas resolvidas + obras concluídas por bairro, casadas com o voto do TSE.
  const normBairro = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const [demRows, obrRows] = await Promise.all([
    db.from("demandas").select("pol_bairro, estado").eq("organization_id", org.orgId).eq("pol_gabinete", true).not("pol_bairro", "is", null).limit(5000),
    db.from("pol_obras").select("bairro, status").eq("organization_id", org.orgId).not("bairro", "is", null).limit(2000),
  ]);
  interface Entrega { nome: string; demandas: number; demandasResolvidas: number; obras: number; obrasConcluidas: number }
  const entregaPorBairro = new Map<string, Entrega>();
  const addEntrega = (bairro: string): Entrega => {
    const k = normBairro(bairro);
    let e = entregaPorBairro.get(k);
    if (!e) { e = { nome: bairro.trim(), demandas: 0, demandasResolvidas: 0, obras: 0, obrasConcluidas: 0 }; entregaPorBairro.set(k, e); }
    return e;
  };
  for (const r of (demRows.data ?? []) as { pol_bairro: string | null; estado: string | null }[]) {
    if (!r.pol_bairro?.trim()) continue;
    const e = addEntrega(r.pol_bairro);
    e.demandas++;
    if (r.estado === "resolvida") e.demandasResolvidas++;
  }
  for (const r of (obrRows.data ?? []) as { bairro: string | null; status: string | null }[]) {
    if (!r.bairro?.trim()) continue;
    const e = addEntrega(r.bairro);
    e.obras++;
    if (r.status === "concluida") e.obrasConcluidas++;
  }
  const temEntrega = entregaPorBairro.size > 0;
  const votesByBairro = new Map<string, number>();
  for (const b of bairros) votesByBairro.set(normBairro(b.rotulo), b.votos);
  const descreveEntrega = (e: Entrega | undefined): string => {
    if (!e) return "nenhuma entrega registrada";
    const partes: string[] = [];
    if (e.demandas) partes.push(`${e.demandasResolvidas}/${e.demandas} demandas resolvidas`);
    if (e.obras) partes.push(`${e.obrasConcluidas}/${e.obras} obras concluídas`);
    return partes.length ? partes.join(", ") : "nenhuma entrega registrada";
  };
  // Entrega nos redutos (bairros fortes em voto) — mostra onde a entrega consolida e onde o reduto está descoberto.
  const entregaNosRedutos = bairros.filter((b) => b.votos > 0).slice(0, 8)
    .map((b) => `${b.rotulo} (${b.votos} votos): ${descreveEntrega(entregaPorBairro.get(normBairro(b.rotulo)))}`);
  // Entrega FORA dos redutos (muito trabalho, pouco voto) — entrega a converter em voto/base.
  const entregaAConverter = [...entregaPorBairro.values()]
    .map((e) => ({ e, votos: votesByBairro.get(normBairro(e.nome)) ?? 0 }))
    .filter((x) => x.e.demandasResolvidas + x.e.obrasConcluidas > 0)
    .sort((a, b) => a.votos - b.votos || (b.e.demandasResolvidas + b.e.obrasConcluidas) - (a.e.demandasResolvidas + a.e.obrasConcluidas))
    .slice(0, 5)
    .map((x) => `${x.e.nome} (${x.votos} votos): ${descreveEntrega(x.e)}`);

  // ── MOMENTUM / EVOLUÇÃO: votos do MESMO candidato (casado por NOME COMPLETO
  //    normalizado, exato — sem homônimo) neste município em eleições anteriores.
  //    Trajetória: cresceu ou encolheu? Por bairro, onde. Degrada liso (omite) se
  //    não houver candidatura anterior dele neste município.
  const normNome = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const alvoNome = normNome(resumo.nome ?? resumo.nomeUrna ?? "");
  let momentum: { ano: number; cargo: string; votosAntes: number; delta: number; pct: number; porBairro: string[] } | null = null;
  if (alvoNome) {
    const { data: eleicoesAnt } = await db
      .from("intel_elections")
      .select("id, ano, cargo")
      .lt("ano", ano)
      .order("ano", { ascending: false });
    for (const e of (eleicoesAnt ?? []) as { id: number; ano: number; cargo: string }[]) {
      const { data: cands } = await db.rpc("intel_cand_ranking_mun", { p_election: e.id, p_municipio: cdMun, p_q: resumo.nome ?? resumo.nomeUrna, p_limit: 25, p_offset: 0 });
      const matches = ((cands ?? []) as { sq_candidato: number; nome: string | null; votos_total: number }[]).filter((c) => normNome(c.nome ?? "") === alvoNome);
      if (matches.length !== 1) continue; // 0 ou ambíguo → não arrisca
      const m = matches[0]!;
      const votosAntes = Number(m.votos_total);
      const delta = votosNoMun - votosAntes;
      const pct = votosAntes > 0 ? Math.round((delta / votosAntes) * 100) : 0;
      const { data: drillAntes } = await db.rpc("intel_cand_drill", { p_election: e.id, p_sq: String(m.sq_candidato), p_dim: "bairro", p_municipio: cdMun });
      const antesPorBairro = new Map<string, number>();
      for (const r of (drillAntes ?? []) as { rotulo: string | null; votos: number | null }[]) {
        const nb = normNome(r.rotulo ?? "");
        if (nb) antesPorBairro.set(nb, r.votos ?? 0);
      }
      const porBairro = bairros.filter((b) => b.votos > 0).slice(0, 6).map((b) => {
        const antes = antesPorBairro.get(normNome(b.rotulo)) ?? 0;
        const d = b.votos - antes;
        return `${b.rotulo}: ${antes} → ${b.votos} (${d >= 0 ? "+" : ""}${d})`;
      });
      momentum = { ano: e.ano, cargo: e.cargo, votosAntes, delta, pct, porBairro };
      break; // a mais recente candidatura anterior dele neste município
    }
  }

  const fatos: string[] = [
    `Candidato analisado (dados TSE): ${nome} (nº ${resumo.nr}${resumo.partido ? `, ${resumo.partido}` : ""})${resumo.situacao ? ` — situação no TSE: ${resumo.situacao}` : ""}. STATUS NESTA ELEIÇÃO: ${statusCandidato.label || "não informado"}${statusCandidato.cat === "suplente" ? " (ficou SUPLENTE — NÃO assumiu a cadeira; segue no mandato/situação atual e é quem pode disputar a próxima eleição)" : statusCandidato.cat === "eleito" ? " (foi ELEITO para esta vaga)" : statusCandidato.cat === "nao_eleito" ? " (NÃO foi eleito nesta disputa)" : ""}.`,
    `Cargo/eleição: ${cargoAno}. Votos totais do candidato (MG): ${resumo.votos.toLocaleString("pt-BR")} (${pctEstado}% do estado).`,
    `Município analisado: ${munNome}. Votos do candidato no município: ${votosNoMun.toLocaleString("pt-BR")}.`,
    `Redutos do candidato (bairros onde mais fez voto, com a regional administrativa entre colchetes): ${redutos.length ? redutos.join("; ") : "sem bairros com voto"}.`,
    ...(temRegional && forcaRegional.length ? [`Força do candidato POR REGIONAL administrativa (soma dos votos nos bairros de cada regional): ${forcaRegional.join("; ")}.`] : []),
    `BASE DE CRM DA OPERAÇÃO (contatos da campanha que usa a ferramenta — NÃO são eleitores nem a base do candidato analisado): ${proj.baseTotal.toLocaleString("pt-BR")} contatos em ${munNome}.`,
    `Universo de VOTOS do cargo em ${munNome} (total de votos válidos, não eleitorado): ${proj.universoTotal.toLocaleString("pt-BR")}. Cobertura da base de CRM sobre esse volume: ${(proj.coberturaMedia * 100).toFixed(2)}%.`,
    `Zonas de oportunidade (muito VOTO do cargo e pouca presença da base de CRM): ${oportunidades.length ? oportunidades.join("; ") : "—"}.`,
    `Votos do PRÓPRIO candidato nesses 5 redutos: ${votosCandidatoReduto.toLocaleString("pt-BR")} (compare diretamente com cada adversário abaixo).`,
    `ADVERSÁRIOS que mais fizeram voto nos redutos do candidato (${redutosNome || "bairros fortes"}) — nome, STATUS NO TSE (quem GANHOU a vaga), votos deles NESSES bairros / votos totais no município: ${
      adversarios.length
        ? adversarios
            .map((a) => {
              const st =
                a.statusCat === "eleito"
                  ? "ELEITO (já conquistou uma vaga nesta disputa — NÃO disputa mais a mesma cadeira)"
                  : a.statusCat === "suplente"
                    ? "SUPLENTE (não assumiu; segue como concorrente real)"
                    : a.statusCat === "nao_eleito"
                      ? "NÃO ELEITO"
                      : "status não informado";
              return `${a.nome}${a.partido ? ` (${a.partido})` : ""} [${st}] — ${a.votosReduto.toLocaleString("pt-BR")} no reduto / ${a.votosMunicipio.toLocaleString("pt-BR")} no município`;
            })
            .join("; ")
        : "—"
    }.`,
    ...(temEntrega
      ? [
          `ENTREGA DO MANDATO NOS REDUTOS (trabalho REAL do gabinete da operação — demandas resolvidas e obras concluídas, por bairro; cruze DIRETO com os votos acima): ${entregaNosRedutos.join("; ")}.`,
          ...(entregaAConverter.length ? [`ENTREGA FORA DOS REDUTOS (onde o gabinete trabalhou mas há pouco voto — a converter em voto/base): ${entregaAConverter.join("; ")}.`] : []),
        ]
      : [
          `ENTREGA DO MANDATO: ainda não há demandas ou obras com bairro registrado nesta operação. NÃO invente entrega; diga que, ao registrar demandas/obras por bairro, o cruzamento entrega×voto passa a aparecer.`,
        ]),
    ...(momentum
      ? [
          `MOMENTUM / EVOLUÇÃO (mesmo candidato, casado por nome, neste município): como ${momentum.cargo} em ${momentum.ano} fez ${momentum.votosAntes.toLocaleString("pt-BR")} votos aqui; agora (${cargoAno}) fez ${votosNoMun.toLocaleString("pt-BR")} — variação de ${momentum.delta >= 0 ? "+" : ""}${momentum.delta.toLocaleString("pt-BR")} votos (${momentum.pct >= 0 ? "+" : ""}${momentum.pct}%). Por bairro (antes → agora): ${momentum.porBairro.join("; ")}.`,
        ]
      : []),
  ];

  const cerebro = await cerebroDaOrg(createAdminClient(), org.orgId);
  if ("erro" in cerebro) return { ok: false, erro: `IA indisponível (${cerebro.erro}). Configure em IA › Credenciais.` };

  const regraRegional = temRegional
    ? "Você RECEBEU o mapa bairro→regional administrativa (verificado por geografia; a regional vem entre colchetes nos redutos e na 'força por regional'). Use as REGIONAIS para a leitura territorial, mas SOMENTE conforme esse mapa — NUNCA infira a regional pelo nome do bairro. "
    : "NUNCA agrupe bairros em 'regional'/'região administrativa' nem cite o nome de uma regional — você NÃO recebeu esse dado e inferir pelo nome do bairro gera erro grave. Use só os nomes de BAIRRO e ZONA exatamente como fornecidos. ";

  const system =
    "Você é chefe de inteligência de uma campanha eleitoral no Brasil. Recebe dados REAIS do TSE e a base de contatos (CRM) da operação que usa a ferramenta, e escreve um " +
    "BRIEFING ESTRATÉGICO executivo, direto e acionável, em português do Brasil. " +
    "Use APENAS os números fornecidos — nunca invente votos, pesquisas, nomes ou fatos. " +
    "DISTINÇÃO CRÍTICA, nunca confunda: (a) o VOTO do candidato é dado do TSE; (b) a BASE DE CRM é da OPERAÇÃO que usa a ferramenta — NÃO é do candidato analisado nem é 'eleitorado'. Nunca escreva que os contatos do CRM são do candidato; chame-os de 'base de CRM da operação' ou 'sua base'. " +
    "Chame o universo sempre de 'votos do cargo' (jamais 'eleitores'/'eleitorado'). " +
    regraRegional +
    "Não prometa resultado futuro: 'oportunidade' é volume de voto onde a base de CRM é fraca. Markdown com títulos: " +
    "## Posição atual, ## Momentum (só se houver dado de evolução), ## Mapa de força (onde o candidato é forte), ## A batalha (quem disputa seus redutos), ## Entrega × Voto, ## Onde crescer, ## Riscos, ## Plano de 90 dias. " +
    "REGRA ABSOLUTA DE STATUS (errar isso é inaceitável): você recebeu o STATUS do candidato no TSE (eleito / suplente / não eleito). NUNCA escreva que o candidato foi ELEITO, venceu, conquistou a cadeira ou é titular do cargo se o status dele NÃO for 'eleito'. Se for SUPLENTE, diga explicitamente que ele ficou na SUPLÊNCIA e NÃO assumiu a cadeira — e, se o cargo anterior dele era outro (ex.: Vereador), que ele SEGUE nesse mandato anterior. Nunca invente eleição. " +
    "Em 'Posição atual', ABRA pelo total de votos do candidato NO MUNICÍPIO analisado (o número cheio) e pelo STATUS dele (eleito/suplente/não eleito) — esses dois dados vêm primeiro, antes de qualquer leitura ou percentual. " +
    "Em 'Momentum': SE você recebeu o dado de EVOLUÇÃO, diga se o candidato CRESCEU ou ENCOLHEU neste município desde a última eleição em que concorreu — em % e votos — e em QUAIS bairros subiu/caiu mais. Trajetória vale mais que foto: dobrar o voto é sinal fortíssimo; cair é erosão a estancar. Se o cargo anterior era diferente (ex.: Vereador → Deputado), deixe claro que é a trajetória da PESSOA (mesmo nome), não do mesmo cargo, e trate a mudança de patamar com isso em mente. Se NÃO recebeu dado de evolução, OMITA a seção Momentum inteira — nunca invente. " +
    "Em 'A batalha', use o STATUS NO TSE de cada adversário (você recebeu quem foi ELEITO, quem ficou SUPLENTE e quem NÃO foi eleito) para ser REALISTA, não alarmista. Regra de leitura: " +
    "(1) um adversário ELEITO já conquistou a vaga que disputava e NÃO é mais concorrente direto pela mesma cadeira do candidato — não o trate como ameaça frontal; a ameaça real dele é INDIRETA: a TRANSFERÊNCIA de voto e de capital político para os candidatos que ELE vier a apoiar/indicar no território, que podem herdar aquela votação. Diga isso explicitamente e aponte em quais redutos essa herança pesaria mais. " +
    "(2) um adversário SUPLENTE ou NÃO ELEITO segue como concorrente direto, podendo voltar a disputar — esse sim é confronto frontal pelo mesmo eleitor. " +
    "(3) leve em conta o próprio STATUS do candidato: se ele é SUPLENTE, ele não assumiu a cadeira nova e normalmente é quem volta a disputar na próxima — o jogo dele é defender e expandir os redutos antes que a herança dos eleitos ou os concorrentes diretos os ocupem. " +
    "Separe com clareza 'ameaça frontal' (suplentes/não eleitos) de 'risco de transferência' (eleitos), cite cada adversário pelo nome com seu status, e diga o que cada caso exige. Nunca chame um eleito de concorrente pela mesma vaga. " +
    "Em 'Entrega × Voto', cruze o TRABALHO REAL DO GABINETE DA OPERAÇÃO (demandas resolvidas e obras concluídas por bairro — você recebeu esses números) com o voto por bairro. Classifique cada bairro relevante em: (a) CONSOLIDANDO — reduto de voto COM entrega (mantenha a cadência); (b) A CONVERTER — bairro com entrega mas pouco voto (o trabalho ainda não virou voto/base; falta relacionamento/evento); (c) REDUTO DESCOBERTO — muito voto e ZERO entrega (risco: alguém pode ocupar o espaço — urgência). A entrega é da OPERAÇÃO; só cruze com o voto se o candidato analisado for o próprio político da operação — se for adversário, trate a entrega apenas como presença da operação no território. Nunca invente entrega que não esteja nos números. Este bloco é o nosso diferencial: conecta governar com ganhar. " +
    "No plano, liste ações concretas por zona/bairro (cadastrar base de CRM, presença física, evento, lideranças), priorizando os REDUTOS DESCOBERTOS e os bairros A CONVERTER.";

  const prompt =
    `Escreva o briefing estratégico de campanha com base nos dados abaixo.\n\n` +
    fatos.join("\n") +
    `\n\nMáximo ~560 palavras, com os títulos acima (omita Momentum se não houver dado). Seja específico e cite bairros/zonas/adversários pelo nome. Priorize transformar os números em decisões.`;

  try {
    const { text } = await generateText({ model: modeloDoCerebro(cerebro), system, prompt, maxOutputTokens: 1600 });
    const texto = text.trim();
    if (!texto) return { ok: false, erro: "A IA não retornou texto. Tente novamente." };
    return { ok: true, texto, candidato: nome, adversarios, redutos: redutosNome, votosCandidatoReduto, votosMunicipio: votosNoMun, statusLabel: statusCandidato.label, statusCat: statusCandidato.cat };
  } catch {
    return { ok: false, erro: "Não consegui gerar agora. Tente novamente em instantes." };
  }
}
