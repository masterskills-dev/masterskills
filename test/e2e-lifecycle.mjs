/**
 * MasterSkills CLI lifecycle e2e — exercises the FULL user journey through the
 * real CLI binary against a running server (default http://localhost:3000).
 *
 * Sequence (mirrors the product's core loop):
 *   list → publish v1 → list (verify) → search (hit + miss) → add (store +
 *   links into ALL detected agents) → publish v2 → update --check → update
 *   (v2 propagates through links) → link repair → remove (local uninstall)
 *   → unpublish (org archive) → list (must be gone)
 *
 * Agent model under test: central store at ~/.masterskills/skills/<slug>,
 * junction/symlinked into Claude Code, Codex and Cursor skill dirs (all three
 * faked inside the sandbox via MASTERSKILLS_*_DIR overrides — your real agent
 * dirs are never touched).
 *
 * Auth: MASTERSKILLS_TOKEN env if set; otherwise mints a device token via the
 * local docker postgres (dev convenience).
 *
 * Run: pnpm test:e2e
 */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const AGENT_HOMES = {
  "claude-code": join(sandbox, "claude-home"),
  codex: join(sandbox, "codex-home"),
  cursor: join(sandbox, "cursor-home"),
};
const FIXTURE = join(sandbox, "fixture-skill");
mkdirSync(HOME, { recursive: true });
// Detection = base dir exists, so create all three fake agent homes.
for (const dir of Object.values(AGENT_HOMES)) mkdirSync(dir, { recursive: true });

const agentSkillPath = (agent, ...rest) => join(AGENT_HOMES[agent], "skills", SLUG, ...rest);
const storeSkillPath = (...rest) => join(HOME, "skills", SLUG, ...rest);

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
  MASTERSKILLS_CLAUDE_DIR: AGENT_HOMES["claude-code"],
  MASTERSKILLS_CODEX_DIR: AGENT_HOMES.codex,
  MASTERSKILLS_CURSOR_DIR: AGENT_HOMES.cursor,
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

function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
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

// 0. agents — all three fakes detected
let r = cli("agents");
check("0. agents: all three detected", r.code === 0 && ["claude-code", "codex", "cursor"].every((id) => r.out.includes(`${id}`) && !r.out.includes("not installed")), r.out);

// 1. list — skill absent
r = cli("list");
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

// 5. add — store + links into every detected agent
r = cli("add", SLUG);
check("5. add installs the skill", r.code === 0 && r.out.includes("installed"), r.out);
check("5b. store copy exists", existsSync(storeSkillPath("SKILL.md")) && readFileSync(storeSkillPath("SKILL.md"), "utf8").includes("v1"));
for (const agent of Object.keys(AGENT_HOMES)) {
  check(`5c. ${agent}: skill readable through link`, existsSync(agentSkillPath(agent, "SKILL.md")) && readFileSync(agentSkillPath(agent, "SKILL.md"), "utf8").includes("v1"));
  check(`5d. ${agent}: entry is a symlink/junction (not a copy)`, isLink(join(AGENT_HOMES[agent], "skills", SLUG)));
}
check("5e. excluded secret file NOT distributed", !existsSync(storeSkillPath("config.local.json")));
r = cli("list");
check("5f. list shows installed state", r.out.includes("installed v1"), r.out);

// 6. publish v2
writeFixture(2);
r = cli("publish", FIXTURE, "--yes");
check("6. publish v2 succeeds", r.code === 0 && r.out.includes("v2"), r.out);

// 7. update --check — sees the version change
r = cli("update", "--check");
check("7. update --check reports v1 → v2", r.code === 0 && r.out.includes("v1 → v2"), r.out);

// 8. update — v2 lands in the store and propagates through EVERY link
r = cli("update");
check("8. update applies v2", r.code === 0 && r.out.includes("v2"), r.out);
for (const agent of Object.keys(AGENT_HOMES)) {
  check(`8b. ${agent}: sees v2 through the link`, readFileSync(agentSkillPath(agent, "SKILL.md"), "utf8").includes("v2"));
}

// 9. link repair — user deletes a link by hand, `link` restores it
rmSync(join(AGENT_HOMES.codex, "skills", SLUG), { recursive: true, force: true });
check("9. precondition: codex link deleted", !existsSync(agentSkillPath("codex", "SKILL.md")));
r = cli("link", SLUG, "--agents", "codex");
check("9b. link restores the codex link", r.code === 0 && existsSync(agentSkillPath("codex", "SKILL.md")), r.out);

// 10. remove — local uninstall everywhere
r = cli("remove", SLUG);
check("10. remove uninstalls locally", r.code === 0 && r.out.includes("removed"), r.out);
check("10b. store copy deleted", !existsSync(storeSkillPath()));
for (const agent of Object.keys(AGENT_HOMES)) {
  check(`10c. ${agent}: link removed`, !existsSync(join(AGENT_HOMES[agent], "skills", SLUG)));
}
r = cli("list");
check("10d. list shows it as not installed (still in catalog)", r.out.includes(SLUG) && r.out.includes("not installed"), r.out);

// 11. unpublish — org-wide archive → gone from the catalog
r = cli("unpublish", SLUG, "--yes");
check("11. unpublish archives the skill", r.code === 0 && r.out.includes("archived"), r.out);
r = cli("list");
check("11b. archived skill no longer listed", r.code === 0 && !r.out.includes(SLUG), r.out);

// ---------------------------------------------------------------- verdict
cleanupServerState();
rmSync(sandbox, { recursive: true, force: true });
console.log(failures === 0 ? "\nALL LIFECYCLE TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
