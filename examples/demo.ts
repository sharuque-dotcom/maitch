/**
 * CLI demo: ingest the sample catalogue and run a couple of search turns.
 *
 *   npm run demo
 *
 * With ANTHROPIC_API_KEY set, the Claude planner decides whether to ask a
 * clarifying question; without it, the heuristic planner returns top-3.
 */
import { readFile } from "node:fs/promises";
import { MaitchSearch, type Product } from "../src/index.js";

const products = JSON.parse(
  await readFile(new URL("./catalog.json", import.meta.url), "utf8"),
) as Product[];

const maitch = new MaitchSearch();
await maitch.engine.ingestProducts(products);
console.log(`Indexed ${products.length} products.\n`);

async function show(query: string) {
  console.log(`> "${query}"`);
  let result = await maitch.agent.turn({ query });
  while (result.type === "question") {
    console.log(`  Q${result.questionNumber}: ${result.question}`);
    console.log(`  options: ${result.options.join(" | ")}`);
    const answer = result.options[0] ?? "no preference";
    console.log(`  (auto-answering: "${answer}")`);
    result = await maitch.agent.turn({ sessionId: result.sessionId, answer });
  }
  console.log(`  rationale: ${result.rationale}`);
  for (const match of result.results) {
    console.log(
      `  - ${match.product.title} (${match.product.id}, score ${match.score.toFixed(2)}): ${match.reason}`,
    );
  }
  console.log();
}

await show("headphones for long flights");
await show("something for my morning runs");

const compat = await maitch.tools.compatibility("ACC-CASE-700", "HP-ANC-700");
console.log("compatibility ACC-CASE-700 ↔ HP-ANC-700:", compat);
