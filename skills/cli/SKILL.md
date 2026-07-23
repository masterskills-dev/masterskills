---
name: masterskills
description: Manage the user's private team/organization AI skills through the MasterSkills registry CLI. Use whenever the user asks about team skills, company/org skills, private or shared skills, a skill registry, publishing/installing/updating/searching skills across the team, or mentions masterskills or a name like @org/skill-name. Runs the `masterskills` CLI via shell.
---

# MasterSkills — private skill registry

MasterSkills is the user's private skill registry. Skills are named `@org/slug`
(e.g. `@impark/yayincilik-docs`). Every user has a personal namespace
(`@username`) and may belong to team organizations. All operations go through
the `masterskills` CLI — prefer the `--json` flags and parse the output.

## Two rules you must NEVER break

1. **Never install, update or remove skills without the user's explicit
   confirmation in this conversation** — even skills the organization marks as
   required. List what would change and ask first.
2. **Never publish without showing the manifest and getting explicit
   approval.** Publishing is two-phase: `prepare` (shows what WOULD be
   uploaded) → user approves → `publish-draft`. Never skip the approval, never
   use `publish --yes`.

## Commands

| Task | Command |
|---|---|
| Who am I / which orgs | `masterskills whoami` |
| List all skills | `masterskills list --json` |
| Search skills | `masterskills search <query> --json` |
| Install (after approval) | `masterskills add @org/slug` |
| Check for updates | `masterskills update --check --json` |
| Apply updates (after approval) | `masterskills update` |
| Remove locally (after approval) | `masterskills remove @org/slug` |
| Prepare a publish | `masterskills prepare <path> --org <org> --slug <slug> --json` |
| Publish approved draft | `masterskills publish-draft <draftId>` |
| Supported agents + link status | `masterskills agents --json` |
| Re-link skills into agents | `masterskills link [names...] --agents <ids>` |

## Typical flows

### "Do we have skills for X?"
Run `masterskills search <query> --json`. Report matches with their full
`@org/slug` names, versions and install state (`installedVersion`,
`updateAvailable`). If the user wants some installed, confirm the exact list,
then `masterskills add <name...>`. Tell the user new skills load in NEW agent
sessions (restart required).

### "Publish this skill to @impark"
1. `masterskills prepare <folder> --org impark --slug <slug> --json`
   - `--slug` defaults to the SKILL.md frontmatter `name`; ask the user if
     unclear. `--public` makes it public — default is private, keep it unless
     the user explicitly asks.
2. Show the user: full name, version, file list, total size, and EVERY entry
   in `excludedSecrets` (files auto-excluded for looking like secrets).
3. Only after the user approves: `masterskills publish-draft <draftId>`.
4. If the output mentions the source folder was "adopted", tell the user their
   hand-made skill now lives in the MasterSkills store and is linked into
   their agents — it updates like any registry skill from now on.
- If prepare fails with secret-scan findings, show them and stop — do not try
  to work around the scan.

### "Any skill updates?"
Run `masterskills update --check --json`. Present the three groups: `updates`
(version bumps), `newRequired` (org requires, not installed), `removed`
(archived by org — suggest `masterskills remove <name>`). Apply only what the
user approves.

## Errors

- "Not signed in or device revoked" → tell the user to run `masterskills login`
  (opens a browser once; you cannot do this for them).
- Names must be the full `@org/slug` form. If the user gives a bare name, find
  the full name via `masterskills list --json` first.
