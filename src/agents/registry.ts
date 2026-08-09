import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Agent registry — ported from skills.sh (vercel-labs/skills src/agents.ts).
 *
 * Every known coding agent is defined here as pure data:
 *   { id, displayName, detectDirs, skillsDir }
 * Detection = any of `detectDirs` exists. Linking always goes through the
 * central store (lib/store.ts), so "supporting" an agent is nothing more than
 * knowing which user-level skills folder it reads.
 *
 * Two families, same as skills.sh:
 *  - Own-dir agents (Claude Code → ~/.claude/skills, Windsurf →
 *    ~/.codeium/windsurf/skills, …) — each gets its own link.
 *  - Universal-dir agents (Cline, Warp, Zed, Kimi, …) — they all read the
 *    shared ~/.agents/skills (or $XDG_CONFIG_HOME/agents/skills) convention.
 *    Callers dedupe by skillsDir so a shared dir is linked exactly once.
 *    The `universal` pseudo-agent covers future tools that adopt the
 *    convention: it is detected whenever ~/.agents exists.
 *
 * Env overrides:
 *  - Agent-native (same ones skills.sh honors): CLAUDE_CONFIG_DIR, CODEX_HOME,
 *    VIBE_HOME, HERMES_HOME, AUTOHAND_HOME, GROK_HOME.
 *  - MASTERSKILLS_AGENT_DIR_<ID> (id uppercased, "-" → "_") redirects one
 *    agent's base dir entirely (detection + skills = <dir>/skills). Legacy
 *    MASTERSKILLS_CLAUDE_DIR / _CODEX_DIR / _CURSOR_DIR still work.
 *  - MASTERSKILLS_AGENTS="id1,id2" restricts the whole registry to those ids —
 *    the e2e harness uses this so tests can never touch real agent dirs.
 */

interface Ctx {
  home: string;
  /** XDG config home (~/.config fallback) — OpenCode/Amp/Goose/Devin/Zed use it. */
  configHome: string;
  cwd: string;
}

interface AgentSpec {
  displayName: string;
  /** Primary config dir. Default skills dir = base + skillsSubdir. */
  base: (ctx: Ctx) => string;
  /** Extra dirs that also count as "installed". */
  alsoDetect?: (ctx: Ctx) => string[];
  /** Skills dir when it is NOT under base (e.g. the shared ~/.agents/skills). */
  skills?: (ctx: Ctx) => string;
  /** Path from base to the skills dir (default "skills"). */
  skillsSubdir?: string;
}

function envDir(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Shared global dir of the `.agents/skills` convention (home flavor). */
function universalSkillsDir(ctx: Ctx): string {
  return join(ctx.home, ".agents", "skills");
}

/** Shared global dir of the `.agents/skills` convention (XDG flavor — Amp, Replit). */
function xdgUniversalSkillsDir(ctx: Ctx): string {
  return join(ctx.configHome, "agents", "skills");
}

/** OpenClaw renamed twice; use whichever config dir actually exists. */
function openClawBase(ctx: Ctx): string {
  for (const dir of [".openclaw", ".clawdbot", ".moltbot"]) {
    if (existsSync(join(ctx.home, dir))) return join(ctx.home, dir);
  }
  return join(ctx.home, ".openclaw");
}

const AGENT_SPECS = {
  adal: { displayName: "AdaL", base: (c) => join(c.home, ".adal") },
  "aider-desk": { displayName: "AiderDesk", base: (c) => join(c.home, ".aider-desk") },
  amp: {
    displayName: "Amp",
    base: (c) => join(c.configHome, "amp"),
    skills: xdgUniversalSkillsDir,
  },
  antigravity: { displayName: "Antigravity", base: (c) => join(c.home, ".gemini", "antigravity") },
  "antigravity-cli": {
    displayName: "Antigravity CLI",
    base: (c) => join(c.home, ".gemini", "antigravity-cli"),
  },
  astrbot: {
    displayName: "AstrBot",
    base: (c) => join(c.home, ".astrbot"),
    alsoDetect: (c) => [join(c.cwd, "data", "skills")],
    skillsSubdir: "data/skills",
  },
  augment: { displayName: "Augment", base: (c) => join(c.home, ".augment") },
  "autohand-code": {
    displayName: "Autohand Code CLI",
    base: (c) => envDir("AUTOHAND_HOME") ?? join(c.home, ".autohand"),
  },
  bob: { displayName: "IBM Bob", base: (c) => join(c.home, ".bob") },
  "claude-code": {
    displayName: "Claude Code",
    base: (c) => envDir("CLAUDE_CONFIG_DIR") ?? join(c.home, ".claude"),
  },
  cline: {
    displayName: "Cline",
    base: (c) => join(c.home, ".cline"),
    skills: universalSkillsDir,
  },
  "codearts-agent": { displayName: "CodeArts Agent", base: (c) => join(c.home, ".codeartsdoer") },
  codebuddy: {
    displayName: "CodeBuddy",
    base: (c) => join(c.home, ".codebuddy"),
    alsoDetect: (c) => [join(c.cwd, ".codebuddy")],
  },
  codemaker: { displayName: "Codemaker", base: (c) => join(c.home, ".codemaker") },
  codestudio: { displayName: "Code Studio", base: (c) => join(c.home, ".codestudio") },
  codex: {
    displayName: "Codex",
    base: (c) => envDir("CODEX_HOME") ?? join(c.home, ".codex"),
    alsoDetect: () => ["/etc/codex"],
  },
  "command-code": { displayName: "Command Code", base: (c) => join(c.home, ".commandcode") },
  continue: {
    displayName: "Continue",
    base: (c) => join(c.home, ".continue"),
    alsoDetect: (c) => [join(c.cwd, ".continue")],
  },
  cortex: { displayName: "Cortex Code", base: (c) => join(c.home, ".snowflake", "cortex") },
  crush: { displayName: "Crush", base: (c) => join(c.home, ".config", "crush") },
  cursor: { displayName: "Cursor", base: (c) => join(c.home, ".cursor") },
  deepagents: {
    displayName: "Deep Agents",
    base: (c) => join(c.home, ".deepagents"),
    skillsSubdir: "agent/skills",
  },
  devin: { displayName: "Devin for Terminal", base: (c) => join(c.configHome, "devin") },
  dexto: {
    displayName: "Dexto",
    base: (c) => join(c.home, ".dexto"),
    skills: universalSkillsDir,
  },
  droid: { displayName: "Droid", base: (c) => join(c.home, ".factory") },
  firebender: { displayName: "Firebender", base: (c) => join(c.home, ".firebender") },
  forgecode: { displayName: "ForgeCode", base: (c) => join(c.home, ".forge") },
  "gemini-cli": { displayName: "Gemini CLI", base: (c) => join(c.home, ".gemini") },
  "github-copilot": { displayName: "GitHub Copilot", base: (c) => join(c.home, ".copilot") },
  goose: { displayName: "Goose", base: (c) => join(c.configHome, "goose") },
  grok: {
    displayName: "Grok Build",
    base: (c) => envDir("GROK_HOME") ?? join(c.home, ".grok"),
  },
  "hermes-agent": {
    displayName: "Hermes Agent",
    base: (c) => envDir("HERMES_HOME") ?? join(c.home, ".hermes"),
  },
  "iflow-cli": { displayName: "iFlow CLI", base: (c) => join(c.home, ".iflow") },
  "inference-sh": { displayName: "inference.sh", base: (c) => join(c.home, ".inferencesh") },
  jazz: {
    displayName: "Jazz",
    base: (c) => join(c.home, ".jazz"),
    alsoDetect: (c) => [join(c.cwd, ".jazz")],
  },
  junie: { displayName: "Junie", base: (c) => join(c.home, ".junie") },
  kilo: { displayName: "Kilo Code", base: (c) => join(c.home, ".kilocode") },
  kimchi: {
    displayName: "Kimchi",
    base: (c) => join(c.home, ".config", "kimchi"),
    skillsSubdir: "harness/skills",
  },
  "kimi-code-cli": {
    displayName: "Kimi Code CLI",
    base: (c) => join(c.home, ".kimi-code"),
    alsoDetect: (c) => [join(c.home, ".kimi")],
    skills: universalSkillsDir,
  },
  "kiro-cli": { displayName: "Kiro CLI", base: (c) => join(c.home, ".kiro") },
  kode: { displayName: "Kode", base: (c) => join(c.home, ".kode") },
  lingma: { displayName: "Lingma", base: (c) => join(c.home, ".lingma") },
  loaf: {
    displayName: "Loaf",
    base: (c) => join(c.home, ".loaf"),
    skills: universalSkillsDir,
  },
  mcpjam: { displayName: "MCPJam", base: (c) => join(c.home, ".mcpjam") },
  "minimax-code": {
    displayName: "MiniMax Code",
    base: (c) => join(c.home, ".minimax"),
    alsoDetect: () => ["/Applications/MiniMax Code.app"],
  },
  "mistral-vibe": {
    displayName: "Mistral Vibe",
    base: (c) => envDir("VIBE_HOME") ?? join(c.home, ".vibe"),
  },
  moxby: { displayName: "Moxby", base: (c) => join(c.home, ".moxby") },
  mux: { displayName: "Mux", base: (c) => join(c.home, ".mux") },
  neovate: { displayName: "Neovate", base: (c) => join(c.home, ".neovate") },
  ona: { displayName: "Ona", base: (c) => join(c.home, ".ona") },
  openclaw: { displayName: "OpenClaw", base: openClawBase },
  opencode: { displayName: "OpenCode", base: (c) => join(c.configHome, "opencode") },
  openhands: { displayName: "OpenHands", base: (c) => join(c.home, ".openhands") },
  pi: { displayName: "Pi", base: (c) => join(c.home, ".pi", "agent") },
  pochi: { displayName: "Pochi", base: (c) => join(c.home, ".pochi") },
  qoder: { displayName: "Qoder", base: (c) => join(c.home, ".qoder") },
  "qoder-cn": { displayName: "Qoder CN", base: (c) => join(c.home, ".qoder-cn") },
  "qwen-code": { displayName: "Qwen Code", base: (c) => join(c.home, ".qwen") },
  reasonix: { displayName: "Reasonix", base: (c) => join(c.home, ".reasonix") },
  replit: {
    displayName: "Replit",
    base: (c) => join(c.cwd, ".replit"),
    skills: xdgUniversalSkillsDir,
  },
  roo: { displayName: "Roo Code", base: (c) => join(c.home, ".roo") },
  rovodev: { displayName: "Rovo Dev", base: (c) => join(c.home, ".rovodev") },
  "tabnine-cli": {
    displayName: "Tabnine CLI",
    base: (c) => join(c.home, ".tabnine"),
    skillsSubdir: "agent/skills",
  },
  terramind: { displayName: "Terramind", base: (c) => join(c.home, ".terramind") },
  tinycloud: { displayName: "Tinycloud", base: (c) => join(c.home, ".tinycloud") },
  trae: { displayName: "Trae", base: (c) => join(c.home, ".trae") },
  "trae-cn": { displayName: "Trae CN", base: (c) => join(c.home, ".trae-cn") },
  universal: { displayName: "Universal (.agents/skills)", base: (c) => join(c.home, ".agents") },
  warp: {
    displayName: "Warp",
    base: (c) => join(c.home, ".warp"),
    skills: universalSkillsDir,
  },
  windsurf: { displayName: "Windsurf", base: (c) => join(c.home, ".codeium", "windsurf") },
  zcode: {
    displayName: "ZCode",
    base: (c) => join(c.home, ".zcode"),
    alsoDetect: () => ["/Applications/ZCode.app"],
  },
  zed: {
    displayName: "Zed",
    base: (c) => join(c.configHome, "zed"),
    alsoDetect: () => {
      const dirs: string[] = [];
      const appData = envDir("APPDATA");
      if (appData) dirs.push(join(appData, "Zed"));
      const flatpak = envDir("FLATPAK_XDG_CONFIG_HOME");
      if (flatpak) dirs.push(join(flatpak, "zed"));
      return dirs;
    },
    skills: universalSkillsDir,
  },
  zencoder: { displayName: "Zencoder", base: (c) => join(c.home, ".zencoder") },
  zenflow: { displayName: "Zenflow", base: (c) => join(c.home, ".zencoder") },
} as const satisfies Record<string, AgentSpec>;

export type AgentId = keyof typeof AGENT_SPECS;

export interface AgentDefinition {
  id: AgentId;
  displayName: string;
  /** Any of these existing means "agent is installed on this machine". */
  detectDirs: string[];
  /** User-level skills dir the agent reads. */
  skillsDir: string;
}

/** Pre-generic override names, kept so existing scripts don't break. */
const LEGACY_DIR_ENV: Partial<Record<AgentId, string>> = {
  "claude-code": "MASTERSKILLS_CLAUDE_DIR",
  codex: "MASTERSKILLS_CODEX_DIR",
  cursor: "MASTERSKILLS_CURSOR_DIR",
};

function overrideDir(id: AgentId): string | undefined {
  const generic = `MASTERSKILLS_AGENT_DIR_${id.toUpperCase().replace(/-/g, "_")}`;
  const legacy = LEGACY_DIR_ENV[id];
  return envDir(generic) ?? (legacy ? envDir(legacy) : undefined);
}

function resolveAgent(id: AgentId, spec: AgentSpec, ctx: Ctx): AgentDefinition {
  const override = overrideDir(id);
  if (override) {
    // Full sandbox redirect: detection AND skills live under the override,
    // regardless of shared-dir conventions — tests never touch real dirs.
    return {
      id,
      displayName: spec.displayName,
      detectDirs: [override],
      skillsDir: join(override, spec.skillsSubdir ?? "skills"),
    };
  }
  const base = spec.base(ctx);
  return {
    id,
    displayName: spec.displayName,
    detectDirs: [base, ...(spec.alsoDetect?.(ctx) ?? [])],
    skillsDir: spec.skills?.(ctx) ?? join(base, spec.skillsSubdir ?? "skills"),
  };
}

/** MASTERSKILLS_AGENTS="claude-code,codex" restricts the registry universe. */
function agentsFilter(): Set<string> | undefined {
  const raw = process.env.MASTERSKILLS_AGENTS?.trim();
  if (!raw) return undefined;
  return new Set(raw.split(",").map((id) => id.trim()).filter(Boolean));
}

export function allAgents(): AgentDefinition[] {
  const ctx: Ctx = {
    home: homedir(),
    configHome: envDir("XDG_CONFIG_HOME") ?? join(homedir(), ".config"),
    cwd: process.cwd(),
  };
  const only = agentsFilter();
  return (Object.entries(AGENT_SPECS) as [AgentId, AgentSpec][])
    .filter(([id]) => !only || only.has(id))
    .map(([id, spec]) => resolveAgent(id, spec, ctx));
}

/** Agents present on this machine — default install targets, never asked. */
export function detectAgents(): AgentDefinition[] {
  return allAgents().filter((agent) => agent.detectDirs.some((dir) => existsSync(dir)));
}

/**
 * Resolves explicit agent ids, or falls back to detected agents.
 * Explicitly named agents do NOT need to be detected — naming one is the
 * user's way of saying "link it anyway" (the skills dir gets created).
 */
export function resolveAgents(ids?: string[]): AgentDefinition[] {
  if (!ids || ids.length === 0) return detectAgents();
  const all = allAgents();
  const unknown = ids.filter((id) => !all.some((agent) => agent.id === id));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown agent(s): ${unknown.join(", ")}. See \`masterskills agents --all\` for supported ids.`,
    );
  }
  const wanted = new Set(ids);
  return all.filter((agent) => wanted.has(agent.id));
}
