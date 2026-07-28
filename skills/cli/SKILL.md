---
name: masterskills
description: Manage the user's private team/organization AI skills and groups (kits) through the MasterSkills registry CLI. Use whenever the user asks about team skills, company/org skills, private or shared skills, a skill registry, skill groups, bundles or kits, publishing a skill into a group, installing/updating/searching skills across the team, or mentions masterskills or a name like @org/skill-name. Runs the `masterskills` CLI via shell.
---

# MasterSkills — private skill registry

MasterSkills is the user's private skill registry. Skills are named `@org/slug`
(e.g. `@impark/yayincilik-docs`) and belong to organizations the user is a
member of. All operations go through the `masterskills` CLI — prefer the
`--json` flags and parse the output.

**Groups** (the CLI calls them kits — same thing) bundle skills AND people
under one name — e.g. `@impark/ai-team` or `@impark/impark-docs`. A team adds
its members to a group once in the web panel, publishes skills into it, and
everyone installs the whole bundle with one command. Groups share the
`@org/slug` namespace with skills, so `masterskills add @impark/ai-team` works
whether the name is a skill or a group. A group never grants extra access —
skills the user can't see are skipped. (Group MEMBERS are managed in the web
panel at masterskills.dev, not from this CLI.)

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
| Install skill OR kit (after approval) | `masterskills add @org/slug` |
| Check for updates | `masterskills update --check --json` |
| Apply updates (after approval) | `masterskills update` |
| Remove locally (after approval) | `masterskills remove @org/slug` |
| Prepare a publish | `masterskills prepare <path> --org <org> --slug <slug> --json` |
| Publish approved draft | `masterskills publish-draft <draftId>` |
| Supported agents + link status | `masterskills agents --json` |
| Re-link skills into agents | `masterskills link [names...] --agents <ids>` |
| List groups | `masterskills kit list --json` |
| Inspect a group | `masterskills kit info @org/slug --json` |
| Create a group (after approval) | `masterskills kit create <slug> --org <org> --name "..." --desc "..." --skills @a/b,@c/d --json` |
| Add skills to a group | `masterskills kit add-skill @org/group @org/skill` |
| Remove skills from a group | `masterskills kit remove-skill @org/group @org/skill` |
| Delete a group (after approval) | `masterskills kit delete @org/slug` |

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

### "Publish this into the ai-team group"
Same two-phase publish as above — the group step comes AFTER the approved
publish, never before:

1. `masterskills prepare <folder> --org <org> --json`, show the manifest,
   wait for approval, then `masterskills publish-draft <draftId>`.
2. File it into the group:
   `masterskills kit add-skill @<org>/ai-team @<org>/<skill-slug>`
3. If that fails because the group doesn't exist, create it (this is additive
   and safe — the skill is already approved and published):
   `masterskills kit create ai-team --org <org> --skills @<org>/<skill-slug>`
4. Tell the user the group now installs with `masterskills add @<org>/ai-team`.

(Humans doing this by hand can use the one-shot
`masterskills publish <folder> --org <org> --group ai-team`, which also
creates the group if missing — as an agent, stay on the prepare/publish-draft
flow so the approval step is explicit.)

### "Bundle these into a group" / "make a Next.js group for the team"
A group is the right answer whenever the user wants several skills to travel
together — an onboarding set, a stack-specific bundle, a team baseline.

1. Work out the contents first. Run `masterskills list --json` (and
   `masterskills search <topic> --json`) and propose a concrete set of
   `@org/slug` names. Skills from `@community` are fair game.
2. Show the user the exact group you're about to create — target namespace, slug,
   display name, visibility, and the full skill list — and **wait for approval**.
   Default to `private`; only pass `--public` if the user explicitly asks.
3. Create it:
   `masterskills kit create <slug> --org <org> --name "..." --desc "..." --skills @a/b,@c/d --json`
4. Report the result and tell them anyone on the team installs it with
   `masterskills add @org/<slug>`. Adding PEOPLE to the group happens in the
   web panel (Groups page), not from the CLI.

If creation fails with `slug_taken`, the name is already used by a skill or
group in that namespace — suggest a different slug, don't retry blindly.

### "Install the frontend group"
Just run `masterskills add @org/frontend`. The CLI resolves the name to a skill
or a group automatically and installs everything inside. Confirm the skill list
with the user first — `masterskills kit info @org/frontend --json` shows exactly
what would be installed, including a `hiddenCount` of skills their account can't
access (those are skipped, not an error).

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
