/**
 * `masterskills install` — one-time setup.
 *
 * Registers the MasterSkills MCP server with the user's coding agents.
 * v1 target: Claude Code only (others are "coming soon").
 *
 * Planned steps:
 *  1. Detect installed agents (v1: Claude Code).
 *  2. Register MCP server: `masterskills mcp` (stdio) in the agent's user-scope MCP config.
 *  3. Print what was changed and how to undo it.
 *
 * Rule: every file/config write is shown to the user before it happens.
 */
export async function installCommand(): Promise<void> {
  // TODO(v1): implement Claude Code MCP registration.
  console.log("masterskills install — not implemented yet.");
  console.log("Planned: register the MasterSkills MCP server with Claude Code (user scope).");
  process.exitCode = 1;
}
