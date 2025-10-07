import type { SandboxMode } from "@openai/codex-sdk";
import type { LogLevel } from "./logger.js";
export interface CodexAgentConfig {
    model?: string;
    sandboxMode?: SandboxMode;
    skipGitRepoCheck: boolean;
    allowCommands: boolean;
    sendReasoning: boolean;
    logLevel: LogLevel;
    promptsDirectory?: string;
    codex: {
        baseUrl?: string;
        apiKey?: string;
        pathOverride?: string;
    };
}
export declare function parseConfig(argv: string[], env: NodeJS.ProcessEnv): CodexAgentConfig;
