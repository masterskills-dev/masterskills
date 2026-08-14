# MasterSkills

> Private skill registry for AI coding agents.
> **Install once. Log in once. Never touch it again.**

MasterSkills lets teams publish, permission and sync private [Agent Skills](https://agentskills.io) across AI coding agents — Claude Code, Codex, Cursor, Gemini CLI and 70+ others (the full [skills.sh](https://skills.sh) agent set). Skills live once in a central store and are linked into every detected agent. After a one-time setup, everything happens through your agent in plain language: searching, installing, publishing and updating skills.

```bash
# one-time setup
npm install -g @masterskills/cli
masterskills install   # teaches every detected coding agent to use MasterSkills
masterskills login     # authorizes this device (opens your browser once)
```

The CLI checks for new versions once a day and prints a notice when one is
available — update any time with `npm install -g @masterskills/cli`.

Then just talk to your agent:

> "Do we have any skills for our booking flow?"
> "Install the first two."
> "Publish the skill I wrote in ./skills/content-rules to the team."
> "Publish it into the ai-team group."
> "Any skill updates?"

## How it works

- Your team's skills live in a private registry at [masterskills.dev](https://masterskills.dev).
- **Kits** bundle skills under one name — publish into `@acme/ai-team`, and the whole team installs the bundle with `masterskills add @acme/ai-team`. (`masterskills publish --group ai-team` files a skill into a kit as it publishes.)
- This package ships a small CLI and an [MCP](https://modelcontextprotocol.io) server. The MCP server gives your agent six tools: `whoami`, `search_skills`, `install_skills`, `check_updates`, `prepare_publish`, `publish`.
- Two rules the agent can never break: **nothing is written to disk without your approval, and nothing is published without your approval.**

## Commands

| Command | What it does |
|---|---|
| `masterskills install` | Teaches every detected coding agent to use MasterSkills |
| `masterskills login` | Authorizes this device (one browser round-trip) |
| `masterskills whoami` | Shows signed-in user, organization and plan |
| `masterskills logout` | Removes this device's credentials |

## Status

Early development. All coding agents in the registry are supported for skill installs (see `masterskills agents --all`); agents are auto-detected and the shared `.agents/skills` convention is covered by the `universal` target.

## License

MIT — this CLI is open source. The registry service at masterskills.dev is a hosted product.
