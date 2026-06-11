/**
 * The mAItch search agent — "your search agent" in the architecture.
 *
 * Contract with the front end (same FE→BE pattern as legacy search — one
 * REST call, behind the search-box toggle):
 *
 *   turn({ query })                       → question | results
 *   turn({ sessionId, answer })           → question | results
 *
 * Guarantees:
 *   - at most TWO clarifying questions per session (enforced here, not
 *     trusted to the model),
 *   - a results turn carries EXACTLY three matches (padded from the
 *     candidate list if the planner under-selects),
 *   - the response is structured (question text + tappable options, or
 *     three products) — this is a search experience, not a chat box.
 */
import type { Product, ScoredProduct } from "../contract/product.js";
import type { MaitchEngine } from "../engine.js";
import type { Planner, PlannerDecision } from "./planner.js";
import { AnthropicPlanner, HeuristicPlanner } from "./planner.js";
import type { SessionStore } from "./sessions.js";
import { InMemorySessionStore } from "./sessions.js";

export const MAX_QUESTIONS = 2;
export const RESULT_COUNT = 3;
const CANDIDATE_POOL = 12;

export interface SearchTurnInput {
  /** The shopper's search-box query. Required on the first turn. */
  query?: string;
  /** Continue an existing session (answering a clarifying question). */
  sessionId?: string;
  /** The shopper's answer to the previous question. */
  answer?: string;
}

export interface ProductMatch {
  product: Product;
  score: number;
  reason: string;
}

export type SearchTurnResult =
  | {
      type: "question";
      sessionId: string;
      question: string;
      /** Short answers renderable as buttons/chips in the search UI. */
      options: string[];
      questionNumber: number;
    }
  | {
      type: "results";
      sessionId: string;
      results: ProductMatch[];
      rationale: string;
    };

export interface SearchAgentOptions {
  planner?: Planner;
  sessions?: SessionStore;
}

export class SearchAgent {
  private readonly planner: Planner;
  private readonly sessions: SessionStore;

  constructor(
    private readonly engine: MaitchEngine,
    opts: SearchAgentOptions = {},
  ) {
    this.planner =
      opts.planner ??
      (process.env.ANTHROPIC_API_KEY ? new AnthropicPlanner() : new HeuristicPlanner());
    this.sessions = opts.sessions ?? new InMemorySessionStore();
  }

  async turn(input: SearchTurnInput): Promise<SearchTurnResult> {
    const session = this.resolveSession(input);
    if (input.answer && input.sessionId) {
      session.answers.push(input.answer);
    }

    const effectiveQuery = [session.originalQuery, ...session.answers].join(" — ");
    const candidates = await this.engine.search(effectiveQuery, CANDIDATE_POOL);
    if (candidates.length === 0) {
      this.sessions.save(session);
      return { type: "results", sessionId: session.id, results: [], rationale: "no matches in the catalogue" };
    }

    const mayAskQuestion = session.questionsAsked < MAX_QUESTIONS;
    let decision: PlannerDecision;
    try {
      decision = await this.planner.plan({
        originalQuery: session.originalQuery,
        answers: session.answers,
        questionsAsked: session.questionsAsked,
        mayAskQuestion,
        candidates,
      });
    } catch {
      // Planner outage must never break the search box — degrade to top-3.
      decision = await new HeuristicPlanner().plan({
        originalQuery: session.originalQuery,
        answers: session.answers,
        questionsAsked: session.questionsAsked,
        mayAskQuestion: false,
        candidates,
      });
    }

    if (decision.action === "ask" && mayAskQuestion) {
      session.questionsAsked += 1;
      this.sessions.save(session);
      return {
        type: "question",
        sessionId: session.id,
        question: decision.question,
        options: decision.options.slice(0, 4),
        questionNumber: session.questionsAsked,
      };
    }

    const results = this.toExactlyThree(
      decision.action === "results" ? decision.selections : [],
      candidates,
    );
    this.sessions.save(session);
    return {
      type: "results",
      sessionId: session.id,
      results,
      rationale:
        decision.action === "results" ? decision.rationale : "best matches for your search",
    };
  }

  private resolveSession(input: SearchTurnInput) {
    if (input.sessionId) {
      const existing = this.sessions.get(input.sessionId);
      if (existing) return existing;
    }
    if (!input.query) {
      throw new Error("a new search turn requires a query");
    }
    return this.sessions.create(input.query);
  }

  /** Honour planner picks where valid, pad/truncate to exactly three. */
  private toExactlyThree(
    selections: Array<{ productId: string; reason: string }>,
    candidates: ScoredProduct[],
  ): ProductMatch[] {
    const byId = new Map(candidates.map((c) => [c.product.id, c]));
    const picked: ProductMatch[] = [];
    for (const selection of selections) {
      const candidate = byId.get(selection.productId);
      if (candidate && !picked.some((p) => p.product.id === candidate.product.id)) {
        picked.push({
          product: candidate.product,
          score: candidate.score,
          reason: selection.reason,
        });
      }
      if (picked.length === RESULT_COUNT) return picked;
    }
    for (const candidate of candidates) {
      if (picked.length === RESULT_COUNT) break;
      if (!picked.some((p) => p.product.id === candidate.product.id)) {
        picked.push({
          product: candidate.product,
          score: candidate.score,
          reason: "strong match for your search",
        });
      }
    }
    return picked.slice(0, RESULT_COUNT);
  }
}
