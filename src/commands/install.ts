import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectAgents } from "../agents/registry.js";
import { linkSkillToAgent, writeSkillToStore } from "../lib/store.js";
import { sha256Hex, type TarEntry } from "../lib/tar.js";

/**
 * `masterskills install` — one-time setup.
 *
 * Distributes every bundled skill (skills/<slug>/ in this package, e.g.
 * skills/cli) into every detected agent via the central store + links — the
 * same mechanism used for registry skills. skills/cli teaches agents to drive
 * this CLI, which replaces the parked MCP server as the agent interface.
 * Future bundled skills (e.g. skills/docs) install automatically too.
 */

const BUNDLED_ORG = "masterskills";

function bundledSkillsRoot(): string {
  // dist/cli.js → ../skills (the folder ships in the npm package "files").
  return join(fileURLToPath(import.meta.url), "..", "..", "skills");
}

function readBundledSkills(): { slug: string; entries: TarEntry[] }[] {
  const root = bundledSkillsRoot();
  const bundled: { slug: string; entries: TarEntry[] }[] = [];

  for (const dirent of readdirSync(root, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const slug = dirent.name;
    const entries: TarEntry[] = [];
    const walk = (relative: string) => {
      for (const entry of readdirSync(join(root, slug, relative), { withFileTypes: true })) {
        const relPath = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(relPath);
        else if (entry.isFile()) {
          const content = readFileSync(join(root, slug, relPath));
          entries.push({ path: relPath, size: content.length, sha256: sha256Hex(content), content });
        }
      }
    };
    walk("");
    if (entries.some((entry) => entry.path === "SKILL.md")) {
      bundled.push({ slug, entries });
    }
  }

  if (bundled.length === 0) {
    throw new Error("No bundled skills found — broken package?");
  }
  return bundled;
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

  for (const bundledSkill of readBundledSkills()) {
    const name = { org: BUNDLED_ORG, slug: bundledSkill.slug };
    writeSkillToStore(name, bundledSkill.entries);
    for (const agent of agents) {
      const outcome = linkSkillToAgent(name, agent, { owned: true });
      if (outcome.mode === "skipped") {
        console.log(`- ${agent.displayName}: @${name.org}/${name.slug} SKIPPED (${outcome.reason})`);
      } else {
        console.log(`✓ ${agent.displayName}: @${name.org}/${name.slug} installed (${outcome.mode})`);
      }
    }
  }

  console.log("\nYour agents now know how to use MasterSkills — restart them to load the skill.");
  console.log("\nNext step:\n  masterskills login");
}
