import type { AvailableCommand, ContentBlock } from "@zed-industries/agent-client-protocol";
import type { CodexAgentConfig } from "./config.js";
import type { Logger } from "./logger.js";
export interface CommandContext {
    workingDirectory: string;
    model?: string;
}
interface SlashCommandDefinition {
    name: string;
    description: string;
    hint?: string;
    hidden?: boolean;
    buildPrompt: (input: string, context: CommandContext) => string;
}
export interface SlashCommandMatch {
    definition: SlashCommandDefinition;
    input: string;
    blockIndex: number;
    remainder?: string;
}
export declare class SlashCommandRegistry {
    private readonly config;
    private readonly logger;
    private definitions;
    private availableCommands;
    private loaded;
    private lastRefreshTime;
    private static readonly REFRESH_INTERVAL_MS;
    constructor(config: CodexAgentConfig, logger: Logger);
    refresh(): Promise<void>;
    getAvailableCommands(): AvailableCommand[];
    refreshIfNeeded(): Promise<void>;
    match(blocks: ContentBlock[]): SlashCommandMatch | undefined;
    apply(blocks: ContentBlock[], match: SlashCommandMatch, context: CommandContext): ContentBlock[];
    private createBuiltInDefinitions;
    private createPromptDefinitions;
}
export {};
