---
name: masterskills
description: Manage the user's private team/organization AI skills and kits (skill bundles) through the MasterSkills registry CLI. Use whenever the user asks about team skills, company/org skills, private or shared skills, a skill registry, kits, groups or bundles of skills, turning work into a skill, publishing or uploading skills (single or in batch), installing/updating/searching skills across the team, listing local skills, or mentions masterskills or a name like @org/skill-name. Runs the `masterskills` CLI via shell.
---

# MasterSkills — private skill registry

MasterSkills is the user's private skill registry. Skills are named `@org/slug`
(e.g. `@acme/frontend-docs`) and belong to organizations the user is a
member of. All operations go through the `masterskills` CLI — prefer the
`--json` flags and parse the output.

**Kits** (users may also say "group" or "bundle") bundle skills under one
name — e.g. `@acme/ai-team` or `@acme/team-docs`. Publish skills into a
kit and anyone on the team installs the whole bundle with one command. Kits
share the `@org/slug` namespace with skills, so `masterskills add
@acme/ai-team` works whether the name is a skill or a kit. Every active org
member sees every kit; a kit never grants extra access.

## Two rules you must NEVER break

1. **Never install, update or remove skills without the user's explicit
   confirmation in this conversation** — even skills the organization marks as
   required. List what would change and ask first.
2. **Never publish without showing the manifest and getting explicit
   approval.** Publishing is two-phase: `prepare` (shows what WOULD be
   uploaded) → user approves → `publish-draft`. Never skip the approval, never
   use `publish --yes`. For a batch, one approval covering the whole shown
   list is enough — per-skill re-asking is not required.

## Keep the CLI current

The CLI is installed globally (`npm install -g @masterskills/cli`) and checks
for new versions once a day. When any command prints an update notice on
stderr — `Update available: @masterskills/cli x.y.z → …` — tell the user,
and after their OK update BEFORE continuing with the task:

    npm install -g @masterskills/cli

Also try this first when a command fails in a way these instructions do not
explain — the installed CLI may simply be older than this document.

## Commands

| Task | Command |
|---|---|
| Who am I / which orgs | `masterskills whoami` |
| List all registry skills | `masterskills list --json` |
| Search skills | `masterskills search <query> --json` |
| Install skill OR kit (after approval) | `masterskills add @org/slug` |
| Check for updates | `masterskills update --check --json` |
| Apply updates (after approval) | `masterskills update` |
| Remove locally (after approval) | `masterskills remove @org/slug` |
| Prepare a publish | `masterskills prepare <path> --org <org> --slug <slug> --json` |
| Publish approved draft | `masterskills publish-draft <draftId>` |
| Supported agents + their skill dirs | `masterskills agents --json` |
| Re-link skills into agents | `masterskills link [names...] --agents <ids>` |
| List kits | `masterskills kit list --json` |
| Inspect a kit | `masterskills kit info @org/slug --json` |
| Create a kit (after approval) | `masterskills kit create <slug> --org <org> --name "..." --desc "..." --skills @a/b,@c/d --json` |
| Add skills to a kit | `masterskills kit add-skill @org/kit @org/skill` |
| Remove skills from a kit | `masterskills kit remove-skill @org/kit @org/skill` |
| Delete a kit (after approval) | `masterskills kit delete @org/slug` |

## Typical flows

### "Do we have skills for X?"
Run `masterskills search <query> --json`. Report matches with their full
`@org/slug` names, versions and install state (`installedVersion`,
`updateAvailable`). If the user wants some installed, confirm the exact list,
then `masterskills add <name...>`. Tell the user new skills load in NEW agent
sessions (restart required).

### "List my local skills"
Registry skills come from `masterskills list --json` (it includes local
install state). Hand-made local skills live in the agents' skill folders:
run `masterskills agents --json`, collect each `skillsDir`, and list its
subdirectories — every folder with a `SKILL.md` is a local skill. Merge the
two views and mark each entry: installed-from-registry, local-only
(unpublished), or both. Local-only ones are publish candidates.

### "Turn what we just did into a skill and publish it"
The user wants the knowledge from this conversation captured as a skill.

1. **Author it first.** Distill the conversation into a skill folder
   (`./skills/<slug>/` in the project, or a folder the user names):
   - `SKILL.md` with frontmatter `name: <slug>` and a one-paragraph
     `description` that says WHEN to use it, then the instructions as you
     would want a fresh agent to receive them — rules, steps, examples,
     pitfalls you just learned. Add supporting files (`references/*.md`,
     templates) if the material is long.
   - Write it for an agent that has NOT seen this conversation.
2. Show the user the draft content and where you put it; let them correct it.
3. Then the standard publish: `masterskills prepare <folder> --org <org>
   --json` → show the manifest (name, version, files, size, every
   `excludedSecrets` entry) → on approval `masterskills publish-draft
   <draftId>`.
4. If they name a kit ("put it in ai-team"), file it after publishing:
   `masterskills kit add-skill @<org>/ai-team @<org>/<slug>`.

### "Publish these local skills" (batch)
The user names several local skills — e.g. three folders from
`~/.claude/skills`. Do the whole batch in one pass:

1. Resolve each name to a folder (see "List my local skills"). If one is
   missing, say which and continue with the rest only after the user agrees.
2. `masterskills prepare <folder> --org <org> --json` for EACH skill.
3. Show ONE combined summary table: slug, version bump, file count, size,
   and any `excludedSecrets` per skill.
4. Ask once: "Publish all N?" On approval, run `masterskills publish-draft
   <draftId>` for each and report per-skill results (published version, or
   the error).
5. If any prepare fails its secret scan, exclude that skill from the batch,
   show the findings, and publish the clean ones only after the user
   confirms the reduced list.

A publish of a folder inside an agent's global skills dir is "adopted": the
CLI moves it into the MasterSkills store and links it back, so it updates
like any registry skill from now on. Mention this when it happens.

### "Publish this skill to @acme"
1. `masterskills prepare <folder> --org acme --slug <slug> --json`
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

### "Publish this into the ai-team kit"
Same two-phase publish as above — the kit step comes AFTER the approved
publish, never before:

1. `masterskills prepare <folder> --org <org> --json`, show the manifest,
   wait for approval, then `masterskills publish-draft <draftId>`.
2. File it into the kit:
   `masterskills kit add-skill @<org>/ai-team @<org>/<skill-slug>`
3. If that fails because the kit doesn't exist, create it (this is additive
   and safe — the skill is already approved and published):
   `masterskills kit create ai-team --org <org> --skills @<org>/<skill-slug>`
4. Tell the user the kit now installs with `masterskills add @<org>/ai-team`.

(Humans doing this by hand can use the one-shot
`masterskills publish <folder> --org <org> --group ai-team`, which also
creates the kit if missing — as an agent, stay on the prepare/publish-draft
flow so the approval step is explicit.)

### "Bundle these into a kit" / "make a Next.js kit for the team"
A kit is the right answer whenever the user wants several skills to travel
together — an onboarding set, a stack-specific bundle, a team baseline.

1. Work out the contents first. Run `masterskills list --json` (and
   `masterskills search <topic> --json`) and propose a concrete set of
   `@org/slug` names. Skills from `@community` are fair game.
2. Show the user the exact kit you're about to create — target namespace, slug,
   display name, visibility, and the full skill list — and **wait for approval**.
   Default to `private`; only pass `--public` if the user explicitly asks.
3. Create it:
   `masterskills kit create <slug> --org <org> --name "..." --desc "..." --skills @a/b,@c/d --json`
4. Report the result and tell them anyone on the team installs it with
   `masterskills add @org/<slug>`.

If creation fails with `slug_taken`, the name is already used by a skill or
kit in that namespace — suggest a different slug, don't retry blindly.

### "Install the frontend kit"
Just run `masterskills add @org/frontend`. The CLI resolves the name to a skill
or a kit automatically and installs everything inside. Confirm the skill list
with the user first — `masterskills kit info @org/frontend --json` shows exactly
what would be installed.

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
