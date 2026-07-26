import { api, ApiError } from "../api/client.js";
import { formatSkillName, parseSkillName } from "../lib/names.js";
import { installSkills, type InstallOutcome } from "./skills.js";

/**
 * Kits: named bundles of skills installed with one command.
 *
 * A kit grants no access of its own — the server filters its contents by the
 * caller's entitlement, so installing a kit only ever pulls skills you could
 * already install one by one.
 */

export interface KitSkillRef {
  name: string;
  org: string;
  slug: string;
  displayName: string;
  description: string | null;
  visibility: "private" | "public";
  isIndexed: boolean;
}

export interface KitView {
  name: string;
  org: string;
  slug: string;
  displayName: string;
  description: string | null;
  visibility: "private" | "public";
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  skills: KitSkillRef[];
  /** Skills in the kit this account may not install — counted, never named. */
  hiddenCount: number;
}

export interface KitSummary {
  name: string;
  org: string;
  slug: string;
  displayName: string;
  description: string | null;
  visibility: "private" | "public";
  skillCount: number;
  updatedAt: string;
}

export async function listKits(): Promise<KitSummary[]> {
  const { kits } = await api<{ kits: KitSummary[] }>("/kits");
  return kits;
}

export async function getKit(input: string): Promise<KitView> {
  const name = parseSkillName(input);
  return api<KitView>(`/kits/${name.org}/${name.slug}`);
}

/** Returns the kit when the name resolves to one, or null when it doesn't exist. */
export async function findKit(input: string): Promise<KitView | null> {
  try {
    return await getKit(input);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export interface CreateKitInput {
  org?: string;
  slug: string;
  displayName?: string;
  description?: string;
  visibility?: "private" | "public";
  skills: string[];
}

export async function createKit(input: CreateKitInput): Promise<{ name: string; skills: string[] }> {
  const { kit } = await api<{ kit: { name: string; skills: string[] } }>("/kits", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return kit;
}

export async function updateKit(
  input: string,
  patch: {
    displayName?: string;
    description?: string | null;
    visibility?: "private" | "public";
    skills?: string[];
  },
): Promise<KitView> {
  const name = parseSkillName(input);
  return api<KitView>(`/kits/${name.org}/${name.slug}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteKit(input: string): Promise<string> {
  const name = parseSkillName(input);
  await api(`/kits/${name.org}/${name.slug}`, { method: "DELETE" });
  return formatSkillName(name);
}

export interface KitInstallResult {
  kit: KitView;
  outcomes: InstallOutcome[];
}

/** Installs every skill in a kit that this account is entitled to. */
export async function installKit(input: string): Promise<KitInstallResult> {
  const kit = await getKit(input);
  if (kit.skills.length === 0) {
    return { kit, outcomes: [] };
  }
  const outcomes = await installSkills(kit.skills.map((skill) => skill.name));
  return { kit, outcomes };
}
