#!/usr/bin/env node
import { Command } from "commander";
import { logoutCommand, whoamiCommand } from "./commands/auth.js";
import { installCommand } from "./commands/install.js";
import { loginCommand } from "./commands/login.js";
import { runMcpServer } from "./mcp/server.js";

const program = new Command();

program
  .name("masterskills")
  .description(
    "Private skill registry for AI coding agents. Install once, log in once — your agent does the rest.",
  )
  .version("0.1.0");

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

program
  .command("mcp", { hidden: true })
  .description("Run the MasterSkills MCP server over stdio (used by agents, not humans)")
  .action(runMcpServer);

program.parseAsync();
