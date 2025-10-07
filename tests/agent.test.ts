import { describe, expect, test, vi } from "vitest";
import type { SessionNotification } from "@zed-industries/agent-client-protocol";
import { CodexAgent } from "../src/agent.js";
import type { CodexAgentConfig } from "../src/config.js";
import type { Logger } from "../src/logger.js";

class TestConnection {
  public updates: SessionNotification[] = [];

  async sessionUpdate(notification: SessionNotification): Promise<void> {
    this.updates.push(notification);
  }
}

function createConfig(overrides: Partial<CodexAgentConfig> = {}): CodexAgentConfig {
  return {
    model: undefined,
    sandboxMode: undefined,
    skipGitRepoCheck: false,
    allowCommands: true,
    sendReasoning: true,
    logLevel: "info",
    promptsDirectory: undefined,
    codex: {},
    ...overrides,
  };
}

const testLogger: Logger = {
  level: "silent",
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};

describe("CodexAgent", () => {
  test("advertises slash commands after session response", async () => {
    const connection = new TestConnection();

    const fakeThread = {
      runStreamed: vi.fn().mockResolvedValue({
        events: {
          [Symbol.asyncIterator]: () => ({
            async next() {
              return { done: true, value: undefined };
            },
            async return() {
              return { done: true, value: undefined };
            },
          }),
        },
      }),
    };

    const codex = {
      startThread: vi.fn().mockReturnValue(fakeThread),
    };

    const agent = new CodexAgent(
      connection as unknown as any,
      codex as any,
      createConfig(),
      testLogger,
    );

    const response = await agent.newSession({ cwd: "/workspace", mcpServers: [] });
    expect(response.sessionId).toBeTruthy();
    expect(connection.updates).toHaveLength(0);

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(connection.updates).toHaveLength(1);
    expect(connection.updates[0]?.update.sessionUpdate).toBe("available_commands_update");
  });
});
