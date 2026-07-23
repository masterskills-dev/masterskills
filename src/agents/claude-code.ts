import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { isSafeRelativePath, type TarEntry } from "../lib/tar.js";

/**
 * Claude Code adapter — v1's only agent target.
 * Personal skills live in ~/.claude/skills/<slug>/.
 *
 * MASTERSKILLS_CLAUDE_DIR overrides the base dir (e2e harness / CI).
 * TODO: PS: when Codex/Cursor/Gemini adapters land, extract a common
 * AgentAdapter interface and let installs fan out to every detected agent.
 */
const CLAUDE_DIR = process.env.MASTERSKILLS_CLAUDE_DIR ?? join(homedir(), ".claude");

export function skillsDir(): string {
  return join(CLAUDE_DIR, "skills");
}

export function skillDir(slug: string): string {
  return join(skillsDir(), slug);
}

/** Clean install: wipe + write. Callers MUST have user approval before this runs. */
export function installSkillFiles(slug: string, entries: TarEntry[]): string {
  const target = skillDir(slug);
  for (const entry of entries) {
    if (!isSafeRelativePath(entry.path)) {
      throw new Error(`Unsafe path in package: ${entry.path}`);
    }
  }
  rmSync(target, { recursive: true, force: true });
  for (const entry of entries) {
    const filePath = join(target, entry.path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, entry.content);
  }
  return target;
}

export function removeSkillFiles(slug: string): boolean {
  const target = skillDir(slug);
  if (!existsSync(target)) return false;
  rmSync(target, { recursive: true, force: true });
  return true;
}
