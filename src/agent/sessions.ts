import { randomUUID } from "node:crypto";

/**
 * Per-search-session state. This is what enforces the product rule:
 * at most TWO clarifying questions per session, then results.
 */
export interface SearchSession {
  id: string;
  originalQuery: string;
  /** Answers the shopper gave to clarifying questions, in order. */
  answers: string[];
  questionsAsked: number;
  createdAt: number;
}

export interface SessionStore {
  get(id: string): SearchSession | undefined;
  create(query: string): SearchSession;
  save(session: SearchSession): void;
}

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, SearchSession>();

  constructor(private readonly ttlMs = 30 * 60 * 1000) {}

  get(id: string): SearchSession | undefined {
    this.evict();
    return this.sessions.get(id);
  }

  create(query: string): SearchSession {
    const session: SearchSession = {
      id: randomUUID(),
      originalQuery: query,
      answers: [],
      questionsAsked: 0,
      createdAt: Date.now(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  save(session: SearchSession): void {
    this.sessions.set(session.id, session);
  }

  private evict(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, session] of this.sessions) {
      if (session.createdAt < cutoff) this.sessions.delete(id);
    }
  }
}
