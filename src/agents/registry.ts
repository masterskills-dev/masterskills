import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Agent registry — modeled after skills.sh (vercel-labs/skills src/agents.ts):
 * each agent = { id, displayName, globalSkillsDir, detectInstalled }.
 * Detection: the agent's config dir exists. Honors the same env overrides
 * skills.sh uses (CLAUDE_CONFIG_DIR, CODEX_HOME), plus MASTERSKILLS_*_DIR
 * overrides for the e2e harness.
 *
 * MVP set: Claude Code, Codex, Cursor. Gemini CLI and friends come later —
 * adding one is a single entry here as long as it reads a skills folder.
 */

export type AgentId = "claude-code" | "codex" | "cursor";

export interface AgentDefinition {
  id: AgentId;
  displayName: string;
  /** Base config dir — its existence means "agent is installed". */
  baseDir: string;
  /** User-level skills dir the agent reads. */
  skillsDir: string;
}

function claudeBase(): string {
  return (
    process.env.MASTERSKILLS_CLAUDE_DIR ??
    process.env.CLAUDE_CONFIG_DIR?.trim() ??
    join(homedir(), ".claude")
  );
}

function codexBase(): string {
  return (
    process.env.MASTERSKILLS_CODEX_DIR ??
    process.env.CODEX_HOME?.trim() ??
    join(homedir(), ".codex")
  );
}

function cursorBase(): string {
  return process.env.MASTERSKILLS_CURSOR_DIR ?? join(homedir(), ".cursor");
}

export function allAgents(): AgentDefinition[] {
  const claude = claudeBase();
  const codex = codexBase();
  const cursor = cursorBase();
  return [
    {
      id: "claude-code",
      displayName: "Claude Code",
      baseDir: claude,
      skillsDir: join(claude, "skills"),
    },
    {
      id: "codex",
      displayName: "Codex",
      baseDir: codex,
      skillsDir: join(codex, "skills"),
    },
    {
      id: "cursor",
      displayName: "Cursor",
      baseDir: cursor,
      skillsDir: join(cursor, "skills"),
    },
  ];
}

/** Agents present on this machine — install targets are auto-detected, never asked. */
export function detectAgents(): AgentDefinition[] {
  return allAgents().filter((agent) => existsSync(agent.baseDir));
}

export function resolveAgents(ids?: string[]): AgentDefinition[] {
  const detected = detectAgents();
  if (!ids || ids.length === 0) return detected;
  const wanted = new Set(ids);
  const unknown = ids.filter((id) => !allAgents().some((agent) => agent.id === id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown agent(s): ${unknown.join(", ")}. Supported: ${allAgents()
        .map((agent) => agent.id)
        .join(", ")}`,
    );
  }
  return detected.filter((agent) => wanted.has(agent.id));
}
