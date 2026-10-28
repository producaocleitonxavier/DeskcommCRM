/**
 * Upload das fotos de candidatos (TSE) para o bucket público intel-fotos.
 * USA SÓ a API REST do Supabase (service_role) — não toca no pooler do Postgres,
 * então roda em paralelo com os imports. Sobe só as fotos dos candidatos
 * presentes em intel_candidatos do ano. Arquivo: FMG<SQ>_div.jpg -> {ano}/{sq}.jpg.
 *
 * Uso (de dentro do repo): SB_URL=... SB_KEY=... node upload_fotos.js <ano> <fotoZip> <tmpDir>
 */
const fs = require("fs");
const { spawnSync } = require("child_process");
const { createClient } = require("@supabase/supabase-js");

const ANO = process.argv[2];
const ZIP = process.argv[3];
const TMP = process.argv[4];
const { SB_URL, SB_KEY } = process.env;
if (!ANO || !ZIP || !TMP || !SB_URL || !SB_KEY) { console.error("faltam args/envs"); process.exit(1); }

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

async function main() {
  // bucket público
  const { error: be } = await sb.storage.createBucket("intel-fotos", { public: true });
  if (be && !/exist/i.test(be.message)) console.error("aviso bucket:", be.message);

  // election ids do ano
  const { data: els, error: ee } = await sb.from("intel_elections").select("id").eq("ano", Number(ANO));
  if (ee) throw new Error("elections: " + ee.message);
  const ids = (els || []).map((e) => e.id);
  if (!ids.length) throw new Error("sem eleições para " + ANO);

  // SQs (paginado, PostgREST cap 1000)
  const sqs = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("intel_candidatos").select("sq_candidato").in("election_id", ids).range(from, from + 999);
    if (error) throw new Error("candidatos: " + error.message);
    if (!data || !data.length) break;
    for (const r of data) sqs.push(String(r.sq_candidato));
    if (data.length < 1000) break;
  }
  console.error(`[${ANO}] candidatos no banco: ${sqs.length.toLocaleString("pt-BR")}`);

  // extrai zip
  const outDir = `${TMP}/foto_${ANO}`;
  fs.mkdirSync(outDir, { recursive: true });
  console.error(`[${ANO}] extraindo...`);
  spawnSync("unzip", ["-o", "-q", ZIP, "-d", outDir]);

  let ok = 0, semArquivo = 0, erro = 0;
  const fila = [...sqs];
  async function worker() {
    while (fila.length) {
      const sq = fila.pop();
      const fp = `${outDir}/FMG${sq}_div.jpg`;
      if (!fs.existsSync(fp)) { semArquivo++; continue; }
      try {
        const buf = fs.readFileSync(fp);
        const { error } = await sb.storage.from("intel-fotos").upload(`${ANO}/${sq}.jpg`, buf, { contentType: "image/jpeg", upsert: true });
        if (error) erro++; else ok++;
      } catch { erro++; }
      if ((ok + erro) % 1000 === 0 && ok + erro > 0) console.error(`  [${ANO}] ${ok + erro}/${sqs.length} (ok=${ok})`);
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker));
  console.error(`[${ANO}] fotos enviadas: ${ok} | sem foto: ${semArquivo} | erros: ${erro}`);
  fs.rmSync(outDir, { recursive: true, force: true });
}
main().catch((e) => { console.error("FALHOU:", e.message); process.exit(1); });
