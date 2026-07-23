import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { api } from "../api/client.js";
import {
  allAgents,
  detectAgents,
  resolveAgents,
  type AgentDefinition,
} from "../agents/registry.js";
import { buildPackage, readFrontmatter, type PackageManifest } from "../lib/manifest.js";
import {
  linkSkillToAgent,
  removeSkillFromStore,
  storeSkillDir,
  unlinkSkillFromAgent,
  writeSkillToStore,
  type LinkMode,
} from "../lib/store.js";
import { packTarGz, parseTarGz, sha256Hex } from "../lib/tar.js";
import { loadState, saveState, type DraftRecord } from "../state.js";

/**
 * Core skill operations — shared by CLI commands and MCP tools.
 *
 * Storage model: one real copy per skill in ~/.masterskills/skills/<slug>,
 * linked (junction/symlink, copy fallback) into every detected agent's skills
 * dir. Install targets are auto-detected — the user is never asked which
 * agents to install to; `link` exists for explicit re-targeting.
 *
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
  installedAgents: string[];
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
      installedAgents: Object.keys(installed?.agents ?? {}),
    };
  });
}

// ---------------------------------------------------------------- agents

export interface AgentStatus {
  id: string;
  displayName: string;
  detected: boolean;
  skillsDir: string;
  linkedSkills: string[];
}

export function agentsStatus(): AgentStatus[] {
  const detected = new Set(detectAgents().map((agent) => agent.id));
  const { installs } = loadState();
  return allAgents().map((agent) => ({
    id: agent.id,
    displayName: agent.displayName,
    detected: detected.has(agent.id),
    skillsDir: agent.skillsDir,
    linkedSkills: Object.entries(installs)
      .filter(([, record]) => record.agents?.[agent.id])
      .map(([slug]) => slug),
  }));
}

// ---------------------------------------------------------------- install

export interface InstallOutcome {
  slug: string;
  version: number;
  storePath: string;
  agents: { id: string; mode: LinkMode | "skipped"; reason?: string }[];
}

function linkToAgents(
  slug: string,
  agents: AgentDefinition[],
  owned: boolean,
): InstallOutcome["agents"] {
  const results: InstallOutcome["agents"] = [];
  const state = loadState();
  const record = state.installs[slug];
  for (const agent of agents) {
    const outcome = linkSkillToAgent(slug, agent, { owned });
    results.push({ id: agent.id, mode: outcome.mode, reason: outcome.reason });
    if (record && outcome.mode !== "skipped") {
      record.agents = { ...record.agents, [agent.id]: outcome.mode };
    }
  }
  if (record) saveState(state);
  return results;
}

export async function installSkills(slugs: string[]): Promise<InstallOutcome[]> {
  const outcomes: InstallOutcome[] = [];
  const targets = detectAgents();

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
    const ownedBefore = !!loadState().installs[slug];
    const storePath = writeSkillToStore(slug, entries);

    const state = loadState();
    state.installs[slug] = {
      version: latest.number,
      contentHash: download.contentHash,
      installedAt: new Date().toISOString(),
      agents: state.installs[slug]?.agents ?? {},
    };
    saveState(state);

    // Copy-mode agents need a re-copy after every store rewrite; symlinks
    // update implicitly. Re-linking both keeps it uniform and idempotent.
    const agentResults = linkToAgents(slug, targets, ownedBefore);

    outcomes.push({ slug, version: latest.number, storePath, agents: agentResults });
  }

  await reportSync();
  return outcomes;
}

// ---------------------------------------------------------------- link (explicit re-targeting)

export async function linkSkills(
  slugs?: string[],
  agentIds?: string[],
): Promise<InstallOutcome[]> {
  const state = loadState();
  const targetSlugs = slugs && slugs.length > 0 ? slugs : Object.keys(state.installs);
  const agents = resolveAgents(agentIds);
  if (agents.length === 0) {
    throw new Error("No matching agents detected on this machine");
  }

  const outcomes: InstallOutcome[] = [];
  for (const slug of targetSlugs) {
    const record = state.installs[slug];
    if (!record) throw new Error(`"${slug}" is not installed — run \`masterskills add ${slug}\` first`);
    if (!existsSync(storeSkillDir(slug))) {
      throw new Error(`Store copy for "${slug}" is missing — run \`masterskills add ${slug}\` to repair`);
    }
    outcomes.push({
      slug,
      version: record.version,
      storePath: storeSkillDir(slug),
      agents: linkToAgents(slug, agents, true),
    });
  }
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
  const results: { slug: string; removed: boolean }[] = [];

  for (const slug of slugs) {
    const state = loadState();
    const record = state.installs[slug];
    // Only clean agent dirs we know we own; legacy (pre-store) installs lived
    // directly in Claude Code's dir.
    const agentIds = record?.agents ? Object.keys(record.agents) : ["claude-code"];
    let removedAnything = false;
    for (const agent of allAgents()) {
      if (!agentIds.includes(agent.id)) continue;
      if (unlinkSkillFromAgent(slug, agent)) removedAnything = true;
    }
    if (existsSync(storeSkillDir(slug))) {
      removeSkillFromStore(slug);
      removedAnything = true;
    }
    delete state.installs[slug];
    saveState(state);
    results.push({ slug, removed: removedAnything || !!record });
  }

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

export type { PackageManifest };
