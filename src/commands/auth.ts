import { clearConfig, loadConfig } from "../config.js";

/**
 * `masterskills login` — device authorization flow.
 *
 * Planned flow (v1 contract: cloud/docs/API.md):
 *  1. POST /device/code → { device_code, user_code, verification_uri, interval }
 *  2. Open browser at verification_uri; user approves this device once.
 *  3. Poll POST /device/token until approved → lifetime device token (per machine).
 *  4. Save token via saveConfig(); OS keychain support comes later.
 */
export async function loginCommand(): Promise<void> {
  // TODO(v1): implement device flow against the cloud API.
  console.log("masterskills login — not implemented yet.");
  process.exitCode = 1;
}

export async function logoutCommand(): Promise<void> {
  // TODO(v1): also revoke the device token server-side, not just locally.
  clearConfig();
  console.log("Signed out. This device's credentials were removed.");
}

export async function whoamiCommand(): Promise<void> {
  const config = loadConfig();
  if (!config.token) {
    console.log("Not signed in. Run: masterskills login");
    process.exitCode = 1;
    return;
  }
  // TODO(v1): call GET /me and print user, org, plan, device.
  console.log(`Signed in${config.userEmail ? ` as ${config.userEmail}` : ""}.`);
  if (config.orgSlug) console.log(`Organization: ${config.orgSlug}`);
}
