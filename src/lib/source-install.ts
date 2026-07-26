import type { TarEntry } from "./tar.js";
import { sha256Hex } from "./tar.js";

/**
 * Installing INDEXED skills.
 *
 * MasterSkills catalogues these skills but never hosts their bytes — the
 * registry only stores a pointer to the author's repository. So the download
 * happens here, on the user's machine, straight from the source (exactly what
 * the source's own installer would do). Nothing is proxied through us.
 */

export interface SkillSource {
  url: string;
  author: string | null;
  license: string | null;
  installCommand: string | null;
}

interface GitHubRef {
  owner: string;
  repo: string;
  ref: string;
  /** Directory holding SKILL.md (empty string when it sits at the repo root). */
  dir: string;
}

/** Parses https://github.com/owner/repo/blob/ref/path/to/SKILL.md */
export function parseGitHubBlobUrl(url: string): GitHubRef | null {
  const match = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.*)$/,
  );
  if (!match) return null;
  const [, owner, repo, ref, path] = match;
  if (!owner || !repo || !ref || !path) return null;
  const dir = path.replace(/(^|\/)SKILL\.md$/i, "").replace(/^\/+|\/+$/g, "");
  return { owner, repo, ref, dir };
}

interface TreeNode {
  path: string;
  type: string;
  size?: number;
}

const MAX_FILES = 60;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Fetches every file of a skill directory from GitHub: one tree call, then raw
 * downloads (raw.githubusercontent.com has no API rate limit).
 */
export async function fetchSkillFromGitHub(source: SkillSource): Promise<TarEntry[]> {
  const ref = parseGitHubBlobUrl(source.url);
  if (!ref) {
    throw new Error(
      `Cannot install from this source automatically — open ${source.url} and follow its instructions.`,
    );
  }

  const treeUrl = `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${ref.ref}?recursive=1`;
  const treeResponse = await fetch(treeUrl, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!treeResponse.ok) {
    if (treeResponse.status === 403) {
      throw new Error(
        "GitHub rate limit reached — wait a few minutes and try again, or install from the source directly.",
      );
    }
    throw new Error(`Could not read ${ref.owner}/${ref.repo} (HTTP ${treeResponse.status})`);
  }

  const tree = (await treeResponse.json()) as { tree?: TreeNode[]; truncated?: boolean };
  const prefix = ref.dir ? `${ref.dir}/` : "";
  const files = (tree.tree ?? [])
    .filter((node) => node.type === "blob")
    .filter((node) => (prefix ? node.path.startsWith(prefix) : !node.path.includes("/")))
    .filter((node) => (node.size ?? 0) <= MAX_FILE_BYTES);

  if (files.length === 0) {
    throw new Error(`No files found at ${source.url}`);
  }
  if (files.length > MAX_FILES) {
    throw new Error(
      `That source folder has ${files.length} files — too large to install as a skill.`,
    );
  }

  const entries: TarEntry[] = [];
  for (const file of files) {
    const rawUrl = `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${ref.ref}/${file.path}`;
    const response = await fetch(rawUrl);
    if (!response.ok) continue;
    const content = Buffer.from(await response.arrayBuffer());
    // Re-root the paths so the skill folder becomes the package root.
    const relativePath = prefix ? file.path.slice(prefix.length) : file.path;
    entries.push({
      path: relativePath,
      size: content.length,
      sha256: sha256Hex(content),
      content,
    });
  }

  if (!entries.some((entry) => entry.path === "SKILL.md")) {
    throw new Error(`No SKILL.md found at ${source.url}`);
  }
  return entries;
}

/** Stable fingerprint of an installed source skill, for change detection. */
export function fingerprintEntries(entries: TarEntry[]): string {
  const manifest = [...entries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((entry) => `${entry.path}:${entry.sha256}`)
    .join("\n");
  return sha256Hex(Buffer.from(manifest));
}
