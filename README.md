# MasterSkills

> Private skill registry for AI coding agents.
> **Install once. Log in once. Never touch it again.**

MasterSkills lets teams publish, permission and sync private [Agent Skills](https://agentskills.io) across AI coding agents — starting with Claude Code. After a one-time setup, everything happens through your agent in plain language: searching, installing, publishing and updating skills.

```bash
# one-time setup
npx masterskills install   # registers the MasterSkills MCP server with your agent
npx masterskills login     # authorizes this device (opens your browser once)
```

Then just talk to your agent:

> "Do we have any skills for our booking flow?"
> "Install the first two."
> "Publish the skill I wrote in ./skills/content-rules to the team."
> "Any skill updates?"

## How it works

- Your team's skills live in a private registry at [masterskills.dev](https://masterskills.dev).
- This package ships a small CLI and an [MCP](https://modelcontextprotocol.io) server. The MCP server gives your agent six tools: `whoami`, `search_skills`, `install_skills`, `check_updates`, `prepare_publish`, `publish`.
- Two rules the agent can never break: **nothing is written to disk without your approval, and nothing is published without your approval.**

## Commands

| Command | What it does |
|---|---|
| `masterskills install` | Registers the MCP server with your coding agents |
| `masterskills login` | Authorizes this device (one browser round-trip) |
| `masterskills whoami` | Shows signed-in user, organization and plan |
| `masterskills logout` | Removes this device's credentials |

## Status

Early development. Claude Code is the first supported agent; Codex, Cursor and Gemini CLI are next.

## License

MIT — this CLI is open source. The registry service at masterskills.dev is a hosted product.
