import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectAgents } from "../agents/registry.js";
import { linkSkillToAgent, writeSkillToStore } from "../lib/store.js";
import { sha256Hex, type TarEntry } from "../lib/tar.js";

/**
 * `masterskills install` — one-time setup.
 *
 * Distributes the bundled "masterskills" skill (skill/SKILL.md in this
 * package) into every detected agent via the central store + links — the same
 * mechanism used for registry skills. The skill teaches agents to drive this
 * CLI, which replaces the parked MCP server as the agent interface.
 */

const META_SKILL = { org: "masterskills", slug: "cli" };

function bundledSkillDir(): string {
  // dist/cli.js → ../skill (the folder ships in the npm package "files").
  return join(fileURLToPath(import.meta.url), "..", "..", "skill");
}

function readBundledSkill(): TarEntry[] {
  const root = bundledSkillDir();
  const entries: TarEntry[] = [];
  const walk = (relative: string) => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const relPath = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(relPath);
      else if (entry.isFile()) {
        const content = readFileSync(join(root, relPath));
        entries.push({ path: relPath, size: content.length, sha256: sha256Hex(content), content });
      }
    }
  };
  walk("");
  if (!entries.some((entry) => entry.path === "SKILL.md")) {
    throw new Error("Bundled skill is missing SKILL.md — broken package?");
  }
  return entries;
}

export async function installCommand(): Promise<void> {
  console.log("Setting up MasterSkills…\n");

  const agents = detectAgents();
  if (agents.length === 0) {
    console.log("No supported agents detected (Claude Code, Codex, Cursor).");
    console.log("Install one of them first, then re-run: masterskills install");
    process.exitCode = 1;
    return;
  }

  const entries = readBundledSkill();
  writeSkillToStore(META_SKILL, entries);

  for (const agent of agents) {
    const outcome = linkSkillToAgent(META_SKILL, agent, { owned: true });
    if (outcome.mode === "skipped") {
      console.log(`- ${agent.displayName}: SKIPPED (${outcome.reason})`);
    } else {
      console.log(`✓ ${agent.displayName}: masterskills skill installed (${outcome.mode})`);
    }
  }

  console.log("\nYour agents now know how to use MasterSkills — restart them to load the skill.");
  console.log("\nNext step:\n  masterskills login");
}
