import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { api, ApiError } from "../api/client.js";
import { loadConfig, saveConfig } from "../config.js";
import { openInBrowser } from "../utils/open.js";

interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

interface DeviceTokenResponse {
  token: string;
  device: { id: string; name: string } | null;
  user: { email: string } | null;
  org: { slug: string } | null;
}

export interface LoginOptions {
  apiUrl?: string;
  open?: boolean;
}

/**
 * Device authorization flow (cloud/docs/API.md):
 * request a code, send the user to the browser once, poll until approved,
 * then persist the lifetime device token for this machine.
 */
export async function loginCommand(options: LoginOptions = {}): Promise<void> {
  if (options.apiUrl) {
    saveConfig({ ...loadConfig(), apiUrl: options.apiUrl });
  }

  const code = await api<DeviceCodeResponse>("/device/code", {
    method: "POST",
    body: JSON.stringify({ client: "cli", hostname: hostname() }),
  });

  console.log("\n  Confirm this code in your browser:\n");
  console.log(`      ${code.userCode}\n`);
  console.log(`  ${code.verificationUri}\n`);
  if (options.open !== false) openInBrowser(code.verificationUri);
  console.log("  Waiting for approval…");

  const deadline = Date.now() + code.expiresIn * 1000;

  while (Date.now() < deadline) {
    await sleep(code.interval * 1000);
    try {
      const result = await api<DeviceTokenResponse>("/device/token", {
        method: "POST",
        body: JSON.stringify({ deviceCode: code.deviceCode }),
      });
      saveConfig({
        ...loadConfig(),
        token: result.token,
        deviceId: result.device?.id,
        userEmail: result.user?.email,
        orgSlug: result.org?.slug,
      });
      // Cache the default publish namespace. Org-only accounts have no
      // username (personal namespaces retired) — the login org covers them.
      try {
        const me = await api<{ user: { username: string | null } }>("/me");
        if (me.user.username) {
          saveConfig({ ...loadConfig(), username: me.user.username });
        }
      } catch {
        // Non-fatal: defaultOrg() resolves it lazily later.
      }
      console.log(`\n✓ Logged in as ${result.user?.email ?? "unknown"}`);
      if (result.org) console.log(`✓ Organization: @${result.org.slug}`);
      console.log("✓ This device is authorized — you won't need to log in again here.");
      return;
    } catch (error) {
      if (error instanceof ApiError && error.status === 428) continue;
      if (error instanceof ApiError && error.status === 410) {
        console.error("\nLogin expired or was denied. Run `masterskills login` to try again.");
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  }

  console.error("\nLogin timed out. Run `masterskills login` to try again.");
  process.exitCode = 1;
}
