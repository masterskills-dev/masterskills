#!/usr/bin/env node
import { Command } from "commander";
import { logoutCommand, whoamiCommand } from "./commands/auth.js";
import { installCommand } from "./commands/install.js";
import { loginCommand } from "./commands/login.js";
import {
  addCommand,
  agentsCommand,
  linkCommand,
  listCommand,
  prepareCommand,
  publishCommand,
  publishDraftCommand,
  removeCommand,
  syncCommand,
  unpublishCommand,
  updateCommand,
} from "./commands/skills.js";
import {
  kitAddSkillCommand,
  kitCreateCommand,
  kitDeleteCommand,
  kitInfoCommand,
  kitListCommand,
  kitRemoveSkillCommand,
} from "./commands/kits.js";
import { runMcpServer } from "./mcp/server.js";

const program = new Command();

program
  .name("masterskills")
  .description(
    "Private skill registry for AI coding agents. Install once, log in once â€” your agent does the rest.",
  )
  .version("0.1.0");

// --- one-time setup ---------------------------------------------------------

program
  .command("install")
  .description("Set up MasterSkills for your coding agents (registers the MCP server)")
  .action(installCommand);

program
  .command("login")
  .description("Authorize this device (opens your browser once)")
  .option("--api-url <url>", "MasterSkills server URL (self-hosted or dev)")
  .option("--no-open", "Don't open the browser automatically")
  .action(loginCommand);

program
  .command("logout")
  .description("Remove this device's credentials")
  .action(logoutCommand);

program
  .command("whoami")
  .description("Show the signed-in user, organization and plan")
  .action(whoamiCommand);

// --- skill management (also exposed to agents via MCP) ----------------------

program
  .command("list [query]")
  .description("List skills across your organizations (optionally filtered)")
  .option("--json", "Machine-readable output")
  .action(listCommand);

program
  .command("search <query>")
  .description("Search skills across your organizations")
  .option("--json", "Machine-readable output")
  .action(listCommand);

program
  .command("add <names...>")
  .description("Install skills or kits from the registry into your agents")
  .action(addCommand);

// --- kits: named bundles of skills, installed with one `add` ---------------

const kit = program
  .command("kit")
  .description("Create and manage kits â€” named bundles of skills");

kit
  .command("list")
  .description("List kits in your organizations")
  .option("--json", "Machine-readable output")
  .action(kitListCommand);

kit
  .command("info <name>")
  .description("Show a kit and the skills inside it")
  .option("--json", "Machine-readable output")
  .action(kitInfoCommand);

kit
  .command("create <slug>")
  .description("Create a group/kit from a list of skills")
  .option("--org <org>", "Target namespace, e.g. @acme (default: your device's organization)")
  .option("--name <name>", "Display name")
  .option("--desc <description>", "Description")
  .option("--skills <names>", "Comma-separated skill names, e.g. @acme/a,@community/b")
  .option("--public", "Make the kit public (default: private)")
  .option("--json", "Machine-readable output")
  .action(kitCreateCommand);

kit
  .command("add-skill <kit> <skills...>")
  .description("Add skills to an existing kit")
  .action(kitAddSkillCommand);

kit
  .command("remove-skill <kit> <skills...>")
  .description("Remove skills from a kit")
  .action(kitRemoveSkillCommand);

kit
  .command("delete <name>")
  .description("Delete a kit (the skills inside are untouched)")
  .option("-y, --yes", "Skip the confirmation prompt")
  .action(kitDeleteCommand);

program
  .command("update [names...]")
  .description("Update installed skills to their latest versions")
  .option("--check", "Only show what would change")
  .option("--json", "Machine-readable output (with --check)")
  .action(updateCommand);

program
  .command("remove <slugs...>")
  .description("Uninstall skills from this machine")
  .action(removeCommand);

program
  .command("publish [path]")
  .description("Publish a skill folder (interactive: shows the manifest, asks, publishes)")
  .option("--org <org>", "Target namespace, e.g. @acme (default: your organization)")
  .option("--slug <slug>", "Registry slug (default: SKILL.md frontmatter name)")
  .option("--name <name>", "Display name")
  .option("--desc <description>", "Description")
  .option("--public", "Make the skill public (default: private)")
  .option("--group <group>", "Add the published skill to this group (created if missing)")
  .option("--kit <group>", "Alias of --group")
  .option("-y, --yes", "Skip the confirmation prompt")
  .action(publishCommand);

program
  .command("prepare [path]")
  .description("Build a publish draft WITHOUT uploading (agent flow: show manifest, get approval)")
  .option("--org <org>", "Target namespace, e.g. @acme (default: your organization)")
  .option("--slug <slug>", "Registry slug (default: SKILL.md frontmatter name)")
  .option("--name <name>", "Display name")
  .option("--desc <description>", "Description")
  .option("--public", "Make the skill public (default: private)")
  .option("--json", "Machine-readable output")
  .action(prepareCommand);

program
  .command("publish-draft <draftId>")
  .description("Upload and publish a previously prepared (and approved) draft")
  .action(publishDraftCommand);

program
  .command("unpublish <slug>")
  .description("Archive a skill for the whole organization")
  .option("-y, --yes", "Skip the confirmation prompt")
  .action(unpublishCommand);

program
  .command("sync")
  .description("Report installed skills and fetch pending changes")
  .action(syncCommand);

program
  .command("agents")
  .description("Show supported agents, detection status and linked skills")
  .option("--all", "List every supported agent, not just the detected ones")
  .option("--json", "Machine-readable output")
  .action(agentsCommand);

program
  .command("link [names...]")
  .description("Link installed skills into agent skill directories (default: all skills, all detected agents)")
  .option("--agents <ids>", "Comma-separated agent ids, e.g. claude-code,codex â€” see `masterskills agents --all`")
  .action(linkCommand);

program
  .command("mcp", { hidden: true })
  .description("Run the MasterSkills MCP server over stdio (used by agents, not humans)")
  .action(runMcpServer);

program.parseAsync();
