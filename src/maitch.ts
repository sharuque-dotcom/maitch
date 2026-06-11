/**
 * MaitchSearch — the one dependency.
 *
 * One deployment, three surfaces (search box, product pages, checkout),
 * two transports (REST for the storefront toggle, MCP for external agents).
 */
import { MaitchEngine, type MaitchEngineOptions } from "./engine.js";
import { SearchAgent, type SearchAgentOptions } from "./agent/search-agent.js";
import { MaitchTools, type MaitchToolsOptions } from "./layer3/tools.js";

export interface MaitchSearchOptions extends MaitchEngineOptions, MaitchToolsOptions {
  agent?: SearchAgentOptions;
}

export class MaitchSearch {
  readonly engine: MaitchEngine;
  readonly tools: MaitchTools;
  readonly agent: SearchAgent;

  constructor(opts: MaitchSearchOptions = {}) {
    this.engine = new MaitchEngine(opts);
    this.tools = new MaitchTools(this.engine, opts);
    this.agent = new SearchAgent(this.engine, opts.agent);
  }
}
