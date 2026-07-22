import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/**
 * MasterSkills MCP server — the product's real interface.
 *
 * Six tools, no more (each extra tool bloats agent context and increases tool-choice errors):
 *   whoami, search_skills, install_skills, check_updates, prepare_publish, publish
 *
 * Two inviolable principles (see cloud/docs/PRODUCT.md §5):
 *   1. The agent never writes to disk without explicit user approval.
 *   2. The agent never publishes without explicit user approval.
 *      → prepare_publish only RETURNS a manifest; publish requires the draft id
 *        from an approved manifest.
 */

function notImplemented(tool: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `${tool}: not implemented yet (scaffold).`,
      },
    ],
    isError: true,
  };
}

export async function runMcpServer(): Promise<void> {
  const server = new McpServer({ name: "masterskills", version: "0.1.0" });

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        "Show the signed-in MasterSkills user, organization, plan and device status.",
      inputSchema: {},
    },
    async () => notImplemented("whoami"),
  );

  server.registerTool(
    "search_skills",
    {
      title: "Search skills",
      description:
        "Search the organization's private skill registry. Returns skills the user is entitled to see, with local install state.",
      inputSchema: { query: z.string().optional() },
    },
    async () => notImplemented("search_skills"),
  );

  server.registerTool(
    "install_skills",
    {
      title: "Install skills",
      description:
        "Install one or more skills from the registry into the local agent's skill directory. Requires explicit user approval before writing to disk.",
      inputSchema: { slugs: z.array(z.string()).min(1) },
    },
    async () => notImplemented("install_skills"),
  );

  server.registerTool(
    "check_updates",
    {
      title: "Check for updates",
      description:
        "Compare locally installed skills against the registry: new versions, newly assigned/required skills, and skills removed by the organization.",
      inputSchema: {},
    },
    async () => notImplemented("check_updates"),
  );

  server.registerTool(
    "prepare_publish",
    {
      title: "Prepare a skill for publishing",
      description:
        "Package a local skill folder for publishing. Scans for secrets, builds a manifest (files, size, target org, visibility, next version) and returns it for user approval. DOES NOT upload or publish anything.",
      inputSchema: { path: z.string() },
    },
    async () => notImplemented("prepare_publish"),
  );

  server.registerTool(
    "publish",
    {
      title: "Publish an approved draft",
      description:
        "Publish a draft previously returned by prepare_publish, after the user explicitly approved its manifest.",
      inputSchema: { draftId: z.string() },
    },
    async () => notImplemented("publish"),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
