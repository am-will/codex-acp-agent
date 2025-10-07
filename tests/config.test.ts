import { join } from "node:path";
import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("honors environment defaults and CLI overrides", () => {
    const env = {
      CODEX_MODEL: "gpt-4.1-mini",
      CODEX_ALLOW_COMMANDS: "false",
      CODEX_PROMPTS_DIR: "~/custom-prompts",
    } as NodeJS.ProcessEnv;

    const cfg = parseConfig(["--allow-commands", "--log-level", "debug"], env);
    expect(cfg.model).toBe("gpt-4.1-mini");
    expect(cfg.allowCommands).toBe(true);
    expect(cfg.logLevel).toBe("debug");
    expect(cfg.promptsDirectory).toBe(join(homedir(), "custom-prompts"));
  });

  it("parses --prompts-dir override", () => {
    const cfg = parseConfig(["--prompts-dir", "./relative/path"], {});
    expect(cfg.promptsDirectory).toBeDefined();
    expect(cfg.promptsDirectory?.endsWith("relative/path")).toBe(true);
  });
});
