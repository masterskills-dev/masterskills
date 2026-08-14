import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR } from "../config.js";

/**
 * Once-a-day CLI update notice. The registry is asked for the latest version
 * at most every 24h (1.5s budget, silent on any failure); the result is cached
 * in ~/.masterskills so every other invocation costs nothing. Notices go to
 * stderr so `--json` output on stdout stays parseable.
 */

export const PACKAGE_NAME = "@masterskills/cli";
const REGISTRY_LATEST_URL = "https://registry.npmjs.org/@masterskills%2fcli/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;
const CACHE_PATH = join(CONFIG_DIR, "update-check.json");

interface UpdateCache {
  checkedAt: number;
  latest: string;
}

function readCache(): UpdateCache | null {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as UpdateCache;
    if (typeof parsed.checkedAt !== "number" || typeof parsed.latest !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCache): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cache) + "\n", "utf8");
  } catch {
    // Cache is an optimization — never fail a command over it.
  }
}

/** Plain numeric x.y.z comparison — released versions carry no prerelease tags. */
function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map(Number);
  const b = current.split(".").map(Number);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return false;
}

export async function maybeNotifyCliUpdate(currentVersion: string): Promise<void> {
  let cache = readCache();

  if (!cache || Date.now() - cache.checkedAt > CHECK_INTERVAL_MS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const response = await fetch(REGISTRY_LATEST_URL, { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) {
        const data = (await response.json()) as { version?: unknown };
        if (typeof data.version === "string") {
          cache = { checkedAt: Date.now(), latest: data.version };
          writeCache(cache);
        }
      }
    } catch {
      // Offline or registry down — stay quiet, try again next interval.
    }
  }

  if (cache && isNewer(cache.latest, currentVersion)) {
    console.error(
      `\nUpdate available: ${PACKAGE_NAME} ${currentVersion} → ${cache.latest}` +
        `\n  npm install -g ${PACKAGE_NAME}\n`,
    );
  }
}
