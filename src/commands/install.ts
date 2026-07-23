import { spawnSync } from "node:child_process";

const MCP_SERVER_NAME = "masterskills";
const MANUAL_COMMAND =
  "claude mcp add --scope user masterskills -- npx -y masterskills mcp";

function runClaude(args: string[]): { ok: boolean; output: string } {
  const result = spawnSync("claude", args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return { ok: result.status === 0, output };
}

/**
 * One-time setup: registers the MasterSkills MCP server with the user's coding
 * agents. v1 supports Claude Code; Codex, Cursor and Gemini CLI are next.
 */
export async function installCommand(): Promise<void> {
  console.log("Setting up MasterSkills…\n");

  const detect = runClaude(["--version"]);
  if (!detect.ok) {
    console.log("Claude Code CLI not found on this machine.");
    console.log("If Claude Code is installed elsewhere, register manually:\n");
    console.log(`  ${MANUAL_COMMAND}\n`);
    console.log("Other agents (Codex, Cursor, Gemini CLI): coming soon.");
    process.exitCode = 1;
    return;
  }

  console.log(`✓ Claude Code detected (${detect.output.split("\n")[0]})`);
  console.log(`→ Registering MCP server "${MCP_SERVER_NAME}" (user scope)…`);

  const add = runClaude([
    "mcp",
    "add",
    "--scope",
    "user",
    MCP_SERVER_NAME,
    "--",
    "npx",
    "-y",
    "masterskills",
    "mcp",
  ]);

  if (add.ok) {
    console.log("✓ MCP server registered for Claude Code (all projects).");
  } else if (/already exists/i.test(add.output)) {
    console.log("✓ MCP server was already registered — nothing to do.");
  } else {
    console.error(`✗ Registration failed:\n${add.output}\n`);
    console.error(`Register manually with:\n  ${MANUAL_COMMAND}`);
    process.exitCode = 1;
    return;
  }

  console.log("\nOther agents (Codex, Cursor, Gemini CLI): coming soon.");
  console.log("\nNext step:\n  masterskills login");
}
