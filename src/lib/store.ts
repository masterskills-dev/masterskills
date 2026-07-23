import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { AgentDefinition } from "../agents/registry.js";
import { CONFIG_DIR } from "../config.js";
import { linkFolderName, type SkillName } from "./names.js";
import { isSafeRelativePath, type TarEntry } from "./tar.js";

/**
 * Central skill store: ~/.masterskills/skills/<org>/<slug> is the ONLY real
 * copy. Agent dirs get links into the store, so one download serves every
 * agent and updates land everywhere at once (links are path-based — rewriting
 * the store folder's contents updates all agents implicitly).
 *
 * Link strategy per platform:
 *  - Windows: directory JUNCTION (no admin rights / Developer Mode needed,
 *    unlike real symlinks). Node maps type "junction" to this.
 *  - macOS/Linux: plain directory symlink.
 *  - Fallback: if link creation fails (exotic filesystems, policies), COPY the
 *    folder and remember mode "copy" so updates re-copy.
 */

export type LinkMode = "symlink" | "copy";

export function storeRoot(): string {
  return join(CONFIG_DIR, "skills");
}

export function storeSkillDir(name: SkillName): string {
  return join(storeRoot(), name.org, name.slug);
}

export function writeSkillToStore(name: SkillName, entries: TarEntry[]): string {
  const target = storeSkillDir(name);
  for (const entry of entries) {
    if (!isSafeRelativePath(entry.path)) {
      throw new Error(`Unsafe path in package: ${entry.path}`);
    }
  }
  // Recreate at the same path — existing links stay valid (path-based).
  rmSync(target, { recursive: true, force: true });
  for (const entry of entries) {
    const filePath = join(target, entry.path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, entry.content);
  }
  return target;
}

export function removeSkillFromStore(name: SkillName): void {
  rmSync(storeSkillDir(name), { recursive: true, force: true });
  // Tidy up the org folder if it's now empty.
  try {
    const orgDir = join(storeRoot(), name.org);
    if (readdirSync(orgDir).length === 0) rmdirSync(orgDir);
  } catch {
    // org dir missing — fine
  }
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Removes a link WITHOUT ever following it (a recursive rm through a junction would eat the store). */
function removeLink(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Directory junctions/symlinks on some platforms need rmdir instead.
    rmdirSync(path);
  }
}

export function agentLinkPath(name: SkillName, agent: AgentDefinition): string {
  return join(agent.skillsDir, linkFolderName(name));
}

export interface LinkOutcome {
  agent: AgentDefinition;
  mode: LinkMode | "skipped";
  reason?: string;
}

/**
 * Links the store copy into one agent's skills dir.
 * `owned` = this skill is managed by MasterSkills (from state) — only then may
 * we replace a pre-existing REAL directory; a hand-made folder with the same
 * name is never destroyed.
 */
export function linkSkillToAgent(
  name: SkillName,
  agent: AgentDefinition,
  options: { owned: boolean },
): LinkOutcome {
  const target = storeSkillDir(name);
  const linkPath = agentLinkPath(name, agent);
  mkdirSync(agent.skillsDir, { recursive: true });

  if (existsSync(linkPath) || isLink(linkPath)) {
    if (isLink(linkPath)) {
      removeLink(linkPath);
    } else if (options.owned) {
      // Our own pre-symlink-era install (or copy fallback) — safe to replace.
      rmSync(linkPath, { recursive: true, force: true });
    } else {
      return {
        agent,
        mode: "skipped",
        reason: `${linkPath} exists and is not managed by MasterSkills`,
      };
    }
  }

  try {
    symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return { agent, mode: "symlink" };
  } catch {
    // PS: copy fallback loses the "update once, applies everywhere" property —
    // updates re-copy for these agents (core re-links after every store write).
    cpSync(target, linkPath, { recursive: true });
    return { agent, mode: "copy" };
  }
}

export function unlinkSkillFromAgent(name: SkillName, agent: AgentDefinition): boolean {
  const linkPath = agentLinkPath(name, agent);
  if (isLink(linkPath)) {
    removeLink(linkPath);
    return true;
  }
  if (existsSync(linkPath)) {
    // Copy-mode install — a real directory we own.
    rmSync(linkPath, { recursive: true, force: true });
    return true;
  }
  return false;
}
