# Codex ACP Agent

This repository packages the Codex ↔ Agent Client Protocol adapter for Zed as a standalone Node.js project. It is the not official Codex adapter and is not affiliated with, endorsed by, or sponsored by OpenAI or Zed Industries. The package wraps the Codex SDK with the ACP transport so Zed can talk to Codex over stdio.

## Prerequisites

- Node.js 18 or later
- A Codex account authenticated either by running `codex login` **or** exporting `CODEX_API_KEY`
- Zed 0.153.0 or later (any build that supports external ACP agents)

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
   This recreates the `node_modules/` directory that is intentionally not checked in.

2. Build the TypeScript sources (generates `dist/`):
   ```bash
   npm run build
   ```
   Every install or publish will also run this automatically via the `prepare` script.

3. Choose your Codex authentication path:
   ```bash
   # Interactive device-login flow
   npx codex login

   # —or— provide an API key explicitly
   export CODEX_API_KEY=<your token>
   ```
   The adapter works with either method—pick whichever fits your environment.

## Using with Zed

Add an entry to `~/.config/zed/settings.json` under `"agent_servers"`:

```json
{
  "agent_servers": {
    "codex": {
      "command": ["node", "/path/to/codex-acp-agent/dist/bin.js"],
      "env": {
        "CODEX_API_KEY": "<optional if using codex login>",
        "CODEX_SKIP_GIT_CHECK": "true"
      }
    }
  }
}
```

Restart Zed and pick the Codex agent from the AI panel.

## Slash Commands & Custom Prompts

- Built-in slash commands include `/plan`, `/test`, and `/web`.
- Drop additional prompt files (Markdown, `.prompt`, or plain text) into `~/.codex/prompts` to create your own commands.
- Each file becomes a slash command named after the first `#/command-name` heading (or the filename if no heading exists). Arguments like `$1` or `$ARGUMENTS` are expanded automatically.
- Point the agent at alternate prompt folders with `CODEX_PROMPTS_DIR`, `--prompts-dir`, or the Zed `env` block.

## CLI Usage

You can also run the adapter directly for testing:

```bash
node dist/bin.js --log-level debug
```

It reads ACP JSON over stdin/stdout, so you can pair it with the TypeScript example client from the main ACP repository or your own tooling.

## Publishing / Distribution

- `npm run prepare` (triggered automatically) builds the project before `npm publish` or when the package is installed from git.
- To ship a binary-like CLI, run `npm run build` and distribute the resulting `dist/` directory with `package.json`.

## Project Scripts

- `npm run build` – compile TypeScript ➜ `dist/`
- `npm test` – run Vitest suite
- `npm run dev` – launch the agent in watch mode via `tsx`
- `npm run typecheck` – strict `tsc --noEmit`

---

If you make local customizations (extra slash commands, logging tweaks, etc.), keep them under version control—only `node_modules/` is intentionally ignored.
