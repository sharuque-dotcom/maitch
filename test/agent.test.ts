import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MaitchSearch } from "../src/maitch.js";
import { MAX_QUESTIONS, RESULT_COUNT } from "../src/agent/search-agent.js";
import type { Planner, PlannerContext, PlannerDecision } from "../src/agent/planner.js";
import type { Product } from "../src/contract/product.js";

const catalog = JSON.parse(
  await readFile(new URL("../examples/catalog.json", import.meta.url), "utf8"),
) as Product[];

async function build(planner?: Planner): Promise<MaitchSearch> {
  const maitch = new MaitchSearch({ agent: planner ? { planner } : undefined });
  await maitch.engine.ingestProducts(catalog);
  return maitch;
}

/** Planner that always wants to ask — used to verify the hard question cap. */
class AlwaysAskPlanner implements Planner {
  calls: PlannerContext[] = [];
  async plan(ctx: PlannerContext): Promise<PlannerDecision> {
    this.calls.push(ctx);
    if (ctx.mayAskQuestion) {
      return { action: "ask", question: "Budget?", options: ["under €50", "€50-150", "€150+"] };
    }
    return {
      action: "results",
      selections: ctx.candidates.slice(0, 3).map((c) => ({ productId: c.product.id, reason: "fits" })),
      rationale: "forced results after question budget",
    };
  }
}

class ThrowingPlanner implements Planner {
  async plan(): Promise<PlannerDecision> {
    throw new Error("LLM is down");
  }
}

test("heuristic mode returns exactly three matches, no questions", async () => {
  const maitch = await build(); // no ANTHROPIC_API_KEY in tests → heuristic planner
  const result = await maitch.agent.turn({ query: "headphones for long flights" });
  assert.equal(result.type, "results");
  assert.equal(result.results.length, RESULT_COUNT);
  // The noise-cancelling travel headphones should win for this intent.
  assert.equal(result.results[0]!.product.id, "HP-ANC-700");
});

test("agent enforces the two-question maximum even if the planner keeps asking", async () => {
  const planner = new AlwaysAskPlanner();
  const maitch = await build(planner);

  let turn = await maitch.agent.turn({ query: "headphones" });
  assert.equal(turn.type, "question");
  assert.equal(turn.questionNumber, 1);

  turn = await maitch.agent.turn({ sessionId: turn.sessionId, answer: "under €50" });
  assert.equal(turn.type, "question");
  assert.equal(turn.questionNumber, MAX_QUESTIONS);

  turn = await maitch.agent.turn({ sessionId: turn.sessionId, answer: "for casual listening" });
  assert.equal(turn.type, "results");
  assert.equal(turn.results.length, RESULT_COUNT);

  // Third planner call must have been told it may not ask.
  assert.equal(planner.calls[2]!.mayAskQuestion, false);
  assert.deepEqual(planner.calls[2]!.answers, ["under €50", "for casual listening"]);
});

test("answers refine the ranking on follow-up turns", async () => {
  const planner = new AlwaysAskPlanner();
  const maitch = await build(planner);
  let turn = await maitch.agent.turn({ query: "headphones" });
  assert.equal(turn.type, "question");
  turn = await maitch.agent.turn({ sessionId: turn.sessionId, answer: "for running and gym" });
  turn = await maitch.agent.turn({ sessionId: turn.sessionId, answer: "sweat proof" });
  assert.equal(turn.type, "results");
  assert.equal(turn.results[0]!.product.id, "HP-SPT-200");
});

test("planner outage degrades to top-3 instead of failing the search box", async () => {
  const maitch = await build(new ThrowingPlanner());
  const result = await maitch.agent.turn({ query: "studio mixing headphones" });
  assert.equal(result.type, "results");
  assert.equal(result.results.length, RESULT_COUNT);
});

test("planner selections are validated against candidates and padded to three", async () => {
  const planner: Planner = {
    async plan(ctx) {
      return {
        action: "results",
        selections: [
          { productId: "NOT-IN-CATALOG", reason: "hallucinated" },
          { productId: ctx.candidates[0]!.product.id, reason: "real pick" },
        ],
        rationale: "partial selection",
      };
    },
  };
  const maitch = await build(planner);
  const result = await maitch.agent.turn({ query: "headphones" });
  assert.equal(result.type, "results");
  assert.equal(result.results.length, RESULT_COUNT);
  assert.ok(result.results.every((r) => r.product.id !== "NOT-IN-CATALOG"));
  const ids = result.results.map((r) => r.product.id);
  assert.equal(new Set(ids).size, RESULT_COUNT);
});

test("a new turn without query or valid session is rejected", async () => {
  const maitch = await build();
  await assert.rejects(() => maitch.agent.turn({ answer: "blue" }), /requires a query/);
});
