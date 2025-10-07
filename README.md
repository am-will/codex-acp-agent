# Codex ACP Agent

This repository packages the Codex ↔ Agent Client Protocol adapter for Zed as a standalone Node.js project. It wraps the Codex SDK with the ACP transport so Zed can talk to Codex over stdio.

## Prerequisites

- Node.js 18 or later
- A Codex account with the `codex` CLI logged in (`codex login`) **or** a `CODEX_API_KEY` you can export
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

3. (Optional) Run unit tests:
   ```bash
   npm test
   ```

4. Verify Codex auth:
   ```bash
   npx codex login status
   # or export CODEX_API_KEY=<your token>
   ```

## Using with Zed

Add an entry to `~/.config/zed/settings.json` under `"agent_servers"`:

```json
{
  "agent_servers": {
    "codex": {
      "command": ["node", "/path/to/codex-acp-agent/dist/bin.js"],
      "env": {
        "CODEX_API_KEY": "<optional if not using codex login>",
        "CODEX_SKIP_GIT_CHECK": "true"
      }
    }
  }
}
```

Restart Zed and pick the Codex agent from the AI panel.

## CLI Usage

You can also run the adapter directly for testing:

```bash
node dist/bin.js --log-level debug
```

It reads ACP JSON over stdin/stdout, so you can pair it with the TypeScript example client from the main ACP repository or your own tooling.

## Publishing / Distribution

- To share as an npm package, keep `dist/` checked in and add a `prepare` script so `npm publish` builds automatically.
- To ship a binary-like CLI, run `npm run build` and distribute the resulting `dist/` directory with `package.json`.

## Project Scripts

- `npm run build` – compile TypeScript ➜ `dist/`
- `npm test` – run Vitest suite
- `npm run dev` – launch the agent in watch mode via `tsx`
- `npm run typecheck` – strict `tsc --noEmit`

---

If you make local customizations (e.g., extra slash commands), drop prompt files into `~/.codex/prompts` or point `--prompts-dir`/`CODEX_PROMPTS_DIR` at your own directory.
