import { ApiError } from "../api/client.js";
import { clearConfig, loadConfig } from "../config.js";
import { fetchMe } from "../core/skills.js";

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
    const me = await fetchMe();
    console.log(`User:    ${me.user.name} <${me.user.email}>`);
    if (me.orgs.length > 0) {
      const home = me.homeOrg?.slug;
      for (const org of me.orgs) {
        const marker = org.slug === home ? "  (this device)" : "";
        console.log(`Org:     @${org.slug} — ${org.plan} plan, ${org.role}${marker}`);
      }
    } else {
      console.log("Org:     none yet — create one at masterskills.dev");
    }
    console.log(`Device:  ${me.device.name}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      console.error("This device's access is invalid or was revoked. Run: masterskills login");
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
