import { DEFAULT_API_URL, loadConfig, resolveToken } from "../config.js";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Parsed JSON error body when available (e.g. scanFindings on 422). */
    public readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get code(): string | undefined {
    return this.body?.error?.code;
  }
}

/** Minimal authenticated JSON client for the MasterSkills API (v1 contract: cloud/docs/API.md). */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = loadConfig();
  const baseUrl = config.apiUrl ?? DEFAULT_API_URL;
  const token = resolveToken();

  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const response = await fetch(`${baseUrl}/api/v1${path}`, { ...init, headers });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let body: ApiErrorBody | undefined;
    try {
      body = JSON.parse(text) as ApiErrorBody;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(
      response.status,
      body?.error?.message ?? (text || response.statusText),
      body,
    );
  }

  return (await response.json()) as T;
}
