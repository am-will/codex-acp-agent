import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, writeFile } from "node:fs/promises";
import { describe, expect, test, vi } from "vitest";
import type { ContentBlock } from "@zed-industries/agent-client-protocol";
import type { CodexAgentConfig } from "../src/config.js";
import type { Logger } from "../src/logger.js";
import { SlashCommandRegistry } from "../src/slash-commands.js";

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

describe("slash commands", () => {
  test("advertises enabled commands", async () => {
    const registry = new SlashCommandRegistry(createConfig(), testLogger);
    await registry.refresh();

    const names = registry.getAvailableCommands().map((command) => command.name);

    expect(names).toEqual(["plan", "test", "web"]);
  });

  test("omits command execution helpers when allowCommands is false", async () => {
    const registry = new SlashCommandRegistry(createConfig({ allowCommands: false }), testLogger);
    await registry.refresh();

    const names = registry.getAvailableCommands().map((command) => command.name);

    expect(names).toEqual(["plan", "web"]);
  });

  test("matches slash commands in prompt blocks", async () => {
    const registry = new SlashCommandRegistry(createConfig(), testLogger);
    await registry.refresh();

    const blocks: ContentBlock[] = [
      { type: "text", text: "/plan Improve caching\nConsider existing APIs" },
    ];

    const match = registry.match(blocks);
    expect(match).toBeTruthy();
    expect(match?.definition.name).toBe("plan");
    expect(match?.input).toBe("Improve caching");
    expect(match?.remainder).toBe("Consider existing APIs");
  });

  test("does not match disabled commands", async () => {
    const registry = new SlashCommandRegistry(createConfig({ allowCommands: false }), testLogger);
    await registry.refresh();

    const blocks: ContentBlock[] = [{ type: "text", text: "/test run unit" }];

    const match = registry.match(blocks);
    expect(match).toBeUndefined();
  });

  test("transforms prompt blocks when applying a command", async () => {
    const registry = new SlashCommandRegistry(createConfig(), testLogger);
    await registry.refresh();

    const blocks: ContentBlock[] = [
      { type: "text", text: "/plan Add telemetry\nCapture key metrics" },
      { type: "text", text: "Extra context" },
    ];

    const match = registry.match(blocks);
    expect(match).toBeTruthy();

    const transformed = registry.apply(blocks, match!, {
      workingDirectory: "/workspace/project",
    });

    expect(transformed).toHaveLength(3);
    expect(transformed[0].type).toBe("text");
    expect(transformed[0].text).toContain("/plan command");
    expect(transformed[1]).toEqual({ type: "text", text: "Capture key metrics" });
    expect(transformed[2]).toEqual({ type: "text", text: "Extra context" });
  });

  test("loads slash commands from Codex prompt directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-prompts-"));
    await writeFile(
      join(directory, "dev.md"),
      "# /dev Command\n\nWhen this command is used, adopt the dev persona.\n",
      "utf8",
    );

    const registry = new SlashCommandRegistry(createConfig({ promptsDirectory: directory }), testLogger);
    await registry.refresh();

    const names = registry.getAvailableCommands().map((command) => command.name);

    expect(names).toContain("dev");

    const match = registry.match([{ type: "text", text: "/prompts:dev" }]);
    expect(match).toBeTruthy();
    expect(match?.definition.name).toBe("prompts:dev");
  });

  test("expands numeric placeholders in custom prompts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-prompts-"));
    await writeFile(
      join(directory, "review.md"),
      "Review $1 before merging.\n",
      "utf8",
    );

    const registry = new SlashCommandRegistry(createConfig({ promptsDirectory: directory }), testLogger);
    await registry.refresh();

    const blocks: ContentBlock[] = [{ type: "text", text: "/prompts:review docs/README.md" }];
    const match = registry.match(blocks);
    expect(match).toBeTruthy();

    const transformed = registry.apply(blocks, match!, { workingDirectory: "/repo" });
    expect(transformed[0].type).toBe("text");
    expect(transformed[0].text).toContain("Review docs/README.md before merging.");
  });

  test("requires named arguments for custom prompts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-prompts-"));
    await writeFile(
      join(directory, "deploy.md"),
      "---\nargument-hint: env=production\n---\nDeploy to $ENV\n",
      "utf8",
    );

    const registry = new SlashCommandRegistry(createConfig({ promptsDirectory: directory }), testLogger);
    await registry.refresh();

    const blocks: ContentBlock[] = [{ type: "text", text: "/prompts:deploy" }];
    const match = registry.match(blocks);
    expect(match).toBeTruthy();

    expect(() => registry.apply(blocks, match!, { workingDirectory: "/repo" })).toThrow(
      /Missing required args for \/prompts:deploy/i,
    );
  });

  test("matches prompt base name and legacy alias", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codex-prompts-"));
    await writeFile(
      join(directory, "dev.md"),
      "# /dev Command\n\nSwitch to dev persona.\n",
      "utf8",
    );

    const registry = new SlashCommandRegistry(createConfig({ promptsDirectory: directory }), testLogger);
    await registry.refresh();

    const baseMatch = registry.match([{ type: "text", text: "/dev" }]);
    expect(baseMatch).toBeTruthy();
    expect(baseMatch?.definition.name).toBe("dev");

    const aliasMatch = registry.match([{ type: "text", text: "/prompts:dev" }]);
    expect(aliasMatch).toBeTruthy();
    expect(aliasMatch?.definition.name).toBe("prompts:dev");
  });

  test("refreshIfNeeded reloads new prompt definitions", async () => {
    vi.useFakeTimers();
    try {
      const directory = await mkdtemp(join(tmpdir(), "codex-prompts-"));
      await writeFile(
        join(directory, "dev.md"),
        "# /dev Command\n\nDev persona.\n",
        "utf8",
      );

      const registry = new SlashCommandRegistry(createConfig({ promptsDirectory: directory }), testLogger);

      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      await registry.refresh();
      expect(registry.getAvailableCommands().map((command) => command.name)).not.toContain("review");

      await writeFile(
        join(directory, "review.md"),
        "# /review Command\n\nReview instructions.\n",
        "utf8",
      );

      vi.setSystemTime(new Date("2025-01-01T00:00:07Z"));
      await registry.refreshIfNeeded();

      const names = registry.getAvailableCommands().map((command) => command.name);
      expect(names).toContain("dev");
      expect(names).toContain("review");
    } finally {
      vi.useRealTimers();
    }
  });
});
