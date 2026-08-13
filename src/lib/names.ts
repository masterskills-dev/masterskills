/**
 * Skill naming: the full name is ALWAYS "@org/slug" (npm-style).
 * The @org part is a real namespace (team org or a user's personal org) —
 * users never invent it, they belong to it.
 */

export interface SkillName {
  org: string;
  slug: string;
}

const NAME_REGEX = /^@?([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)$/;
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

export function parseSkillName(input: string, defaultOrg?: string): SkillName {
  const match = input.trim().match(NAME_REGEX);
  if (match) return { org: match[1]!, slug: match[2]! };
  if (SLUG_REGEX.test(input.trim()) && defaultOrg) {
    return { org: defaultOrg.replace(/^@/, ""), slug: input.trim() };
  }
  throw new Error(
    `"${input}" is not a valid skill name — use the full form @org/slug (e.g. @acme/frontend-docs)`,
  );
}

export function formatSkillName(name: SkillName): string {
  return `@${name.org}/${name.slug}`;
}

/**
 * Agent skill dirs are flat (one folder level), so links flatten the
 * namespace: "@acme/docs" → "acme--docs". Double dash avoids ambiguity
 * with dashes inside org/slug.
 */
export function linkFolderName(name: SkillName): string {
  return `${name.org}--${name.slug}`;
}
