import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CliConfig {
  apiUrl?: string;
  /** Lifetime device token (per machine). */
  token?: string;
  deviceId?: string;
  userEmail?: string;
  orgSlug?: string;
}

/**
 * MASTERSKILLS_HOME redirects all CLI state (config, state, drafts) — used by
 * the e2e harness and useful for CI. Defaults to ~/.masterskills.
 */
export const CONFIG_DIR =
  process.env.MASTERSKILLS_HOME ?? join(homedir(), ".masterskills");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export const DEFAULT_API_URL =
  process.env.MASTERSKILLS_API_URL ?? "https://masterskills.dev";

export function loadConfig(): CliConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as CliConfig;
  } catch {
    return {};
  }
}

/** MASTERSKILLS_TOKEN (CI / service use) wins over the stored device token. */
export function resolveToken(): string | undefined {
  return process.env.MASTERSKILLS_TOKEN ?? loadConfig().token;
}

export function saveConfig(config: CliConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

export function clearConfig(): void {
  if (existsSync(CONFIG_PATH)) rmSync(CONFIG_PATH);
}
