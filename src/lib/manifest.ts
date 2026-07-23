import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isSecretFilePath, scanContent, type ScanFinding } from "./secret-scan.js";
import { normalizeEntryPath, sha256Hex } from "./tar.js";

export interface ManifestFile {
  path: string;
  size: number;
  sha256: string;
}

export interface PackageManifest {
  files: ManifestFile[];
  totalSize: number;
}

export interface BuiltPackage {
  manifest: PackageManifest;
  /** Path → content, for packing after approval. */
  contents: Map<string, Buffer>;
  /** Files that were auto-excluded because they look like secrets (Dialog 3: always TELL the user). */
  excludedSecrets: { path: string; reason: string }[];
  /** Content findings in files that WOULD be published — publishing must abort on these. */
  findings: ScanFinding[];
}

/** Junk that never belongs in a skill package. */
const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist", "__pycache__", ".venv", ".idea", ".vscode"]);
const EXCLUDED_FILES = new Set([".DS_Store", "Thumbs.db"]);

function walk(root: string, relative = ""): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const relPath = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      results.push(...walk(root, relPath));
    } else if (entry.isFile()) {
      if (EXCLUDED_FILES.has(entry.name) || entry.name.endsWith(".log")) continue;
      results.push(relPath);
    }
  }
  return results;
}

export function buildPackage(sourceDir: string): BuiltPackage {
  const files: ManifestFile[] = [];
  const contents = new Map<string, Buffer>();
  const excludedSecrets: { path: string; reason: string }[] = [];
  const findings: ScanFinding[] = [];
  let totalSize = 0;

  for (const relPath of walk(sourceDir).sort()) {
    const path = normalizeEntryPath(relPath);
    const secretReason = isSecretFilePath(path);
    if (secretReason) {
      excludedSecrets.push({ path, reason: secretReason });
      continue;
    }
    const content = readFileSync(join(sourceDir, relPath));
    findings.push(...scanContent(path, content));
    files.push({ path, size: content.length, sha256: sha256Hex(content) });
    contents.set(path, content);
    totalSize += content.length;
  }

  if (statSync(sourceDir).isDirectory() && !contents.has("SKILL.md")) {
    throw new Error(`No SKILL.md found in ${sourceDir} — is this a skill folder?`);
  }

  return { manifest: { files, totalSize }, contents, excludedSecrets, findings };
}

/** Minimal SKILL.md frontmatter reader (name/description) — no YAML dependency. */
export function readFrontmatter(sourceDir: string): { name?: string; description?: string } {
  try {
    const text = readFileSync(join(sourceDir, "SKILL.md"), "utf8");
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const frontmatter = match?.[1];
    if (!frontmatter) return {};
    const result: { name?: string; description?: string } = {};
    const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1];
    const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1];
    if (name) result.name = name.trim().replace(/^["']|["']$/g, "");
    if (description) result.description = description.trim().replace(/^["']|["']$/g, "");
    return result;
  } catch {
    return {};
  }
}
