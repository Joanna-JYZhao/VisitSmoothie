/* Calls /api/annual with the Wang Xiulan demo facts. Usage: BASE=http://localhost:3000 npx tsx scripts/annual.smoke.ts */
import { buildWangXiulanState } from "../src/lib/demo-wang";
import { buildAnnualFacts } from "../src/lib/metrics";

async function main() {
  const base = process.env.BASE || "http://localhost:3000";
  const state = buildWangXiulanState();
  const facts = buildAnnualFacts(state);
  const t = Date.now();
  const res = await fetch(`${base}/api/annual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: state.profile, facts }),
  });
  const json = await res.json();
  console.log(`[${res.status}] ${((Date.now() - t) / 1000).toFixed(1)}s  mode=${json.mode}`);
  console.log(JSON.stringify(json.summary ?? json, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
