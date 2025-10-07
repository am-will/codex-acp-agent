import { promises as fs, Dirent } from "node:fs";
import { basename, extname, join } from "node:path";
const COMMAND_HEADING_REGEX = /^#\s*\/([A-Za-z0-9_\-:]+)\b.*$/;
const COMMENT_START_REGEX = /^<!--/;
const COMMENT_END_REGEX = /-->$/;
const FRONTMATTER_DELIMITER = /^\s*---\s*$/;
const PROMPT_ARG_REGEX = /\$[A-Z][A-Z0-9_]*/g;
export async function loadPromptCommandDefinitions(directory, logger) {
    if (!directory)
        return [];
    let entries;
    try {
        entries = await fs.readdir(directory, { withFileTypes: true });
    }
    catch (error) {
        const err = error;
        if (err.code !== "ENOENT") {
            logger?.warn("failed to read prompts directory", { directory, message: err.message });
        }
        else {
            logger?.debug("prompts directory missing", { directory });
        }
        return [];
    }
    const definitions = [];
    for (const entry of entries) {
        if (!entry.isFile())
            continue;
        if (!isSupportedPromptFile(entry.name))
            continue;
        const filePath = join(directory, entry.name);
        try {
            const fileContent = await fs.readFile(filePath, "utf8");
            const definition = parsePromptFile(entry.name, fileContent);
            if (!definition) {
                logger?.warn("skipping unparseable prompt", { filePath });
                continue;
            }
            definitions.push(definition);
        }
        catch (error) {
            logger?.warn("failed to read prompt file", {
                filePath,
                message: error.message,
            });
        }
    }
    definitions.sort((a, b) => a.name.localeCompare(b.name));
    return definitions;
}
export function promptArgumentNames(content) {
    const names = [];
    const seen = new Set();
    for (const match of content.matchAll(PROMPT_ARG_REGEX)) {
        const index = match.index ?? 0;
        if (index > 0 && content.charCodeAt(index - 1) === 36 /* '$' */) {
            continue; // Escaped (`$$NAME`).
        }
        const name = match[0].slice(1);
        if (name === "ARGUMENTS")
            continue;
        if (!seen.has(name)) {
            seen.add(name);
            names.push(name);
        }
    }
    return names;
}
export function expandNumericPlaceholders(content, args) {
    let result = "";
    let i = 0;
    let cachedArgs;
    while (true) {
        const next = content.indexOf('$', i);
        if (next === -1) {
            result += content.slice(i);
            break;
        }
        result += content.slice(i, next);
        const nextTwo = content.slice(next, next + 2);
        if (nextTwo === "$$") {
            result += "$$";
            i = next + 2;
            continue;
        }
        const digit = content.charCodeAt(next + 1);
        if (digit >= 49 && digit <= 57) {
            const arg = args[digit - 49];
            if (arg !== undefined) {
                result += arg;
            }
            i = next + 2;
            continue;
        }
        if (content.startsWith("$ARGUMENTS", next)) {
            if (args.length > 0) {
                if (!cachedArgs)
                    cachedArgs = args.join(" ");
                result += cachedArgs;
            }
            i = next + "$ARGUMENTS".length;
            continue;
        }
        result += '$';
        i = next + 1;
    }
    return result;
}
function isSupportedPromptFile(fileName) {
    const extension = extname(fileName).toLowerCase();
    return extension === ".md" || extension === ".txt" || extension === ".prompt";
}
function parsePromptFile(fileName, rawContent) {
    const { description, argumentHint, body } = parseFrontmatter(rawContent);
    const commandName = parseCommandName(fileName, body);
    return {
        name: commandName,
        description: description ?? "Run the associated Codex prompt.",
        argumentHint,
        content: body,
        argumentNames: promptArgumentNames(body),
    };
}
function parseCommandName(fileName, body) {
    const lines = body.split(/\r?\n/);
    for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (trimmed.length === 0)
            continue;
        const headingMatch = COMMAND_HEADING_REGEX.exec(trimmed);
        if (headingMatch) {
            return normalizeCommandName(headingMatch[1]);
        }
        break;
    }
    return basename(fileName, extname(fileName));
}
function normalizeCommandName(name) {
    const trimmed = name.trim();
    if (trimmed.startsWith("prompts:")) {
        return trimmed.slice("prompts:".length);
    }
    return trimmed;
}
function parseFrontmatter(content) {
    const lines = content.split(/\r?\n/);
    if (lines.length === 0 || !FRONTMATTER_DELIMITER.test(lines[0] ?? "")) {
        return { body: content };
    }
    let description;
    let argumentHint;
    let endIndex = -1;
    for (let idx = 1; idx < lines.length; idx += 1) {
        const line = lines[idx];
        if (FRONTMATTER_DELIMITER.test(line)) {
            endIndex = idx + 1;
            break;
        }
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith('#')) {
            continue;
        }
        const separator = trimmed.indexOf(':');
        if (separator === -1)
            continue;
        const key = trimmed.slice(0, separator).trim().toLowerCase();
        let value = trimmed.slice(separator + 1).trim();
        if (value.length >= 2) {
            const first = value[0];
            const last = value[value.length - 1];
            if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
                value = value.slice(1, -1);
            }
        }
        if (key === "description") {
            description = value;
        }
        else if (key === "argument-hint" || key === "argument_hint") {
            argumentHint = value;
        }
    }
    if (endIndex === -1) {
        return { body: content };
    }
    const body = lines.slice(endIndex).join("\n");
    return { description, argumentHint, body };
}
//# sourceMappingURL=prompt-library.js.map