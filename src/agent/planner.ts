/**
 * The planner decides, per turn: ask ONE smart clarifying question, or
 * deliver exactly three matches. The Anthropic planner does this with
 * Claude + structured outputs; the heuristic planner is the zero-key
 * fallback (it never asks — it just returns the top three).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ScoredProduct } from "../contract/product.js";

export interface PlannerContext {
  originalQuery: string;
  answers: string[];
  questionsAsked: number;
  /** Hard cap from the session — when false the planner MUST return results. */
  mayAskQuestion: boolean;
  candidates: ScoredProduct[];
}

export interface PlannerSelection {
  productId: string;
  reason: string;
}

export type PlannerDecision =
  | { action: "ask"; question: string; options: string[] }
  | { action: "results"; selections: PlannerSelection[]; rationale: string };

export interface Planner {
  plan(ctx: PlannerContext): Promise<PlannerDecision>;
}

/* ------------------------------------------------------------------ */
/* Heuristic planner — no LLM, never asks                              */
/* ------------------------------------------------------------------ */

export class HeuristicPlanner implements Planner {
  async plan(ctx: PlannerContext): Promise<PlannerDecision> {
    return {
      action: "results",
      selections: ctx.candidates.slice(0, 3).map((c) => ({
        productId: c.product.id,
        reason: `closest match for "${ctx.originalQuery}"`,
      })),
      rationale: "top semantic matches (heuristic mode — no LLM configured)",
    };
  }
}

/* ------------------------------------------------------------------ */
/* Anthropic planner — Claude decides ask vs. deliver                  */
/* ------------------------------------------------------------------ */

const DECISION_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["ask", "results"] },
    question: {
      type: "string",
      description: "The single clarifying question. Empty string when action is 'results'.",
    },
    options: {
      type: "array",
      items: { type: "string" },
      description:
        "2-4 short answer options for the question, renderable as buttons. Empty when action is 'results'.",
    },
    selections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          productId: { type: "string" },
          reason: { type: "string", description: "One shopper-facing sentence: why this match." },
        },
        required: ["productId", "reason"],
        additionalProperties: false,
      },
      description: "Exactly 3 products when action is 'results'. Empty when action is 'ask'.",
    },
    rationale: {
      type: "string",
      description: "One sentence summarising the interpretation of the shopper's intent.",
    },
  },
  required: ["action", "question", "options", "selections", "rationale"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are the planning brain of mAItch Search, an AI-native product discovery layer that replaces a legacy keyword search box. You receive a shopper's query, any answers they already gave, and a candidate list retrieved by meaning-based (vector) search over the product catalogue.

Decide ONE of:
- action "ask": the query is genuinely ambiguous in a way that changes which products win (e.g. budget, use case, size, platform). Ask ONE smart question with 2-4 short tappable options. This is not a chatbot — the question must be a single, structured step, never small talk.
- action "results": pick EXACTLY 3 products from the candidate list (by their productId) that best satisfy the intent, each with a one-sentence shopper-facing reason.

Rules:
- Never ask when the intent is already clear enough to rank confidently, and never ask about something the candidates don't actually differ on.
- If told you may not ask (question budget exhausted), you MUST return results.
- Only ever select productIds that appear in the candidate list.
- Prefer in-stock products when relevance is comparable.`;

export interface AnthropicPlannerOptions {
  apiKey?: string;
  model?: string;
  client?: Anthropic;
}

export class AnthropicPlanner implements Planner {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: AnthropicPlannerOptions = {}) {
    this.client = opts.client ?? new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
    this.model = opts.model ?? "claude-opus-4-8";
  }

  async plan(ctx: PlannerContext): Promise<PlannerDecision> {
    const candidateList = ctx.candidates.map((c) => ({
      productId: c.product.id,
      title: c.product.title,
      brand: c.product.brand,
      category: c.product.category,
      price: c.product.price,
      attributes: c.product.attributes,
      tags: c.product.tags,
      inStock: c.product.inStock,
      score: Number(c.score.toFixed(3)),
    }));

    const userPayload = {
      shopperQuery: ctx.originalQuery,
      answersToPreviousQuestions: ctx.answers,
      questionsAlreadyAsked: ctx.questionsAsked,
      mayAskQuestion: ctx.mayAskQuestion,
      candidates: candidateList,
    };

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: DECISION_SCHEMA } },
      messages: [{ role: "user", content: JSON.stringify(userPayload) }],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("planner request was refused");
    }
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("planner returned no text content");
    const decision = JSON.parse(text) as {
      action: "ask" | "results";
      question: string;
      options: string[];
      selections: PlannerSelection[];
      rationale: string;
    };

    if (decision.action === "ask" && ctx.mayAskQuestion) {
      return { action: "ask", question: decision.question, options: decision.options };
    }
    return {
      action: "results",
      selections: decision.selections,
      rationale: decision.rationale,
    };
  }
}
