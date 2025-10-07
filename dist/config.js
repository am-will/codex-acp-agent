import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { exit } from "node:process";
const HELP_TEXT = `Usage: codex-acp-agent [options]\n\nOptions:\n  --model <id>             Default Codex model (overrides CODEX_MODEL)\n  --base-url <url>         Override Codex API base URL (CODEX_BASE_URL)\n  --api-key <key>          Explicit Codex API key (CODEX_API_KEY)\n  --sandbox <mode>         Sandbox mode: read-only|workspace-write|danger-full-access\n  --skip-git-check         Skip Codex Git repository guard (CODEX_SKIP_GIT_CHECK=true)\n  --no-skip-git-check      Enforce Git repository guard\n  --allow-commands         Stream command execution events (default)\n  --no-allow-commands      Suppress command execution updates\n  --send-reasoning         Stream reasoning updates (default)\n  --no-send-reasoning      Suppress reasoning updates\n  --log-level <level>      silent|error|warn|info|debug (default info)\n  --codex-bin <path>       Use a custom codex executable\n  --prompts-dir <path>     Directory containing Codex slash command prompts\n  --help                   Show this message\n`;
export function parseConfig(argv, env) {
    const defaultPromptsDir = join(homedir(), ".codex", "prompts");
    const raw = {
        model: env.CODEX_MODEL,
        baseUrl: env.CODEX_BASE_URL,
        apiKey: env.CODEX_API_KEY,
        sandboxMode: parseSandbox(env.CODEX_SANDBOX),
        skipGitRepoCheck: parseBoolean(env.CODEX_SKIP_GIT_CHECK),
        allowCommands: parseBoolean(env.CODEX_ALLOW_COMMANDS),
        sendReasoning: parseBoolean(env.CODEX_SEND_REASONING),
        logLevel: parseLogLevel(env.CODEX_LOG_LEVEL),
        codexPath: env.CODEX_PATH_OVERRIDE ?? env.CODEX_BIN,
        promptsDir: normalizePath(env.CODEX_PROMPTS_DIR ?? defaultPromptsDir),
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        switch (arg) {
            case "--model":
                raw.model = expectValue(arg, argv[++i]);
                break;
            case "--base-url":
                raw.baseUrl = expectValue(arg, argv[++i]);
                break;
            case "--api-key":
                raw.apiKey = expectValue(arg, argv[++i]);
                break;
            case "--sandbox":
                raw.sandboxMode = parseSandbox(expectValue(arg, argv[++i]));
                break;
            case "--skip-git-check":
                raw.skipGitRepoCheck = true;
                break;
            case "--no-skip-git-check":
                raw.skipGitRepoCheck = false;
                break;
            case "--allow-commands":
                raw.allowCommands = true;
                break;
            case "--no-allow-commands":
                raw.allowCommands = false;
                break;
            case "--send-reasoning":
                raw.sendReasoning = true;
                break;
            case "--no-send-reasoning":
                raw.sendReasoning = false;
                break;
            case "--log-level":
                raw.logLevel = parseLogLevel(expectValue(arg, argv[++i]));
                break;
            case "--codex-bin":
                raw.codexPath = expectValue(arg, argv[++i]);
                break;
            case "--prompts-dir":
                raw.promptsDir = normalizePath(expectValue(arg, argv[++i]));
                break;
            case "--help":
                process.stdout.write(`${HELP_TEXT}\n`);
                exit(0);
            default:
                throw new Error(`Unknown flag ${arg}`);
        }
    }
    return {
        model: raw.model,
        sandboxMode: raw.sandboxMode,
        skipGitRepoCheck: raw.skipGitRepoCheck ?? false,
        allowCommands: raw.allowCommands ?? true,
        sendReasoning: raw.sendReasoning ?? true,
        logLevel: raw.logLevel ?? "info",
        promptsDirectory: raw.promptsDir ?? undefined,
        codex: {
            baseUrl: raw.baseUrl,
            apiKey: raw.apiKey,
            pathOverride: raw.codexPath,
        },
    };
}
function expectValue(flag, value) {
    if (!value) {
        throw new Error(`Flag ${flag} expects a value`);
    }
    return value;
}
function parseSandbox(value) {
    if (!value)
        return undefined;
    const normalized = value.trim();
    if (normalized === "read-only" || normalized === "workspace-write" || normalized === "danger-full-access") {
        return normalized;
    }
    throw new Error(`Invalid sandbox mode: ${value}`);
}
function parseBoolean(value) {
    if (value === undefined)
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes")
        return true;
    if (normalized === "false" || normalized === "0" || normalized === "no")
        return false;
    throw new Error(`Invalid boolean value: ${value}`);
}
function parseLogLevel(value) {
    if (!value)
        return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "silent" || normalized === "error" || normalized === "warn" || normalized === "info" || normalized === "debug") {
        return normalized;
    }
    throw new Error(`Invalid log level: ${value}`);
}
function normalizePath(value) {
    if (value === undefined || value === null)
        return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0)
        return undefined;
    const expanded = trimmed.startsWith("~/") ? `${homedir()}/${trimmed.slice(2)}` : trimmed;
    return resolve(expanded);
}
//# sourceMappingURL=config.js.map