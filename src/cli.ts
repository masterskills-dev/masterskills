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
import { runMcpServer } from "./mcp/server.js";

const program = new Command();

program
  .name("masterskills")
  .description(
    "Private skill registry for AI coding agents. Install once, log in once — your agent does the rest.",
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
  .command("add <slugs...>")
  .description("Install skills from the registry into your agents")
  .action(addCommand);

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
  .option("--org <org>", "Target namespace, e.g. @impark (default: your personal @username)")
  .option("--slug <slug>", "Registry slug (default: SKILL.md frontmatter name)")
  .option("--name <name>", "Display name")
  .option("--desc <description>", "Description")
  .option("--public", "Make the skill public (default: private)")
  .option("-y, --yes", "Skip the confirmation prompt")
  .action(publishCommand);

program
  .command("prepare [path]")
  .description("Build a publish draft WITHOUT uploading (agent flow: show manifest, get approval)")
  .option("--org <org>", "Target namespace, e.g. @impark (default: your personal @username)")
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
  .option("--json", "Machine-readable output")
  .action(agentsCommand);

program
  .command("link [names...]")
  .description("Link installed skills into agent skill directories (default: all skills, all detected agents)")
  .option("--agents <ids>", "Comma-separated agent ids (claude-code,codex,cursor)")
  .action(linkCommand);

program
  .command("mcp", { hidden: true })
  .description("Run the MasterSkills MCP server over stdio (used by agents, not humans)")
  .action(runMcpServer);

program.parseAsync();
