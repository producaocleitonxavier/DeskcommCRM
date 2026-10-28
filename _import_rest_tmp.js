/**
 * Import nível-SEÇÃO via REST do Supabase (NÃO usa o pooler do Postgres).
 * Processa UM ano: streaming do votacao_secao -> insert em intel_secao_votos
 * (lotes) + acumula votos_total -> upsert intel_candidatos. Locais devem já
 * estar carregados (dim separada). Idempotência da seção: limpa por election_id
 * via REST antes (se houver).
 *
 * Uso (de dentro do repo): SB_URL=... SB_KEY=... node import_secao_rest.js <ano> <dirTse>
 */
const readline = require("readline");
const { spawn } = require("child_process");
const { createClient } = require("@supabase/supabase-js");

const ANO = process.argv[2];
const DIR = process.argv[3];
const { SB_URL, SB_KEY } = process.env;
if (!ANO || !DIR || !SB_URL || !SB_KEY) { console.error("faltam args/envs"); process.exit(1); }

const CARGOS = ANO === "2024" ? new Set(["11", "13"]) : new Set(["3", "6", "7"]);
const VS = { TURNO: 5, MUN: 13, ZONA: 15, SECAO: 16, CARGO: 17, QT: 21, SQ: 23 };
const CC = { TURNO: 5, CARGO: 13, SQ: 15, NR: 16, NM: 17, URNA: 18, NRPART: 25, SGPART: 26, COLIG: 33, SIT: 49 };
const strip = (s) => (s == null ? "" : s.replace(/^"|"$/g, ""));
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

function csvLines(zip, inner) {
  const p = spawn("unzip", ["-p", zip, inner]);
  p.stdout.setEncoding("latin1");
  return readline.createInterface({ input: p.stdout, crlfDelay: Infinity });
}

async function main() {
  // election ids
  const { data: els, error: ee } = await sb.from("intel_elections").select("id, turno, cargo_cod").eq("ano", Number(ANO));
  if (ee) throw new Error("elections: " + ee.message);
  const elecId = new Map();
  for (const e of els) elecId.set(`${e.turno}|${e.cargo_cod}`, e.id);
  const idsAno = [...new Set(els.map((e) => e.id))];
  console.error(`[${ANO}] elections:`, [...elecId.keys()].join(" "));

  // limpeza da seção (só se houver) — por election_id
  for (const id of idsAno) {
    const { count } = await sb.from("intel_secao_votos").select("election_id", { count: "exact", head: true }).eq("election_id", id);
    if (count && count > 0) {
      console.error(`[${ANO}] limpando ${count} da election ${id}...`);
      await sb.from("intel_secao_votos").delete().eq("election_id", id);
    }
  }

  // consulta_cand -> candMap
  const candMap = new Map();
  { let head = false;
    for await (const raw of csvLines(`${DIR}/consulta_cand_${ANO}.zip`, `consulta_cand_${ANO}_MG.csv`)) {
      if (!head) { head = true; continue; }
      const p = raw.split(";"); const cargo = strip(p[CC.CARGO]);
      if (!CARGOS.has(cargo)) continue;
      candMap.set(strip(p[CC.SQ]), { turno: strip(p[CC.TURNO]), cargo, nr: strip(p[CC.NR]), nome: strip(p[CC.NM]), urna: strip(p[CC.URNA]), sg: strip(p[CC.SGPART]), nrpart: strip(p[CC.NRPART]), colig: strip(p[CC.COLIG]), sit: strip(p[CC.SIT]) });
    } }
  console.error(`[${ANO}] candidatos: ${candMap.size.toLocaleString("pt-BR")}`);

  // streaming seção -> insert em lotes (REST) + votos_total — RITMO GENTIL:
  // lotes pequenos, SEQUENCIAL (sem paralelismo), com pausa entre eles.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const votosTotal = new Map();
  let buf = [], count = 0, head = false, lotes = 0;
  async function flush() {
    if (!buf.length) return;
    const lote = buf; buf = [];
    let tent = 0;
    for (;;) {
      const { error } = await sb.from("intel_secao_votos").insert(lote);
      if (!error) break;
      if (++tent > 5) throw new Error("insert secao: " + error.message);
      console.error(`  [${ANO}] retry lote (${error.message}) em ${tent * 2}s`);
      await sleep(tent * 2000); // backoff se o banco reclamar
    }
    count += lote.length; lotes++;
    if (lotes % 100 === 0) console.error(`  [${ANO}] secao: ${count.toLocaleString("pt-BR")}`);
    await sleep(40); // pausa gentil entre lotes
  }
  for await (const raw of csvLines(`${DIR}/y${ANO}/votacao_secao_${ANO}_MG.zip`, `votacao_secao_${ANO}_MG.csv`)) {
    if (!head) { head = true; continue; }
    const p = raw.split(";"); const cargo = strip(p[VS.CARGO]);
    if (!CARGOS.has(cargo)) continue;
    const sq = strip(p[VS.SQ]); if (!sq || sq.startsWith("-")) continue;
    const elId = elecId.get(`${strip(p[VS.TURNO])}|${cargo}`); if (!elId) continue;
    const q = parseInt(strip(p[VS.QT]), 10) || 0;
    buf.push({ election_id: elId, sq_candidato: sq, cd_municipio: parseInt(strip(p[VS.MUN]),10), nr_zona: parseInt(strip(p[VS.ZONA]),10), nr_secao: parseInt(strip(p[VS.SECAO]),10), votos: q });
    votosTotal.set(`${elId}|${sq}`, (votosTotal.get(`${elId}|${sq}`)||0) + q);
    if (buf.length >= 1500) await flush();
  }
  await flush();
  console.error(`[${ANO}] secao inserida: ${count.toLocaleString("pt-BR")} | pares: ${votosTotal.size.toLocaleString("pt-BR")}`);

  // upsert candidatos (REST)
  let cbuf = [], cins = 0;
  async function flushC() {
    if (!cbuf.length) return;
    const lote = cbuf; cbuf = [];
    const { error } = await sb.from("intel_candidatos").upsert(lote, { onConflict: "election_id,sq_candidato" });
    if (error) throw new Error("upsert cand: " + error.message);
    cins += lote.length;
  }
  for (const [sq, m] of candMap) {
    const elId = elecId.get(`${m.turno}|${m.cargo}`); if (!elId) continue;
    const pn = /^\d+$/.test(m.nrpart) ? parseInt(m.nrpart,10) : null;
    cbuf.push({ election_id: elId, sq_candidato: sq, nr_votavel: m.nr, nome: m.nome, nome_urna: m.urna||null, partido_sigla: m.sg||null, partido_num: pn, situacao: m.sit||null, coligacao: m.colig||null, votos_total: votosTotal.get(`${elId}|${sq}`)||0 });
    if (cbuf.length >= 500) await flushC();
  }
  await flushC();
  console.error(`[${ANO}] candidatos gravados: ${cins.toLocaleString("pt-BR")}`);
  console.error(`[${ANO}] OK.`);
}
main().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
