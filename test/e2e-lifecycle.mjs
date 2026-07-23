/**
 * MasterSkills CLI lifecycle e2e — exercises the FULL user journey through the
 * real CLI binary against a running server (default http://localhost:3000).
 *
 * Sequence (mirrors the product's core loop):
 *   list → publish v1 → list (verify) → search (hit + miss) → add (download,
 *   verify files) → publish v2 → update --check (sees v1→v2) → update (gets
 *   v2 files) → remove (local uninstall) → unpublish (org archive) → list
 *   (must be gone)
 *
 * Isolation: MASTERSKILLS_HOME and MASTERSKILLS_CLAUDE_DIR point at temp dirs —
 * the harness NEVER touches your real ~/.masterskills or ~/.claude.
 *
 * Auth: MASTERSKILLS_TOKEN env if set; otherwise mints a device token via the
 * local docker postgres (dev convenience).
 *
 * Run: pnpm test:e2e
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = process.env.MASTERSKILLS_API_URL ?? "http://localhost:3000";
const SLUG = "e2e-lifecycle-skill";
const repoRoot = join(fileURLToPath(import.meta.url), "..", "..");
const CLI = join(repoRoot, "dist", "cli.js");

// ---------------------------------------------------------------- isolation
const sandbox = mkdtempSync(join(tmpdir(), "masterskills-e2e-"));
const HOME = join(sandbox, "masterskills-home");
const CLAUDE = join(sandbox, "claude-home");
const FIXTURE = join(sandbox, "fixture-skill");
mkdirSync(HOME, { recursive: true });

// ---------------------------------------------------------------- auth
function mintToken() {
  const token = `msk_e2e_${randomBytes(24).toString("base64url")}`;
  const hash = createHash("sha256").update(token).digest("hex");
  execFileSync("docker", [
    "exec", "masterskills-postgres-1", "psql", "-U", "masterskills", "-c",
    `INSERT INTO devices (user_id, org_id, name, token_hash) SELECT u.id, o.id, 'e2e-lifecycle', '${hash}' FROM "user" u CROSS JOIN organizations o LIMIT 1;`,
  ]);
  return token;
}

function cleanupServerState() {
  try {
    execFileSync("docker", [
      "exec", "masterskills-postgres-1", "psql", "-U", "masterskills", "-c",
      `DELETE FROM skills WHERE slug = '${SLUG}'; DELETE FROM publish_drafts WHERE skill_slug = '${SLUG}'; DELETE FROM audit_events WHERE subject = '${SLUG}'; DELETE FROM devices WHERE name = 'e2e-lifecycle';`,
    ]);
  } catch {
    console.log("  (docker cleanup skipped)");
  }
}

const TOKEN = process.env.MASTERSKILLS_TOKEN ?? (cleanupServerState(), mintToken());

// ---------------------------------------------------------------- cli runner
const env = {
  ...process.env,
  MASTERSKILLS_API_URL: API_URL,
  MASTERSKILLS_TOKEN: TOKEN,
  MASTERSKILLS_HOME: HOME,
  MASTERSKILLS_CLAUDE_DIR: CLAUDE,
};

function cli(...args) {
  try {
    return { code: 0, out: execFileSync("node", [CLI, ...args], { env, encoding: "utf8" }) };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

let failures = 0;
function check(name, condition, extra = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra.trim().slice(0, 200)}` : ""}`);
  if (!condition) failures++;
}

function writeFixture(version) {
  rmSync(FIXTURE, { recursive: true, force: true });
  mkdirSync(join(FIXTURE, "references"), { recursive: true });
  writeFileSync(join(FIXTURE, "SKILL.md"), `---\nname: ${SLUG}\ndescription: Lifecycle demo skill (v${version})\n---\n\n# Lifecycle demo v${version}\nBookmaker demo content.\n`);
  writeFileSync(join(FIXTURE, "references", "rules.md"), `# Rules v${version}\n`);
  // A secret-looking local file — must be auto-excluded and reported.
  writeFileSync(join(FIXTURE, "config.local.json"), `{"apiKey":"not-a-real-key"}`);
}

// ================================================================ sequence
console.log(`\nLifecycle e2e against ${API_URL}\n`);

// 1. list — skill absent
let r = cli("list");
check("1. list works, skill not present yet", r.code === 0 && !r.out.includes(SLUG), r.out);

// 2. publish v1
writeFixture(1);
r = cli("publish", FIXTURE, "--yes");
check("2. publish v1 succeeds", r.code === 0 && r.out.includes("Published") && r.out.includes("v1"), r.out);
check("2b. secret file auto-excluded and reported", r.out.includes("config.local.json") && r.out.includes("EXCLUDED"), r.out);

// 3. list — skill visible
r = cli("list");
check("3. list shows the published skill", r.code === 0 && r.out.includes(SLUG) && r.out.includes("v1"), r.out);

// 4. search — hit and miss
r = cli("search", "lifecycle demo");
check("4. search finds by description", r.code === 0 && r.out.includes(SLUG), r.out);
r = cli("search", "zzz-no-such-skill");
check("4b. search miss returns empty", r.code === 0 && !r.out.includes(SLUG), r.out);

// 5. add — download + files on disk
r = cli("add", SLUG);
const skillMd = join(CLAUDE, "skills", SLUG, "SKILL.md");
const rulesMd = join(CLAUDE, "skills", SLUG, "references", "rules.md");
check("5. add installs the skill", r.code === 0 && r.out.includes("installed"), r.out);
check("5b. SKILL.md written to agent dir", existsSync(skillMd) && readFileSync(skillMd, "utf8").includes("v1"));
check("5c. nested reference file written", existsSync(rulesMd));
check("5d. excluded secret file NOT downloaded", !existsSync(join(CLAUDE, "skills", SLUG, "config.local.json")));
r = cli("list");
check("5e. list shows installed state", r.out.includes("installed v1"), r.out);

// 6. publish v2
writeFixture(2);
r = cli("publish", FIXTURE, "--yes");
check("6. publish v2 succeeds", r.code === 0 && r.out.includes("v2"), r.out);

// 7. update --check — sees the version change
r = cli("update", "--check");
check("7. update --check reports v1 → v2", r.code === 0 && r.out.includes("v1 → v2"), r.out);

// 8. update — new version on disk
r = cli("update");
check("8. update applies v2", r.code === 0 && r.out.includes("updated to v2"), r.out);
check("8b. SKILL.md content is now v2", readFileSync(skillMd, "utf8").includes("v2"));

// 9. remove — local uninstall
r = cli("remove", SLUG);
check("9. remove uninstalls locally", r.code === 0 && r.out.includes("removed"), r.out);
check("9b. skill dir deleted", !existsSync(join(CLAUDE, "skills", SLUG)));
r = cli("list");
check("9c. list shows it as not installed (still in catalog)", r.out.includes(SLUG) && r.out.includes("not installed"), r.out);

// 10. unpublish — org-wide archive → gone from the catalog
r = cli("unpublish", SLUG, "--yes");
check("10. unpublish archives the skill", r.code === 0 && r.out.includes("archived"), r.out);
r = cli("list");
check("10b. archived skill no longer listed", r.code === 0 && !r.out.includes(SLUG), r.out);

// ---------------------------------------------------------------- verdict
cleanupServerState();
rmSync(sandbox, { recursive: true, force: true });
console.log(failures === 0 ? "\nALL LIFECYCLE TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
