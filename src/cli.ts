#!/usr/bin/env node
import { Command } from "commander";
import { logoutCommand, whoamiCommand } from "./commands/auth.js";
import { installCommand } from "./commands/install.js";
import { loginCommand } from "./commands/login.js";
import {
  addCommand,
  listCommand,
  publishCommand,
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
  .description("List your organization's skills (optionally filtered)")
  .action(listCommand);

program
  .command("search <query>")
  .description("Search your organization's skills")
  .action(listCommand);

program
  .command("add <slugs...>")
  .description("Install skills from the registry into your agents")
  .action(addCommand);

program
  .command("update [slugs...]")
  .description("Update installed skills to their latest versions")
  .option("--check", "Only show what would change")
  .action(updateCommand);

program
  .command("remove <slugs...>")
  .description("Uninstall skills from this machine")
  .action(removeCommand);

program
  .command("publish [path]")
  .description("Publish a skill folder to your organization's registry")
  .option("--slug <slug>", "Registry slug (default: SKILL.md frontmatter name)")
  .option("--name <name>", "Display name")
  .option("--desc <description>", "Description")
  .option("-y, --yes", "Skip the confirmation prompt")
  .action(publishCommand);

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
  .command("mcp", { hidden: true })
  .description("Run the MasterSkills MCP server over stdio (used by agents, not humans)")
  .action(runMcpServer);

program.parseAsync();
