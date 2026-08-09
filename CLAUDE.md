# masterskills (CLI + MCP server)

Public repo (MIT) — npm package `masterskills`. The user-facing surface of the MasterSkills product.
Product decisions: `../cloud/docs/PRODUCT.md` · API contract: `../cloud/docs/API.md` (both in the private `cloud` repo, same workspace).

## What this is

One npm package shipping:
- **CLI** (`masterskills install|login|logout|whoami`) — the ONLY commands a human ever runs.
- **MCP server** (`masterskills mcp`, hidden command, stdio) — everything else happens through the agent via 6 tools: `whoami`, `search_skills`, `install_skills`, `check_updates`, `prepare_publish`, `publish`.

## Inviolable principles (never trade away for convenience)

1. **The agent never writes to disk without explicit user approval.**
2. **The agent never publishes without explicit user approval.** `prepare_publish` only returns a manifest; `publish` takes the approved draft id. Even org-"required" skills are confirmed by the user before install.
3. Exactly **6 MCP tools** — do not add tools without updating PRODUCT.md first.

## v1 scope guards

- **Agent coverage: registry-only.** `src/agents/registry.ts` ports the full skills.sh
  (vercel-labs/skills) agent table — 70+ coding agents as pure data (detect dirs +
  global skills dir). Supporting an agent means adding ONE entry there; never write
  per-agent bespoke adapters/integrations beyond the store-link mechanism.
  Universal-dir agents share `~/.agents/skills`; callers dedupe links by `skillsDir`.
- No teams/policies, no git import, no public-skill mirroring, no SSO (see PRODUCT.md §4 YOK list).
- Device auth: lifetime per-device token from the device flow; stored in `~/.masterskills/config.json` for v1 (OS keychain later).

## Conventions

- TypeScript strict, ESM, Node ≥20. Build: tsup (single entry `src/cli.ts`). `pnpm build` + `pnpm typecheck` must pass before every commit.
- Code and all user-facing CLI/MCP text: **English**. Comments may be Turkish or English.
- Verify MCP SDK usage against the **installed** `@modelcontextprotocol/sdk` version before changing `src/mcp/server.ts` — its API moves fast.
- zod is pinned to v3 for MCP SDK compatibility; do not bump to v4 without checking the SDK peer range.
- Conventional commits (`feat(cli): ...`, `fix(mcp): ...`). Never add Co-Authored-By trailers. Never push without being asked.
- This package gets published to npm — keep `files` in package.json tight and never include config/token paths in logs.
