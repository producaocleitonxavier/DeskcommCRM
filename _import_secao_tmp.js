/**
 * Ingestão nível-SEÇÃO do Raio-X (TSE, MG) para o Postgres (pg + DB_URL).
 * Processa UM ano. Streaming com `for await` (serializado, backpressure OK).
 * Idempotente: limpa os dados do ano antes de inserir.
 *
 * Uso (de dentro do repo p/ resolver 'pg'):
 *   PG_URL=... node import_secao.js <ano> <dirTse>
 */
const readline = require("readline");
const { spawnSync, spawn } = require("child_process");
const { Client } = require("pg");

const ANO = process.argv[2];
const DIR = process.argv[3];
// Pooler em modo TRANSAÇÃO (6543): devolve a conexão a cada query, sem segurar
// sessão (evita exaustão de slots e drop por ociosidade). Ignora SET de sessão.
const PG_URL = (process.env.PG_URL || "").replace(":5432/", ":6543/");
if (!ANO || !DIR || !PG_URL) { console.error("faltam ANO/dir/PG_URL"); process.exit(1); }

const CARGOS = ANO === "2024" ? new Set(["11", "13"]) : new Set(["3", "6", "7"]);

const VS = { ANO: 2, TURNO: 5, MUN: 13, ZONA: 15, SECAO: 16, CARGO: 17, NR: 19, QT: 21, SQ: 23 };
const CC = { TURNO: 5, CARGO: 13, SQ: 15, NR: 16, NM: 17, URNA: 18, NRPART: 25, SGPART: 26, COLIG: 33, SIT: 49 };
const LV = { UF: 6, MUN: 7, ZONA: 9, SECAO: 10, NM: 15, END: 18, BAIRRO: 19, CEP: 20, LAT: 22, LNG: 23 };

const strip = (s) => (s == null ? "" : s.replace(/^"|"$/g, ""));
const num = (s) => { const t = strip(s).replace(",", "."); const n = parseFloat(t); return Number.isFinite(n) ? n : null; };

function csvLines(zip, inner) {
  const p = spawn("unzip", ["-p", zip, inner]);
  p.stdout.setEncoding("latin1");
  p.on("error", (e) => { console.error("spawn erro:", e.message); });
  return readline.createInterface({ input: p.stdout, crlfDelay: Infinity });
}
function innerName(zip) {
  const r = spawnSync("unzip", ["-l", zip], { encoding: "utf8" });
  const m = r.stdout.match(/(\S+\.csv)/i);
  return m ? m[1] : null;
}
function localInner(zip, ano) {
  const r = spawnSync("unzip", ["-l", zip], { encoding: "utf8" });
  const mg = r.stdout.match(/(\S*_MG\.csv)/i);
  if (mg) return mg[1];
  const br = r.stdout.match(new RegExp(`(eleitorado_local_votacao_${ano}\\.csv)`, "i"));
  return br ? br[1] : innerName(zip);
}

async function main() {
  async function novaConexao() {
    const c = new Client({ connectionString: PG_URL, ssl: { rejectUnauthorized: false }, keepAlive: true, query_timeout: 180000, statement_timeout: 180000 });
    c.on("error", (e) => console.error("pg client error:", e.message));
    await c.connect();
    return c;
  }
  let db = await novaConexao();

  // election id map (turno|cargo) -> id
  const er = await db.query("select id, turno, cargo_cod from intel_elections where ano = $1", [Number(ANO)]);
  const elecId = new Map();
  for (const r of er.rows) elecId.set(`${r.turno}|${r.cargo_cod}`, r.id);
  const idsAno = [...new Set([...elecId.values()])];
  console.error(`[${ANO}] elections:`, [...elecId.keys()].join(" "), "ids:", idsAno.join(","));

  // limpeza idempotente do ano — em LOTES (delete grande estoura o pooler)
  async function deleteLotes(table, where, params, lote = 50000) {
    let total = 0;
    for (;;) {
      const r = await db.query(`delete from ${table} where ctid in (select ctid from ${table} where ${where} limit ${lote})`, params);
      total += r.rowCount;
      if (!r.rowCount || r.rowCount < lote) break;
    }
    return total;
  }
  // Só intel_secao_votos precisa de limpeza (sem dedup). intel_candidatos (upsert)
  // e intel_locais (on conflict do nothing) são idempotentes — não deletar.
  console.error(`[${ANO}] limpando intel_secao_votos do ano (por election_id, usa indice)...`);
  let limpas = 0;
  for (const id of idsAno) {
    // = $1 usa o indice (election_id, sq_candidato); any(array) faria seq scan.
    for (;;) {
      const r = await db.query(`delete from intel_secao_votos where ctid in (select ctid from intel_secao_votos where election_id = $1 limit 10000)`, [id]);
      limpas += r.rowCount;
      if (!r.rowCount || r.rowCount < 10000) break;
    }
  }
  console.error(`[${ANO}] secao limpa: ${limpas.toLocaleString("pt-BR")}`);

  // ---- 1) consulta_cand -> candMap ----
  const candZip = `${DIR}/consulta_cand_${ANO}.zip`;
  const candInner = `consulta_cand_${ANO}_MG.csv`;
  const candMap = new Map();
  {
    let head = false;
    for await (const raw of csvLines(candZip, candInner)) {
      if (!head) { head = true; continue; }
      const p = raw.split(";");
      const cargo = strip(p[CC.CARGO]);
      if (!CARGOS.has(cargo)) continue;
      candMap.set(strip(p[CC.SQ]), {
        turno: strip(p[CC.TURNO]), cargo, nr: strip(p[CC.NR]), nome: strip(p[CC.NM]), urna: strip(p[CC.URNA]),
        sg: strip(p[CC.SGPART]), nrpart: strip(p[CC.NRPART]), colig: strip(p[CC.COLIG]), sit: strip(p[CC.SIT]),
      });
    }
  }
  console.error(`[${ANO}] candidatos (cargos alvo): ${candMap.size.toLocaleString("pt-BR")}`);

  // ---- 2) eleitorado_local (filtra MG) -> intel_locais ----
  const locZip = `${DIR}/eleitorado_local_${ANO}.zip`;
  const locInner = localInner(locZip, ANO);
  console.error(`[${ANO}] local inner: ${locInner}`);
  {
    const vistos = new Set();
    let buf = [], count = 0, head = false;
    const flush = async () => {
      if (!buf.length) return;
      const cols = 10, vals = [], ph = [];
      buf.forEach((r, i) => { const b = i * cols; ph.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10})`); vals.push(...r); });
      await db.query(`insert into intel_locais (ano,cd_municipio,nr_zona,nr_secao,local_nome,bairro,endereco,cep,latitude,longitude) values ${ph.join(",")} on conflict do nothing`, vals);
      count += buf.length; buf = [];
    };
    for await (const raw of csvLines(locZip, locInner)) {
      if (!head) { head = true; continue; }
      const p = raw.split(";");
      if (strip(p[LV.UF]) !== "MG") continue;
      const mun = strip(p[LV.MUN]), zona = strip(p[LV.ZONA]), secao = strip(p[LV.SECAO]);
      const k = `${mun}|${zona}|${secao}`;
      if (vistos.has(k)) continue; vistos.add(k);
      buf.push([Number(ANO), parseInt(mun,10), parseInt(zona,10), parseInt(secao,10), strip(p[LV.NM]), strip(p[LV.BAIRRO]), strip(p[LV.END]), strip(p[LV.CEP]), num(p[LV.LAT]), num(p[LV.LNG])]);
      if (buf.length >= 800) await flush();
    }
    await flush();
    console.error(`[${ANO}] locais MG: ${count.toLocaleString("pt-BR")}`);
  }

  // Reconecta: a leitura longa do arquivo BR de locais deixa a conexão ociosa
  // e o pooler a derruba — uma conexão fresca evita o insert pendurado.
  try { await db.end(); } catch { /* ok */ }
  db = await novaConexao();

  // ---- 3) votacao_secao -> intel_secao_votos + votos_total ----
  const vsZip = `${DIR}/y${ANO}/votacao_secao_${ANO}_MG.zip`;
  const vsInner = `votacao_secao_${ANO}_MG.csv`;
  const votosTotal = new Map();
  {
    let buf = [], count = 0, head = false;
    const flush = async () => {
      if (!buf.length) return;
      const vstr = buf.map((r) => `(${r[0]},${r[1]},${r[2]},${r[3]},${r[4]},${r[5]})`).join(",");
      await db.query(`insert into intel_secao_votos (election_id,sq_candidato,cd_municipio,nr_zona,nr_secao,votos) values ${vstr}`);
      count += buf.length; buf = [];
      if (count % 500000 === 0) console.error(`  [${ANO}] seção: ${count.toLocaleString("pt-BR")}`);
    };
    for await (const raw of csvLines(vsZip, vsInner)) {
      if (!head) { head = true; continue; }
      const p = raw.split(";");
      const cargo = strip(p[VS.CARGO]);
      if (!CARGOS.has(cargo)) continue;
      const sq = strip(p[VS.SQ]);
      if (!sq || sq.startsWith("-")) continue; // branco/nulo/legenda
      const elId = elecId.get(`${strip(p[VS.TURNO])}|${cargo}`);
      if (!elId) continue;
      const mun = parseInt(strip(p[VS.MUN]),10), zona = parseInt(strip(p[VS.ZONA]),10), secao = parseInt(strip(p[VS.SECAO]),10), q = parseInt(strip(p[VS.QT]),10) || 0;
      buf.push([elId, sq, mun, zona, secao, q]);
      const tk = `${elId}|${sq}`; votosTotal.set(tk, (votosTotal.get(tk) || 0) + q);
      if (buf.length >= 5000) await flush();
    }
    await flush();
    console.error(`[${ANO}] secao_votos: ${count.toLocaleString("pt-BR")} | pares(el|sq): ${votosTotal.size.toLocaleString("pt-BR")}`);
  }

  // ---- 4) intel_candidatos ----
  {
    let buf = [], ins = 0;
    const flush = async () => {
      if (!buf.length) return;
      const cols = 10, vals = [], ph = [];
      buf.forEach((r, i) => { const b = i * cols; ph.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10})`); vals.push(...r); });
      await db.query(`insert into intel_candidatos (election_id,sq_candidato,nr_votavel,nome,nome_urna,partido_sigla,partido_num,situacao,coligacao,votos_total) values ${ph.join(",")} on conflict (election_id,sq_candidato) do update set votos_total = excluded.votos_total`, vals);
      ins += buf.length; buf = [];
    };
    for (const [sq, m] of candMap) {
      const elId = elecId.get(`${m.turno}|${m.cargo}`);
      if (!elId) continue;
      const vt = votosTotal.get(`${elId}|${sq}`) || 0;
      const pn = /^\d+$/.test(m.nrpart) ? parseInt(m.nrpart, 10) : null;
      buf.push([elId, sq, m.nr, m.nome, m.urna || null, m.sg || null, pn, m.sit || null, m.colig || null, vt]);
      if (buf.length >= 800) await flush();
    }
    await flush();
    console.error(`[${ANO}] intel_candidatos: ${ins.toLocaleString("pt-BR")}`);
  }

  await db.end();
  console.error(`[${ANO}] OK.`);
}
main().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
