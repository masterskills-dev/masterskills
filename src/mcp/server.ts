import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api } from "../api/client.js";
import {
  installSkills,
  listSkills,
  preparePublish,
  publishDraft,
  removeSkills,
  reportSync,
} from "../core/skills.js";

/**
 * MasterSkills MCP server — the product's real interface.
 *
 * Seven tools, no more (each extra tool bloats agent context and increases
 * tool-choice errors): whoami, search_skills, install_skills, check_updates,
 * remove_skills, prepare_publish, publish.
 *
 * Two inviolable principles (see cloud/docs/PRODUCT.md §5):
 *   1. The agent never writes to disk without explicit user approval.
 *   2. The agent never publishes without explicit user approval.
 * Tool descriptions instruct the agent to obtain approval; prepare_publish
 * only RETURNS a manifest — publish requires the approved draft id.
 */

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : String(error),
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
        "Show the signed-in MasterSkills user, organization, plan and device status. If this fails with 401, tell the user to run `masterskills login`.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await api("/me"));
      } catch (error) {
        return err(error);
      }
    },
  );

  server.registerTool(
    "search_skills",
    {
      title: "Search skills",
      description:
        "Search the organization's private skill registry. Returns skills the user is entitled to see, including local install state (installedVersion, updateAvailable). Empty query lists everything.",
      inputSchema: { query: z.string().optional() },
    },
    async ({ query }) => {
      try {
        return ok(await listSkills(query));
      } catch (error) {
        return err(error);
      }
    },
  );

  server.registerTool(
    "install_skills",
    {
      title: "Install skills",
      description:
        "Download and install skills from the registry into the local agent's skill directory. ONLY call this after the user explicitly confirmed which skills to install — never install silently, even org-required ones. Installed skills load in NEW agent sessions.",
      inputSchema: { slugs: z.array(z.string()).min(1) },
    },
    async ({ slugs }) => {
      try {
        return ok(await installSkills(slugs));
      } catch (error) {
        return err(error);
      }
    },
  );

  server.registerTool(
    "check_updates",
    {
      title: "Check for updates",
      description:
        "Compare locally installed skills against the registry: version updates, org-required skills that are missing, and skills removed by the organization. Present the diff to the user and ask before applying anything.",
      inputSchema: {},
    },
    async () => {
      try {
        return ok(await reportSync());
      } catch (error) {
        return err(error);
      }
    },
  );

  server.registerTool(
    "remove_skills",
    {
      title: "Remove skills",
      description:
        "Uninstall skills from this machine (files + local state). ONLY call this after the user explicitly confirmed the removal — e.g. cleaning up a skill the organization removed.",
      inputSchema: { slugs: z.array(z.string()).min(1) },
    },
    async ({ slugs }) => {
      try {
        return ok(await removeSkills(slugs));
      } catch (error) {
        return err(error);
      }
    },
  );

  server.registerTool(
    "prepare_publish",
    {
      title: "Prepare a skill for publishing",
      description:
        "Package a local skill folder for publishing: scans for secrets, builds a manifest (files, sizes, target version, auto-excluded secret files) and registers a draft. DOES NOT upload or publish. Show the returned manifest to the user, mention every excludedSecrets entry, and ask for explicit approval before calling publish.",
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      try {
        return ok(await preparePublish(path));
      } catch (error) {
        return err(error);
      }
    },
  );

  server.registerTool(
    "publish",
    {
      title: "Publish an approved draft",
      description:
        "Upload and publish a draft previously returned by prepare_publish. ONLY call this after the user explicitly approved that exact manifest. Fails if files changed since approval.",
      inputSchema: { draftId: z.string() },
    },
    async ({ draftId }) => {
      try {
        return ok(await publishDraft(draftId));
      } catch (error) {
        return err(error);
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
