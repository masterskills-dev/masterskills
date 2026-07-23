import { resolve } from "node:path";
import { api } from "../api/client.js";
import { installSkillFiles, removeSkillFiles, skillDir } from "../agents/claude-code.js";
import { buildPackage, readFrontmatter, type PackageManifest } from "../lib/manifest.js";
import { packTarGz, parseTarGz, sha256Hex } from "../lib/tar.js";
import { loadState, saveState, type DraftRecord } from "../state.js";

/**
 * Core skill operations — shared by CLI commands and MCP tools.
 * The two inviolable principles live at the CALLER level: nothing here asks
 * questions, so every caller (command or agent) must obtain explicit user
 * approval BEFORE invoking install/publish/remove operations.
 */

// ---------------------------------------------------------------- API types

export interface CatalogSkill {
  slug: string;
  displayName: string;
  description: string | null;
  isRequired: boolean;
  latestVersion: { number: number; contentHash: string; sizeBytes: number; fileCount: number } | null;
  installCount: number;
  archivedAt: string | null;
}

export interface SkillDetail {
  slug: string;
  displayName: string;
  description: string | null;
  isRequired: boolean;
  archivedAt: string | null;
  versions: { number: number; contentHash: string; sizeBytes: number; fileCount: number; createdAt: string; yankedAt: string | null }[];
}

export interface SyncResult {
  updates: { slug: string; from: number; to: number }[];
  newRequired: { slug: string; version: number }[];
  removed: { slug: string }[];
}

// ---------------------------------------------------------------- list / search

export interface ListedSkill extends CatalogSkill {
  installedVersion: number | null;
  updateAvailable: boolean;
}

export async function listSkills(query?: string): Promise<ListedSkill[]> {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  const { skills } = await api<{ skills: CatalogSkill[] }>(`/skills${params}`);
  const { installs } = loadState();
  return skills.map((skill) => {
    const installed = installs[skill.slug];
    return {
      ...skill,
      installedVersion: installed?.version ?? null,
      updateAvailable:
        !!installed && !!skill.latestVersion && skill.latestVersion.number > installed.version,
    };
  });
}

// ---------------------------------------------------------------- install

export interface InstallOutcome {
  slug: string;
  version: number;
  path: string;
}

export async function installSkills(slugs: string[]): Promise<InstallOutcome[]> {
  const outcomes: InstallOutcome[] = [];

  for (const slug of slugs) {
    const detail = await api<SkillDetail>(`/skills/${encodeURIComponent(slug)}`);
    const latest = detail.versions.find((version) => !version.yankedAt);
    if (!latest) throw new Error(`"${slug}" has no installable version`);

    const download = await api<{ url: string; contentHash: string }>(
      `/skills/${encodeURIComponent(slug)}/versions/${latest.number}/download`,
    );
    const response = await fetch(download.url);
    if (!response.ok) throw new Error(`Download failed for "${slug}" (HTTP ${response.status})`);
    const tarball = Buffer.from(await response.arrayBuffer());

    // Never write unverified bytes: hash check BEFORE extraction.
    if (sha256Hex(tarball) !== download.contentHash) {
      throw new Error(`Integrity check failed for "${slug}" — download does not match the registry hash`);
    }

    const entries = await parseTarGz(tarball);
    const path = installSkillFiles(slug, entries);

    const state = loadState();
    state.installs[slug] = {
      version: latest.number,
      contentHash: download.contentHash,
      installedAt: new Date().toISOString(),
    };
    saveState(state);

    outcomes.push({ slug, version: latest.number, path });
  }

  await reportSync();
  return outcomes;
}

// ---------------------------------------------------------------- sync / updates

export async function reportSync(): Promise<SyncResult> {
  const { installs } = loadState();
  const installed = Object.entries(installs).map(([slug, record]) => ({
    slug,
    version: record.version,
  }));
  return api<SyncResult>("/sync", {
    method: "POST",
    body: JSON.stringify({ installed }),
  });
}

export async function updateSkills(slugs?: string[]): Promise<InstallOutcome[]> {
  const diff = await reportSync();
  const targets = diff.updates
    .filter((update) => !slugs || slugs.length === 0 || slugs.includes(update.slug))
    .map((update) => update.slug);
  if (targets.length === 0) return [];
  return installSkills(targets);
}

// ---------------------------------------------------------------- remove (local uninstall)

export async function removeSkills(slugs: string[]): Promise<{ slug: string; removed: boolean }[]> {
  const results = slugs.map((slug) => {
    const removed = removeSkillFiles(slug);
    const state = loadState();
    delete state.installs[slug];
    saveState(state);
    return { slug, removed };
  });
  await reportSync();
  return results;
}

// ---------------------------------------------------------------- unpublish (org-wide archive)

export async function unpublishSkill(slug: string): Promise<void> {
  await api(`/skills/${encodeURIComponent(slug)}`, { method: "DELETE" });
}

// ---------------------------------------------------------------- publish (two-phase)

export interface PrepareResult {
  draftId: string;
  slug: string;
  nextVersion: number;
  fileCount: number;
  totalSize: number;
  files: string[];
  excludedSecrets: { path: string; reason: string }[];
}

export async function preparePublish(
  sourcePath: string,
  options: { slug?: string; displayName?: string; description?: string } = {},
): Promise<PrepareResult> {
  const absolutePath = resolve(sourcePath);
  const built = buildPackage(absolutePath);

  if (built.findings.length > 0) {
    const lines = built.findings
      .map((finding) => `  ${finding.file}: ${finding.detail}`)
      .join("\n");
    throw new Error(`Secret scan found problems — publish aborted:\n${lines}`);
  }

  const frontmatter = readFrontmatter(absolutePath);
  const slug = (options.slug ?? frontmatter.name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error("Could not determine a slug — add `name:` to SKILL.md frontmatter or pass --slug");
  }

  const displayName = options.displayName ?? frontmatter.name ?? slug;
  const description = options.description ?? frontmatter.description;

  const prepared = await api<{ draftId: string; uploadUrl: string; nextVersion: number; warnings: string[] }>(
    "/publish/prepare",
    {
      method: "POST",
      body: JSON.stringify({ slug, displayName, description, manifest: built.manifest }),
    },
  );

  const draft: DraftRecord = {
    draftId: prepared.draftId,
    slug,
    sourcePath: absolutePath,
    uploadUrl: prepared.uploadUrl,
    nextVersion: prepared.nextVersion,
    manifest: built.manifest,
    displayName,
    description,
    createdAt: new Date().toISOString(),
  };
  const state = loadState();
  state.drafts[prepared.draftId] = draft;
  saveState(state);

  return {
    draftId: prepared.draftId,
    slug,
    nextVersion: prepared.nextVersion,
    fileCount: built.manifest.files.length,
    totalSize: built.manifest.totalSize,
    files: built.manifest.files.map((file) => file.path),
    excludedSecrets: built.excludedSecrets,
  };
}

export interface PublishOutcome {
  slug: string;
  version: number;
  contentHash: string;
}

export async function publishDraft(draftId: string): Promise<PublishOutcome> {
  const state = loadState();
  const draft = state.drafts[draftId];
  if (!draft) throw new Error(`Unknown draft "${draftId}" — run prepare first`);

  // Integrity: what gets uploaded must be EXACTLY what the user approved.
  // Re-read the source and compare hashes; any drift aborts.
  const rebuilt = buildPackage(draft.sourcePath);
  const approved = new Map(draft.manifest.files.map((file) => [file.path, file.sha256]));
  const drifted =
    rebuilt.manifest.files.length !== draft.manifest.files.length ||
    rebuilt.manifest.files.some((file) => approved.get(file.path) !== file.sha256);
  if (drifted) {
    throw new Error("Files changed since the manifest was approved — run prepare again");
  }

  const tarball = await packTarGz(
    draft.manifest.files.map((file) => ({
      path: file.path,
      content: rebuilt.contents.get(file.path)!,
    })),
  );

  const upload = await fetch(draft.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "application/gzip" },
    body: new Uint8Array(tarball),
  });
  if (!upload.ok) throw new Error(`Upload failed (HTTP ${upload.status})`);

  const completed = await api<{ skill: { slug: string }; version: { number: number; contentHash: string } }>(
    `/publish/${draftId}/complete`,
    { method: "POST" },
  );

  delete state.drafts[draftId];
  saveState(state);

  return {
    slug: completed.skill.slug,
    version: completed.version.number,
    contentHash: completed.version.contentHash,
  };
}

export { skillDir };
export type { PackageManifest };
