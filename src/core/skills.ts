import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { api } from "../api/client.js";
import {
  allAgents,
  detectAgents,
  resolveAgents,
  type AgentDefinition,
} from "../agents/registry.js";
import { loadConfig, saveConfig } from "../config.js";
import { buildPackage, readFrontmatter, type PackageManifest } from "../lib/manifest.js";
import { formatSkillName, parseSkillName, type SkillName } from "../lib/names.js";
import {
  linkSkillToAgent,
  removeSkillFromStore,
  storeSkillDir,
  unlinkSkillFromAgent,
  writeSkillToStore,
  type LinkMode,
} from "../lib/store.js";
import { packTarGz, parseTarGz, sha256Hex, type TarEntry } from "../lib/tar.js";
import { loadState, saveState, type DraftRecord } from "../state.js";

/**
 * Core skill operations — shared by CLI commands and the masterskills skill
 * that teaches agents to drive this CLI.
 *
 * Naming: skills are ALWAYS "@org/slug". State keys, store paths and agent
 * link folders all derive from the full name.
 *
 * The two inviolable principles live at the CALLER level: nothing here asks
 * questions, so every caller (human command or agent) must obtain explicit
 * user approval BEFORE invoking install/publish/remove operations.
 */

// ---------------------------------------------------------------- API types

export interface CatalogSkill {
  name: string;
  org: string;
  slug: string;
  displayName: string;
  description: string | null;
  visibility: "private" | "public";
  isRequired: boolean;
  latestVersion: { number: number; contentHash: string; sizeBytes: number; fileCount: number } | null;
  installCount: number;
  archivedAt: string | null;
}

export interface SkillDetail extends Omit<CatalogSkill, "latestVersion" | "installCount"> {
  versions: { number: number; contentHash: string; sizeBytes: number; fileCount: number; createdAt: string; yankedAt: string | null }[];
}

export interface SyncResult {
  updates: { name: string; from: number; to: number }[];
  newRequired: { name: string; version: number }[];
  removed: { name: string }[];
}

export interface Me {
  user: { id: string; name: string; email: string; username: string };
  orgs: { slug: string; name: string; kind: string; plan: string; role: string }[];
  homeOrg: { slug: string } | null;
  device: { id: string; name: string; lastSeenAt: string | null };
}

export async function fetchMe(): Promise<Me> {
  return api<Me>("/me");
}

/** Default publish namespace = the user's personal org (username), npm-style. */
async function defaultOrg(): Promise<string> {
  const config = loadConfig();
  if (config.username) return config.username;
  const me = await fetchMe();
  saveConfig({ ...config, username: me.user.username });
  return me.user.username;
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
    const installed = installs[skill.name];
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
      .map(([name]) => name),
  }));
}

// ---------------------------------------------------------------- install

export interface InstallOutcome {
  name: string;
  version: number;
  storePath: string;
  agents: { id: string; mode: LinkMode | "skipped"; reason?: string }[];
}

function linkToAgents(
  name: SkillName,
  agents: AgentDefinition[],
  owned: boolean,
): InstallOutcome["agents"] {
  const fullName = formatSkillName(name);
  const results: InstallOutcome["agents"] = [];
  const state = loadState();
  const record = state.installs[fullName];
  for (const agent of agents) {
    const outcome = linkSkillToAgent(name, agent, { owned });
    results.push({ id: agent.id, mode: outcome.mode, reason: outcome.reason });
    if (record && outcome.mode !== "skipped") {
      record.agents = { ...record.agents, [agent.id]: outcome.mode };
    }
  }
  if (record) saveState(state);
  return results;
}

export async function installSkills(inputs: string[]): Promise<InstallOutcome[]> {
  const outcomes: InstallOutcome[] = [];
  const targets = detectAgents();

  for (const input of inputs) {
    const name = parseSkillName(input);
    const fullName = formatSkillName(name);
    const detail = await api<SkillDetail>(`/skills/${name.org}/${name.slug}`);
    const latest = detail.versions.find((version) => !version.yankedAt);
    if (!latest) throw new Error(`${fullName} has no installable version`);

    const download = await api<{ url: string; contentHash: string }>(
      `/skills/${name.org}/${name.slug}/versions/${latest.number}/download`,
    );
    const response = await fetch(download.url);
    if (!response.ok) throw new Error(`Download failed for ${fullName} (HTTP ${response.status})`);
    const tarball = Buffer.from(await response.arrayBuffer());

    // Never write unverified bytes: hash check BEFORE extraction.
    if (sha256Hex(tarball) !== download.contentHash) {
      throw new Error(`Integrity check failed for ${fullName} — download does not match the registry hash`);
    }

    const entries = await parseTarGz(tarball);
    const ownedBefore = !!loadState().installs[fullName];
    const storePath = writeSkillToStore(name, entries);

    const state = loadState();
    state.installs[fullName] = {
      version: latest.number,
      contentHash: download.contentHash,
      installedAt: new Date().toISOString(),
      agents: state.installs[fullName]?.agents ?? {},
    };
    saveState(state);

    // Copy-mode agents need a re-copy after every store rewrite; symlinks
    // update implicitly. Re-linking both keeps it uniform and idempotent.
    const agentResults = linkToAgents(name, targets, ownedBefore);

    outcomes.push({ name: fullName, version: latest.number, storePath, agents: agentResults });
  }

  await reportSync();
  return outcomes;
}

// ---------------------------------------------------------------- link (explicit re-targeting)

export async function linkSkills(
  inputs?: string[],
  agentIds?: string[],
): Promise<InstallOutcome[]> {
  const state = loadState();
  const targetNames =
    inputs && inputs.length > 0 ? inputs : Object.keys(state.installs);
  const agents = resolveAgents(agentIds);
  if (agents.length === 0) {
    throw new Error("No matching agents detected on this machine");
  }

  const outcomes: InstallOutcome[] = [];
  for (const input of targetNames) {
    const name = parseSkillName(input);
    const fullName = formatSkillName(name);
    const record = state.installs[fullName];
    if (!record) throw new Error(`${fullName} is not installed — run \`masterskills add ${fullName}\` first`);
    if (!existsSync(storeSkillDir(name))) {
      throw new Error(`Store copy for ${fullName} is missing — run \`masterskills add ${fullName}\` to repair`);
    }
    outcomes.push({
      name: fullName,
      version: record.version,
      storePath: storeSkillDir(name),
      agents: linkToAgents(name, agents, true),
    });
  }
  return outcomes;
}

// ---------------------------------------------------------------- sync / updates

export async function reportSync(): Promise<SyncResult> {
  const { installs } = loadState();
  const installed = Object.entries(installs).map(([name, record]) => ({
    name,
    version: record.version,
  }));
  return api<SyncResult>("/sync", {
    method: "POST",
    body: JSON.stringify({ installed }),
  });
}

export async function updateSkills(inputs?: string[]): Promise<InstallOutcome[]> {
  const diff = await reportSync();
  const wanted = new Set((inputs ?? []).map((input) => formatSkillName(parseSkillName(input))));
  const targets = diff.updates
    .filter((update) => wanted.size === 0 || wanted.has(update.name))
    .map((update) => update.name);
  if (targets.length === 0) return [];
  return installSkills(targets);
}

// ---------------------------------------------------------------- remove (local uninstall)

export async function removeSkills(inputs: string[]): Promise<{ name: string; removed: boolean }[]> {
  const results: { name: string; removed: boolean }[] = [];

  for (const input of inputs) {
    const name = parseSkillName(input);
    const fullName = formatSkillName(name);
    const state = loadState();
    const record = state.installs[fullName];
    const agentIds = record?.agents ? Object.keys(record.agents) : allAgents().map((a) => a.id);
    let removedAnything = false;
    for (const agent of allAgents()) {
      if (!agentIds.includes(agent.id)) continue;
      if (unlinkSkillFromAgent(name, agent)) removedAnything = true;
    }
    if (existsSync(storeSkillDir(name))) {
      removeSkillFromStore(name);
      removedAnything = true;
    }
    delete state.installs[fullName];
    saveState(state);
    results.push({ name: fullName, removed: removedAnything || !!record });
  }

  await reportSync();
  return results;
}

// ---------------------------------------------------------------- unpublish (org-wide archive)

export async function unpublishSkill(input: string): Promise<string> {
  const name = parseSkillName(input);
  await api(`/skills/${name.org}/${name.slug}`, { method: "DELETE" });
  return formatSkillName(name);
}

// ---------------------------------------------------------------- publish (two-phase)

export interface PrepareResult {
  draftId: string;
  name: string;
  org: string;
  slug: string;
  nextVersion: number;
  visibility: "private" | "public";
  fileCount: number;
  totalSize: number;
  files: string[];
  excludedSecrets: { path: string; reason: string }[];
}

export async function preparePublish(
  sourcePath: string,
  options: {
    org?: string;
    slug?: string;
    displayName?: string;
    description?: string;
    visibility?: "private" | "public";
  } = {},
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

  const org = (options.org ?? (await defaultOrg())).replace(/^@/, "");
  const displayName = options.displayName ?? frontmatter.name ?? slug;
  const description = options.description ?? frontmatter.description;
  const visibility = options.visibility ?? "private";

  const prepared = await api<{
    draftId: string;
    name: string;
    org: string;
    uploadUrl: string;
    nextVersion: number;
    warnings: string[];
  }>("/publish/prepare", {
    method: "POST",
    body: JSON.stringify({ org, slug, displayName, description, visibility, manifest: built.manifest }),
  });

  const draft: DraftRecord = {
    draftId: prepared.draftId,
    name: prepared.name,
    org: prepared.org,
    slug,
    sourcePath: absolutePath,
    uploadUrl: prepared.uploadUrl,
    nextVersion: prepared.nextVersion,
    visibility,
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
    name: prepared.name,
    org: prepared.org,
    slug,
    nextVersion: prepared.nextVersion,
    visibility,
    fileCount: built.manifest.files.length,
    totalSize: built.manifest.totalSize,
    files: built.manifest.files.map((file) => file.path),
    excludedSecrets: built.excludedSecrets,
  };
}

export interface PublishOutcome {
  name: string;
  version: number;
  contentHash: string;
  /** Set when the source folder was a hand-made agent skill that got adopted into the store. */
  adopted?: { agents: { id: string; mode: LinkMode | "skipped" }[] };
}

/**
 * Adopt-after-publish: if the published source was a hand-made skill living
 * DIRECTLY inside an agent's global skills dir (e.g. ~/.claude/skills/docs),
 * move it into the central store and replace the original with a link — from
 * now on it versions and syncs like any registry skill. Repo-level skills
 * (.claude/skills inside a project) are left alone: the repo distributes them.
 */
function maybeAdopt(
  draft: DraftRecord,
  entries: TarEntry[],
  version: number,
  contentHash: string,
): PublishOutcome["adopted"] {
  const sourceDir = resolve(draft.sourcePath);
  const hostAgent = detectAgents().find(
    (agent) => resolve(dirname(sourceDir)) === resolve(agent.skillsDir),
  );
  if (!hostAgent) return undefined;

  const name = { org: draft.org, slug: draft.slug };
  writeSkillToStore(name, entries);
  // Remove the original hand-made folder, then link every detected agent.
  rmSync(sourceDir, { recursive: true, force: true });
  const results = detectAgents().map((agent) => {
    const outcome = linkSkillToAgent(name, agent, { owned: true });
    return { id: agent.id, mode: outcome.mode };
  });

  const state = loadState();
  state.installs[draft.name] = {
    version,
    contentHash,
    installedAt: new Date().toISOString(),
    agents: Object.fromEntries(
      results.filter((r) => r.mode !== "skipped").map((r) => [r.id, r.mode as LinkMode]),
    ),
  };
  saveState(state);

  return { agents: results };
}

export async function publishDraft(draftId: string): Promise<PublishOutcome> {
  const state = loadState();
  const draft = state.drafts[draftId];
  if (!draft) throw new Error(`Unknown draft "${draftId}" — run prepare first`);

  // Integrity: what gets uploaded must be EXACTLY what the user approved.
  const rebuilt = buildPackage(draft.sourcePath);
  const approved = new Map(draft.manifest.files.map((file) => [file.path, file.sha256]));
  const drifted =
    rebuilt.manifest.files.length !== draft.manifest.files.length ||
    rebuilt.manifest.files.some((file) => approved.get(file.path) !== file.sha256);
  if (drifted) {
    throw new Error("Files changed since the manifest was approved — run prepare again");
  }

  const entries: TarEntry[] = draft.manifest.files.map((file) => ({
    path: file.path,
    size: file.size,
    sha256: file.sha256,
    content: rebuilt.contents.get(file.path)!,
  }));
  const tarball = await packTarGz(entries.map((e) => ({ path: e.path, content: e.content })));

  const upload = await fetch(draft.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "application/gzip" },
    body: new Uint8Array(tarball),
  });
  if (!upload.ok) throw new Error(`Upload failed (HTTP ${upload.status})`);

  const completed = await api<{
    skill: { name: string };
    version: { number: number; contentHash: string };
  }>(`/publish/${draftId}/complete`, { method: "POST" });

  const adopted = maybeAdopt(draft, entries, completed.version.number, completed.version.contentHash);

  const freshState = loadState();
  delete freshState.drafts[draftId];
  saveState(freshState);

  return {
    name: completed.skill.name,
    version: completed.version.number,
    contentHash: completed.version.contentHash,
    adopted,
  };
}

export type { PackageManifest };
