import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "./config.js";
import type { PackageManifest } from "./lib/manifest.js";

/** Local install record — the CLI's source of truth for what's on this machine. */
export interface InstallRecord {
  version: number;
  contentHash: string;
  installedAt: string;
  /**
   * Agent id → link mode. "symlink" links live-update from the store; "copy"
   * fallback gets re-copied on every update. Records missing this field are
   * pre-store-era installs (written directly into ~/.claude/skills).
   */
  agents?: Record<string, "symlink" | "copy">;
}

/** A prepared-but-unpublished draft, awaiting explicit user approval. */
export interface DraftRecord {
  draftId: string;
  slug: string;
  /** Absolute path of the source folder at prepare time. */
  sourcePath: string;
  uploadUrl: string;
  nextVersion: number;
  manifest: PackageManifest;
  displayName?: string;
  description?: string;
  createdAt: string;
}

export interface CliState {
  installs: Record<string, InstallRecord>;
  drafts: Record<string, DraftRecord>;
}

const STATE_PATH = join(CONFIG_DIR, "state.json");

export function loadState(): CliState {
  if (!existsSync(STATE_PATH)) return { installs: {}, drafts: {} };
  try {
    const parsed = JSON.parse(readFileSync(STATE_PATH, "utf8")) as Partial<CliState>;
    return { installs: parsed.installs ?? {}, drafts: parsed.drafts ?? {} };
  } catch {
    // PS: a corrupt state file silently resets local state; the next `sync`
    // rebuilds server-side counts. Consider a .bak rotation later.
    return { installs: {}, drafts: {} };
  }
}

export function saveState(state: CliState): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}
