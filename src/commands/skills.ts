import { createInterface } from "node:readline/promises";
import { ApiError } from "../api/client.js";
import { createKit, findKit, updateKit } from "../core/kits.js";
import {
  agentsStatus,
  installSkills,
  linkSkills,
  listSkills,
  preparePublish,
  publishDraft,
  removeSkills,
  reportSync,
  unpublishSkill,
  updateSkills,
  type InstallOutcome,
  type PrepareResult,
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

function jsonOut(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function describeAgents(outcome: InstallOutcome): string {
  const linked = outcome.agents.filter((agent) => agent.mode !== "skipped");
  const skipped = outcome.agents.filter((agent) => agent.mode === "skipped");
  const parts: string[] = [];
  if (linked.length > 0) {
    parts.push(linked.map((agent) => `${agent.id} (${agent.mode})`).join(", "));
  }
  for (const agent of skipped) parts.push(`${agent.id} SKIPPED: ${agent.reason}`);
  return parts.join("; ") || "no agents detected";
}

// ---------------------------------------------------------------- list / search

export async function listCommand(
  query: string | undefined,
  options: { json?: boolean } = {},
): Promise<void> {
  try {
    const skills = await listSkills(query);
    if (options.json) return jsonOut(skills);
    if (skills.length === 0) {
      console.log(query ? `No skills matching "${query}".` : "No skills in your organizations yet.");
      return;
    }
    for (const skill of skills) {
      const version = skill.latestVersion ? `v${skill.latestVersion.number}` : "-";
      const status = skill.installedVersion
        ? skill.updateAvailable
          ? `installed v${skill.installedVersion} → update available`
          : `installed v${skill.installedVersion}`
        : "not installed";
      const flags = `${skill.isRequired ? " [required]" : ""}${skill.visibility === "public" ? " [public]" : ""}`;
      console.log(`${skill.name}  ${version}  (${status})${flags}`);
      if (skill.description) console.log(`  ${skill.description}`);
    }
  } catch (error) {
    friendlyError(error);
  }
}

// ---------------------------------------------------------------- add

/**
 * Installs skills — and kits. Kits share the org namespace with skills, so a
 * name that isn't a skill is looked up as a kit and its contents installed.
 * That is what makes `masterskills add @acme/frontend` a one-command install
 * whether "frontend" is a single skill or a bundle.
 */
export async function addCommand(names: string[]): Promise<void> {
  try {
    const outcomes: InstallOutcome[] = [];

    for (const name of names) {
      try {
        outcomes.push(...(await installSkills([name])));
      } catch (error) {
        const notASkill =
          error instanceof ApiError && error.status === 404;
        if (!notASkill) throw error;

        const kit = await findKit(name);
        if (!kit) throw error; // neither a skill nor a kit

        console.log(
          `${kit.name} is a kit — installing ${kit.skills.length} skill(s) it contains:`,
        );
        if (kit.hiddenCount > 0) {
          console.log(
            `  (${kit.hiddenCount} skill(s) in this kit aren't available to you and were skipped)`,
          );
        }
        outcomes.push(...(await installSkills(kit.skills.map((s) => s.name))));
      }
    }

    for (const outcome of outcomes) {
      console.log(`✓ ${outcome.name} v${outcome.version} installed → ${describeAgents(outcome)}`);
    }
    console.log("\nSkills load in NEW agent sessions — restart your agent to pick them up.");
  } catch (error) {
    friendlyError(error);
  }
}

// ---------------------------------------------------------------- agents

export async function agentsCommand(options: { json?: boolean } = {}): Promise<void> {
  const status = agentsStatus();
  if (options.json) return jsonOut(status);
  for (const agent of status) {
    console.log(`${agent.id}  (${agent.displayName}) — ${agent.detected ? "detected" : "not installed"}`);
    console.log(`  skills dir: ${agent.skillsDir}`);
    if (agent.linkedSkills.length > 0) {
      console.log(`  linked skills: ${agent.linkedSkills.join(", ")}`);
    }
  }
}

// ---------------------------------------------------------------- link

export async function linkCommand(
  names: string[],
  options: { agents?: string },
): Promise<void> {
  try {
    const agentIds = options.agents
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const outcomes = await linkSkills(names, agentIds);
    if (outcomes.length === 0) {
      console.log("Nothing to link — install skills first with `masterskills add`.");
      return;
    }
    for (const outcome of outcomes) {
      console.log(`✓ ${outcome.name} v${outcome.version} → ${describeAgents(outcome)}`);
    }
  } catch (error) {
    friendlyError(error);
  }
}

// ---------------------------------------------------------------- update

export async function updateCommand(
  names: string[],
  options: { check?: boolean; json?: boolean },
): Promise<void> {
  try {
    if (options.check) {
      const diff = await reportSync();
      if (options.json) return jsonOut(diff);
      if (diff.updates.length === 0 && diff.newRequired.length === 0 && diff.removed.length === 0) {
        console.log("Everything is up to date.");
        return;
      }
      for (const update of diff.updates) {
        console.log(`↑ ${update.name}  v${update.from} → v${update.to}`);
      }
      for (const required of diff.newRequired) {
        console.log(`+ ${required.name}  v${required.version} — required by your organization, not installed`);
      }
      for (const removed of diff.removed) {
        console.log(`- ${removed.name} — removed by your organization (run \`masterskills remove ${removed.name}\` to clean up)`);
      }
      return;
    }

    const outcomes = await updateSkills(names);
    if (outcomes.length === 0) {
      console.log("Everything is up to date.");
      return;
    }
    for (const outcome of outcomes) {
      console.log(`✓ ${outcome.name} updated to v${outcome.version}`);
    }
  } catch (error) {
    friendlyError(error);
  }
}

// ---------------------------------------------------------------- remove

export async function removeCommand(names: string[]): Promise<void> {
  try {
    const results = await removeSkills(names);
    for (const result of results) {
      console.log(result.removed ? `✓ ${result.name} removed from this machine` : `- ${result.name} was not installed`);
    }
  } catch (error) {
    friendlyError(error);
  }
}

// ---------------------------------------------------------------- unpublish

export async function unpublishCommand(
  name: string,
  options: { yes?: boolean },
): Promise<void> {
  try {
    if (!options.yes) {
      const ok = await confirm(
        `Archive "${name}" for the WHOLE organization? Members will see it as removed on next sync.`,
      );
      if (!ok) {
        console.log("Cancelled.");
        return;
      }
    }
    const fullName = await unpublishSkill(name);
    console.log(`✓ ${fullName} archived — it no longer appears in the organization catalog.`);
  } catch (error) {
    friendlyError(error);
  }
}

// ---------------------------------------------------------------- prepare / publish (two-phase, agent-friendly)

interface PublishOptions {
  org?: string;
  slug?: string;
  name?: string;
  desc?: string;
  public?: boolean;
  yes?: boolean;
  json?: boolean;
  /** Group (kit) to file the published skill into — created if missing. */
  group?: string;
  /** Alias of --group. */
  kit?: string;
}

/**
 * Files a freshly published skill into a group (kit) in the same org,
 * creating the group when it doesn't exist yet. Best-effort by design: a
 * group failure must never fail the publish that already succeeded.
 */
async function addPublishedSkillToGroup(
  orgSlug: string,
  groupInput: string,
  skillName: string,
): Promise<void> {
  // Accept "ai-team" or "@org/ai-team"; the org half must match the skill's.
  const match = groupInput.match(/^@?([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)$/i);
  const groupSlug = (match ? match[2]! : groupInput).toLowerCase();
  const groupOrg = (match ? match[1]! : orgSlug).toLowerCase();
  const groupName = `@${groupOrg}/${groupSlug}`;

  try {
    if (groupOrg !== orgSlug.toLowerCase()) {
      throw new Error(
        `Group ${groupName} is in a different namespace than the skill (@${orgSlug}).`,
      );
    }
    const existing = await findKit(groupName);
    if (existing) {
      const next = [...new Set([...existing.skills.map((s) => s.name), skillName])];
      await updateKit(groupName, { skills: next });
    } else {
      await createKit({ org: groupOrg, slug: groupSlug, skills: [skillName] });
      console.log(`✓ Group ${groupName} didn't exist — created it.`);
    }
    console.log(`✓ Added to ${groupName} — install the bundle with: masterskills add ${groupName}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`⚠ Published, but could not add to ${groupName}: ${reason}`);
    console.error(`  Add it manually with: masterskills kit add-skill ${groupName} ${skillName}`);
  }
}

function printManifest(prepared: PrepareResult): void {
  console.log(`\n${prepared.name} → version ${prepared.nextVersion} (${prepared.visibility})`);
  console.log(`${prepared.fileCount} files, ${formatSize(prepared.totalSize)}:`);
  for (const file of prepared.files) console.log(`  ${file}`);
  for (const excluded of prepared.excludedSecrets) {
    console.log(`  ⚠ ${excluded.path} — EXCLUDED (${excluded.reason})`);
  }
}

async function runPrepare(path: string | undefined, options: PublishOptions): Promise<PrepareResult> {
  return preparePublish(path ?? ".", {
    org: options.org,
    slug: options.slug,
    displayName: options.name,
    description: options.desc,
    visibility: options.public ? "public" : "private",
  });
}

/** Agent flow step 1: build + register the draft, show the manifest, publish NOTHING. */
export async function prepareCommand(
  path: string | undefined,
  options: PublishOptions,
): Promise<void> {
  try {
    const prepared = await runPrepare(path, options);
    if (options.json) return jsonOut(prepared);
    printManifest(prepared);
    console.log(`\nDraft ready: ${prepared.draftId}`);
    console.log(`To publish after approval: masterskills publish-draft ${prepared.draftId}`);
  } catch (error) {
    friendlyError(error);
  }
}

/** Agent flow step 2: upload + publish a previously approved draft. */
export async function publishDraftCommand(draftId: string): Promise<void> {
  try {
    const outcome = await publishDraft(draftId);
    console.log(`✓ Published ${outcome.name} v${outcome.version} (${outcome.contentHash.slice(0, 12)}…)`);
    if (outcome.adopted) {
      console.log(
        `✓ Source folder adopted into the MasterSkills store and linked to: ${outcome.adopted.agents
          .map((agent) => agent.id)
          .join(", ")} — it now updates like any registry skill.`,
      );
    }
  } catch (error) {
    friendlyError(error);
  }
}

/** Human flow: prepare + confirm + publish in one go. */
export async function publishCommand(
  path: string | undefined,
  options: PublishOptions,
): Promise<void> {
  try {
    const prepared = await runPrepare(path, options);
    printManifest(prepared);

    if (!options.yes) {
      const ok = await confirm("\nPublish this package?");
      if (!ok) {
        console.log("Cancelled — nothing was uploaded.");
        return;
      }
    }

    const outcome = await publishDraft(prepared.draftId);
    console.log(`\n✓ Published ${outcome.name} v${outcome.version} (${outcome.contentHash.slice(0, 12)}…)`);
    if (outcome.adopted) {
      console.log(
        `✓ Source folder adopted into the MasterSkills store and linked to: ${outcome.adopted.agents
          .map((agent) => agent.id)
          .join(", ")} — it now updates like any registry skill.`,
      );
    }

    const group = options.group ?? options.kit;
    if (group) {
      await addPublishedSkillToGroup(prepared.org, group, prepared.name);
    }
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
