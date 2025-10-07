#!/usr/bin/env node
import { AgentSideConnection, ndJsonStream } from "@zed-industries/agent-client-protocol";
import { Codex } from "@openai/codex-sdk";
import { Readable, Writable } from "node:stream";
import { parseConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { CodexAgent } from "./agent.js";

async function main(): Promise<void> {
  const config = parseConfig(process.argv.slice(2), process.env);
  const logger = createLogger(config.logLevel);
  const codex = new Codex({
    baseUrl: config.codex.baseUrl,
    apiKey: config.codex.apiKey,
    codexPathOverride: config.codex.pathOverride,
  });

  const output = Writable.toWeb(process.stdout);
  const input = Readable.toWeb(process.stdin);
  const stream = ndJsonStream(output, input);

  new AgentSideConnection(
    (connection) => new CodexAgent(connection, codex, config, logger),
    stream,
  );
}

main().catch((error: unknown) => {
  const err = error as Error;
  console.error(`codex-acp-agent failed: ${err.message}`);
  process.exit(1);
});
