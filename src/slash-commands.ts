import type { AvailableCommand, ContentBlock } from "@zed-industries/agent-client-protocol";

import type { CodexAgentConfig } from "./config.js";
import type { Logger } from "./logger.js";
import {
  expandNumericPlaceholders,
  loadPromptCommandDefinitions,
  type PromptCommandDefinition,
} from "./prompt-library.js";

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

const SLASH_COMMAND_REGEX = /^\s*\/([a-zA-Z0-9_\-:]+)(?:\s+(.*?))?(?:\r?\n([\s\S]*))?$/;
const PROMPTS_CMD_PREFIX = "prompts";
const PROMPT_ARG_REGEX = /\$[A-Z][A-Z0-9_]*/g;

export class SlashCommandRegistry {
  private definitions = new Map<string, SlashCommandDefinition>();
  private availableCommands: AvailableCommand[] = [];
  private loaded = false;
  private lastRefreshTime = 0;

  private static readonly REFRESH_INTERVAL_MS = 5_000;

  constructor(private readonly config: CodexAgentConfig, private readonly logger: Logger) {}

  async refresh(): Promise<void> {
    const definitions: SlashCommandDefinition[] = [];

    definitions.push(...this.createBuiltInDefinitions());

    const promptDefinitions = await loadPromptCommandDefinitions(
      this.config.promptsDirectory,
      this.logger,
    );

    for (const promptDefinition of promptDefinitions) {
      definitions.push(...this.createPromptDefinitions(promptDefinition));
    }

    const definitionMap = new Map<string, SlashCommandDefinition>();
    for (const definition of definitions) {
      definitionMap.set(definition.name.toLowerCase(), definition);
    }

    this.definitions = definitionMap;

    this.availableCommands = definitions
      .filter((definition) => !definition.hidden)
      .map((definition) => ({
        name: definition.name,
        description: definition.description,
        input: definition.hint ? { hint: definition.hint } : undefined,
      }));

    this.loaded = true;
    this.lastRefreshTime = Date.now();

    this.logger.debug("slash command registry refreshed", {
      commands: this.availableCommands.map((command) => command.name),
    });
  }

  getAvailableCommands(): AvailableCommand[] {
    if (!this.loaded) return [];
    return [...this.availableCommands];
  }

  async refreshIfNeeded(): Promise<void> {
    if (!this.loaded) {
      await this.refresh();
      return;
    }

    const now = Date.now();
    if (now - this.lastRefreshTime >= SlashCommandRegistry.REFRESH_INTERVAL_MS) {
      await this.refresh();
    }
  }

  match(blocks: ContentBlock[]): SlashCommandMatch | undefined {
    if (!this.loaded) return undefined;

    for (let index = 0; index < blocks.length; index += 1) {
      const block = blocks[index];
      if (block.type !== "text") continue;

      const match = block.text.match(SLASH_COMMAND_REGEX);
      if (!match) continue;

      const name = match[1].toLowerCase();
      const definition = this.definitions.get(name);
      if (!definition) continue;

      const input = (match[2] ?? "").trim();
      const remainderRaw = match[3];
      const remainder = remainderRaw && remainderRaw.trim().length > 0 ? remainderRaw : undefined;

      return {
        definition,
        input,
        blockIndex: index,
        remainder,
      };
    }

    return undefined;
  }

  apply(blocks: ContentBlock[], match: SlashCommandMatch, context: CommandContext): ContentBlock[] {
    if (!this.loaded) return blocks;

    const transformed: ContentBlock[] = [];

    for (let index = 0; index < blocks.length; index += 1) {
      if (index === match.blockIndex) {
        if (match.remainder) {
          transformed.push({ type: "text", text: match.remainder });
        }
        continue;
      }
      transformed.push(blocks[index]);
    }

    const prompt = match.definition.buildPrompt(match.input, context);
    transformed.unshift({ type: "text", text: prompt });

    return transformed;
  }

  private createBuiltInDefinitions(): SlashCommandDefinition[] {
    const definitions: SlashCommandDefinition[] = [
      {
        name: "plan",
        description: "Create a step-by-step plan for the requested work.",
        hint: "Describe what you need a plan for",
        buildPrompt(input) {
          const focus = input.trim().length > 0 ? input.trim() : "the user's latest request";
          return [
            "You were invoked via the /plan command.",
            `Create a detailed implementation plan for ${focus}.`,
            "Break the work into actionable tasks and keep the todo_list tool updated as you progress.",
            "Note any assumptions that need confirmation before making changes.",
          ].join("\n\n");
        },
      },
    ];

    if (this.config.allowCommands) {
      definitions.push({
        name: "test",
        description: "Run the project's automated tests and report the results.",
        hint: "Optional: specify which tests to run",
        buildPrompt: (input, context) => {
          const scope = input.trim().length > 0 ? input.trim() : "the project";
          const workingDirLine = context.workingDirectory
            ? `The repository root available to you is ${context.workingDirectory}.`
            : undefined;
          return [
            "You were invoked via the /test command.",
            workingDirLine,
            `Identify and run the most relevant automated tests for ${scope}.`,
            "Use shell commands as needed, surface command output, and summarize any failures with next steps.",
          ]
            .filter((section): section is string => Boolean(section))
            .join("\n\n");
        },
      });
    }

    definitions.push({
      name: "web",
      description: "Research on the web and summarize findings with sources.",
      hint: "Topic to research",
      buildPrompt(input) {
        const topic = input.trim().length > 0 ? input.trim() : "the user's question";
        return [
          "You were invoked via the /web command.",
          `Use the web_search tool to research: ${topic}.`,
          "Collect key findings, include the most relevant sources, and cite them in your summary.",
        ].join("\n\n");
      },
    });

    return definitions;
  }

  private createPromptDefinitions(prompt: PromptCommandDefinition): SlashCommandDefinition[] {
    const primaryName = prompt.name;
    const aliasName = `${PROMPTS_CMD_PREFIX}:${prompt.name}`;

    const createDefinition = (name: string, hidden: boolean): SlashCommandDefinition => {
      const displayCommand = `/${name}`;
      return {
        name,
        description: prompt.description,
        hint: prompt.argumentHint,
        hidden,
        buildPrompt: (input) => expandCustomPrompt(prompt, input, displayCommand),
      };
    };

    return [createDefinition(primaryName, false), createDefinition(aliasName, true)];
  }
}

class PromptExpansionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptExpansionError";
  }
}

function expandCustomPrompt(
  prompt: PromptCommandDefinition,
  input: string,
  displayCommand: string,
): string {
  const trimmed = input.trim();

  if (prompt.argumentNames.length > 0) {
    const args = parseKeyValueArgs(trimmed, displayCommand);
    const missing = prompt.argumentNames.filter((name) => !args.has(name));
    if (missing.length > 0) {
      const list = missing.join(", ");
      throw new PromptExpansionError(
        `Missing required args for ${displayCommand}: ${list}. Provide as key=value (quote values with spaces).`,
      );
    }
    return replaceNamedPlaceholders(prompt.content, args);
  }

  const positionalArgs = trimmed.length > 0 ? shlexSplit(trimmed) : [];
  return expandNumericPlaceholders(prompt.content, positionalArgs);
}

function parseKeyValueArgs(input: string, displayCommand: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!input) {
    return map;
  }

  for (const token of shlexSplit(input)) {
    const separatorIndex = token.indexOf("=");
    if (separatorIndex === -1) {
      throw new PromptExpansionError(
        `Could not parse ${displayCommand}: expected key=value but found '${token}'. Wrap values in double quotes if they contain spaces.`,
      );
    }
    const key = token.slice(0, separatorIndex);
    if (key.length === 0) {
      throw new PromptExpansionError(
        `Could not parse ${displayCommand}: expected a name before '=' in '${token}'.`,
      );
    }
    const value = token.slice(separatorIndex + 1);
    map.set(key, value);
  }
  return map;
}

function replaceNamedPlaceholders(content: string, args: Map<string, string>): string {
  return content.replace(PROMPT_ARG_REGEX, (match, offset) => {
    const index = Number(offset);
    if (Number.isFinite(index) && index > 0 && content[index - 1] === '$') {
      return match;
    }
    const key = match.slice(1);
    if (key === "ARGUMENTS") {
      return match;
    }
    return args.get(key) ?? match;
  });
}

function shlexSplit(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (quote === '"' && char === '\\') {
        escaped = true;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += '\\';
  }

  if (quote) {
    current = `${quote}${current}`;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
