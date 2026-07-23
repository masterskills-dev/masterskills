import { api, ApiError } from "../api/client.js";
import { clearConfig, loadConfig } from "../config.js";

interface MeResponse {
  user: { id: string; name: string; email: string } | null;
  org: { id: string; slug: string; name: string; plan: string } | null;
  device: { id: string; name: string; lastSeenAt: string | null };
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

  try {
    const me = await api<MeResponse>("/me");
    if (me.user) console.log(`User:         ${me.user.name} <${me.user.email}>`);
    if (me.org) console.log(`Organization: ${me.org.name} (${me.org.slug}) — ${me.org.plan} plan`);
    console.log(`Device:       ${me.device.name}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      console.error("This device's access is invalid or was revoked. Run: masterskills login");
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
