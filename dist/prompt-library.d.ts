import type { Logger } from "./logger.js";
export interface PromptCommandDefinition {
    name: string;
    description: string;
    content: string;
    argumentHint?: string;
    argumentNames: string[];
}
export declare function loadPromptCommandDefinitions(directory: string | undefined, logger?: Logger): Promise<PromptCommandDefinition[]>;
export declare function promptArgumentNames(content: string): string[];
export declare function expandNumericPlaceholders(content: string, args: string[]): string;
