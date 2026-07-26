import { createInterface } from "node:readline/promises";
import { ApiError } from "../api/client.js";
import {
  createKit,
  deleteKit,
  getKit,
  listKits,
  updateKit,
  type KitView,
} from "../core/kits.js";

function fail(error: unknown): never {
  if (error instanceof ApiError && error.status === 401) {
    console.error("Not signed in or device revoked. Run: masterskills login");
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
}

function jsonOut(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

function printKit(kit: KitView): void {
  console.log(`\n${kit.name} — ${kit.displayName} [${kit.visibility}]`);
  if (kit.description) console.log(kit.description);
  console.log(`\n${kit.skills.length} skill${kit.skills.length === 1 ? "" : "s"}:`);
  for (const skill of kit.skills) {
    const flags = skill.isIndexed ? " (indexed)" : "";
    console.log(`  ${skill.name}${flags}`);
    if (skill.description) console.log(`    ${skill.description}`);
  }
  if (kit.hiddenCount > 0) {
    console.log(
      `\n${kit.hiddenCount} skill(s) in this kit aren't visible to you and will be skipped.`,
    );
  }
  console.log(`\nInstall with:\n  masterskills add ${kit.name}`);
}

// ---------------------------------------------------------------- list

export async function kitListCommand(options: { json?: boolean }): Promise<void> {
  try {
    const kits = await listKits();
    if (options.json) return jsonOut(kits);
    if (kits.length === 0) {
      console.log("No kits yet. Create one with: masterskills kit create <slug> --skills <names>");
      return;
    }
    for (const kit of kits) {
      console.log(
        `${kit.name}  ${kit.skillCount} skill${kit.skillCount === 1 ? "" : "s"}  [${kit.visibility}]`,
      );
      if (kit.description) console.log(`  ${kit.description}`);
    }
  } catch (error) {
    fail(error);
  }
}

// ---------------------------------------------------------------- info

export async function kitInfoCommand(
  name: string,
  options: { json?: boolean },
): Promise<void> {
  try {
    const kit = await getKit(name);
    if (options.json) return jsonOut(kit);
    printKit(kit);
  } catch (error) {
    fail(error);
  }
}

// ---------------------------------------------------------------- create

function parseSkillList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function kitCreateCommand(
  slug: string,
  options: {
    org?: string;
    name?: string;
    desc?: string;
    skills?: string;
    public?: boolean;
    json?: boolean;
  },
): Promise<void> {
  try {
    const skills = parseSkillList(options.skills);
    if (skills.length === 0) {
      console.error(
        "A kit needs at least one skill:\n  masterskills kit create my-kit --skills @acme/a,@acme/b",
      );
      process.exit(1);
    }

    // Accept either a bare slug or a full @org/slug for the kit itself.
    const match = slug.match(/^@?([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)$/i);
    const kitSlug = match ? match[2]! : slug;
    const org = options.org?.replace(/^@/, "") ?? (match ? match[1] : undefined);

    const kit = await createKit({
      org,
      slug: kitSlug.toLowerCase(),
      displayName: options.name,
      description: options.desc,
      visibility: options.public ? "public" : "private",
      skills,
    });

    if (options.json) return jsonOut(kit);
    console.log(`✓ Created ${kit.name} with ${kit.skills.length} skill(s):`);
    for (const skill of kit.skills) console.log(`  ${skill}`);
    console.log(`\nInstall with:\n  masterskills add ${kit.name}`);
  } catch (error) {
    fail(error);
  }
}

// ---------------------------------------------------------------- edit contents

export async function kitAddSkillCommand(
  kitName: string,
  skillNames: string[],
): Promise<void> {
  try {
    const kit = await getKit(kitName);
    const next = [...new Set([...kit.skills.map((s) => s.name), ...skillNames])];
    const updated = await updateKit(kitName, { skills: next });
    console.log(`✓ ${updated.name} now has ${updated.skills.length} skill(s).`);
  } catch (error) {
    fail(error);
  }
}

export async function kitRemoveSkillCommand(
  kitName: string,
  skillNames: string[],
): Promise<void> {
  try {
    const kit = await getKit(kitName);
    const drop = new Set(skillNames.map((n) => (n.startsWith("@") ? n : `@${n}`)));
    const next = kit.skills.map((s) => s.name).filter((n) => !drop.has(n));
    if (next.length === 0) {
      console.error("A kit needs at least one skill — delete the kit instead:");
      console.error(`  masterskills kit delete ${kit.name}`);
      process.exit(1);
    }
    const updated = await updateKit(kitName, { skills: next });
    console.log(`✓ ${updated.name} now has ${updated.skills.length} skill(s).`);
  } catch (error) {
    fail(error);
  }
}

// ---------------------------------------------------------------- delete

export async function kitDeleteCommand(
  name: string,
  options: { yes?: boolean },
): Promise<void> {
  try {
    if (!options.yes) {
      const ok = await confirm(
        `Delete kit "${name}" for the whole organization? The skills inside are not touched.`,
      );
      if (!ok) {
        console.log("Cancelled.");
        return;
      }
    }
    const deleted = await deleteKit(name);
    console.log(`✓ ${deleted} deleted. The skills it referenced are untouched.`);
  } catch (error) {
    fail(error);
  }
}
