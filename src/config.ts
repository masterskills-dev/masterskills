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

export const CONFIG_DIR = join(homedir(), ".masterskills");
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

export function saveConfig(config: CliConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

export function clearConfig(): void {
  if (existsSync(CONFIG_PATH)) rmSync(CONFIG_PATH);
}
