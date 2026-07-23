import { createInterface } from "node:readline/promises";
import { ApiError } from "../api/client.js";
import {
  installSkills,
  listSkills,
  preparePublish,
  publishDraft,
  removeSkills,
  reportSync,
  unpublishSkill,
  updateSkills,
} from "../core/skills.js";

function friendlyError(error: unknown): never {
  if (error instanceof ApiError && error.status === 401) {
    console.error("Not signed in or device revoked. Run: masterskills login");
  } else if (error instanceof ApiError && error.body && "scanFindings" in error.body) {
    console.error("Publish rejected by the server's secret scan:");
    for (const finding of error.body.scanFindings as { file: string; detail: string }[]) {
      console.error(`  ${finding.file}: ${finding.detail}`);
    }
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------- list / search

export async function listCommand(query?: string): Promise<void> {
  try {
    const skills = await listSkills(query);
    if (skills.length === 0) {
      console.log(query ? `No skills matching "${query}".` : "No skills in your organization yet.");
      return;
    }
    for (const skill of skills) {
      const version = skill.latestVersion ? `v${skill.latestVersion.number}` : "-";
      const status = skill.installedVersion
        ? skill.updateAvailable
          ? `installed v${skill.installedVersion} → update available`
          : `installed v${skill.installedVersion}`
        : "not installed";
      const required = skill.isRequired ? " [required]" : "";
      console.log(`${skill.slug}  ${version}  (${status})${required}`);
      if (skill.description) console.log(`  ${skill.description}`);
    }
  } catch (error) {
    friendlyError(error);
  }
}

// ---------------------------------------------------------------- add

export async function addCommand(slugs: string[]): Promise<void> {
  try {
    const outcomes = await installSkills(slugs);
    for (const outcome of outcomes) {
      console.log(`✓ ${outcome.slug} v${outcome.version} installed → ${outcome.path}`);
    }
    console.log("\nSkills load in NEW agent sessions — restart Claude Code to pick them up.");
  } catch (error) {
    friendlyError(error);
  }
}

// ---------------------------------------------------------------- update

export async function updateCommand(
  slugs: string[],
  options: { check?: boolean },
): Promise<void> {
  try {
    if (options.check) {
      const diff = await reportSync();
      if (diff.updates.length === 0 && diff.newRequired.length === 0 && diff.removed.length === 0) {
        console.log("Everything is up to date.");
        return;
      }
      for (const update of diff.updates) {
        console.log(`↑ ${update.slug}  v${update.from} → v${update.to}`);
      }
      for (const required of diff.newRequired) {
        console.log(`+ ${required.slug}  v${required.version} — required by your organization, not installed`);
      }
      for (const removed of diff.removed) {
        console.log(`- ${removed.slug} — removed by your organization (run \`masterskills remove ${removed.slug}\` to clean up)`);
      }
      return;
    }

    const outcomes = await updateSkills(slugs);
    if (outcomes.length === 0) {
      console.log("Everything is up to date.");
      return;
    }
    for (const outcome of outcomes) {
      console.log(`✓ ${outcome.slug} updated to v${outcome.version}`);
    }
  } catch (error) {
    friendlyError(error);
  }
}

// ---------------------------------------------------------------- remove

export async function removeCommand(slugs: string[]): Promise<void> {
  try {
    const results = await removeSkills(slugs);
    for (const result of results) {
      console.log(result.removed ? `✓ ${result.slug} removed from this machine` : `- ${result.slug} was not installed`);
    }
  } catch (error) {
    friendlyError(error);
  }
}

// ---------------------------------------------------------------- unpublish

export async function unpublishCommand(
  slug: string,
  options: { yes?: boolean },
): Promise<void> {
  try {
    if (!options.yes) {
      const ok = await confirm(
        `Archive "${slug}" for the WHOLE organization? Members will see it as removed on next sync.`,
      );
      if (!ok) {
        console.log("Cancelled.");
        return;
      }
    }
    await unpublishSkill(slug);
    console.log(`✓ ${slug} archived — it no longer appears in the organization catalog.`);
  } catch (error) {
    friendlyError(error);
  }
}

// ---------------------------------------------------------------- publish

export async function publishCommand(
  path: string | undefined,
  options: { slug?: string; name?: string; desc?: string; yes?: boolean },
): Promise<void> {
  try {
    const prepared = await preparePublish(path ?? ".", {
      slug: options.slug,
      displayName: options.name,
      description: options.desc,
    });

    console.log(`\n${prepared.slug} → version ${prepared.nextVersion} (private)`);
    console.log(`${prepared.fileCount} files, ${formatSize(prepared.totalSize)}:`);
    for (const file of prepared.files) console.log(`  ${file}`);
    for (const excluded of prepared.excludedSecrets) {
      console.log(`  ⚠ ${excluded.path} — EXCLUDED (${excluded.reason})`);
    }

    if (!options.yes) {
      const ok = await confirm("\nPublish this package?");
      if (!ok) {
        console.log("Cancelled — nothing was uploaded.");
        return;
      }
    }

    const outcome = await publishDraft(prepared.draftId);
    console.log(`\n✓ Published ${outcome.slug} v${outcome.version} (${outcome.contentHash.slice(0, 12)}…)`);
  } catch (error) {
    friendlyError(error);
  }
}

// ---------------------------------------------------------------- sync

export async function syncCommand(): Promise<void> {
  try {
    const diff = await reportSync();
    console.log("Synced with the registry.");
    if (diff.updates.length > 0) console.log(`${diff.updates.length} update(s) available — run \`masterskills update\`.`);
    if (diff.newRequired.length > 0) console.log(`${diff.newRequired.length} required skill(s) not installed — run \`masterskills update --check\`.`);
    if (diff.removed.length > 0) console.log(`${diff.removed.length} installed skill(s) were removed by your organization.`);
  } catch (error) {
    friendlyError(error);
  }
}
