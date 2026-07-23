import { spawn } from "node:child_process";

/** Best-effort cross-platform browser opener. Failure is fine — the URL is always printed. */
export function openInBrowser(url: string): void {
  try {
    const options = { detached: true, stdio: "ignore" as const };
    let child;
    if (process.platform === "win32") {
      child = spawn("cmd", ["/c", "start", "", url], options);
    } else if (process.platform === "darwin") {
      child = spawn("open", [url], options);
    } else {
      child = spawn("xdg-open", [url], options);
    }
    child.on("error", () => {});
    child.unref();
  } catch {
    // best effort only
  }
}
