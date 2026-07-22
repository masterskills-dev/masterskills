import { DEFAULT_API_URL, loadConfig } from "../config.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Minimal authenticated JSON client for the MasterSkills API (v1 contract: cloud/docs/API.md). */
export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const config = loadConfig();
  const baseUrl = config.apiUrl ?? DEFAULT_API_URL;

  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (config.token) headers.set("authorization", `Bearer ${config.token}`);

  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(response.status, body || response.statusText);
  }

  return (await response.json()) as T;
}
