export const MAX_TEAM_RULES = 50;

export interface ReviewerProfile {
  name: string;
  handle: string;
}

export interface TeamRule {
  id: string;
  pattern: string;
  owner: string;
  note: string;
}

export const DEFAULT_TEAM_RULES: TeamRule[] = [
  {
    id: "auth",
    pattern: "src/auth/",
    owner: "security",
    note: "Threat model and access boundary",
  },
  {
    id: "data",
    pattern: "migrations/",
    owner: "data",
    note: "Rollback and compatibility",
  },
  {
    id: "tests",
    pattern: "*.test.ts",
    owner: "quality",
    note: "Failure path and assertion quality",
  },
];

export function matchingTeamRules(
  path: string,
  rules: readonly TeamRule[],
): TeamRule[] {
  return rules.filter((rule) => matchesPattern(path, rule.pattern));
}

export function validateProfile(value: unknown): ReviewerProfile {
  if (!isRecord(value)) throw new Error("Reviewer profile is invalid.");
  return {
    name: readText(value.name, "Reviewer name", 80),
    handle: readText(value.handle, "Reviewer handle", 80),
  };
}

export function validateTeamRules(value: unknown): TeamRule[] {
  if (!Array.isArray(value) || value.length > MAX_TEAM_RULES) {
    throw new Error(
      `A handoff can contain at most ${MAX_TEAM_RULES} team rules.`,
    );
  }
  const ids = new Set<string>();
  return value.map((candidate) => {
    if (!isRecord(candidate)) throw new Error("Team rule is invalid.");
    const rule: TeamRule = {
      id: readText(candidate.id, "Rule ID", 100),
      pattern: readPattern(candidate.pattern),
      owner: readText(candidate.owner, "Rule owner", 80),
      note: readText(candidate.note, "Rule note", 240),
    };
    if (ids.has(rule.id)) throw new Error("Team rule IDs must be unique.");
    ids.add(rule.id);
    return rule;
  });
}

function matchesPattern(path: string, rawPattern: string): boolean {
  const pattern = rawPattern.startsWith("/") ? rawPattern.slice(1) : rawPattern;
  if (pattern === "*") return true;
  if (pattern.startsWith("*.") && !pattern.slice(2).includes("*")) {
    return path.endsWith(pattern.slice(1));
  }
  if (pattern.endsWith("/") && !pattern.slice(0, -1).includes("*")) {
    return path.startsWith(pattern);
  }
  return !pattern.includes("*") && path === pattern;
}

function readPattern(value: unknown): string {
  const pattern = readText(value, "Rule pattern", 240);
  const stars = [...pattern].filter((character) => character === "*").length;
  if (
    pattern.includes("..") || pattern.includes("\\") ||
    (stars && pattern !== "*" && !pattern.startsWith("*.")) || stars > 1
  ) {
    throw new Error(
      "Use an exact path, a directory ending in /, an extension like *.ts, or *.",
    );
  }
  return pattern;
}

function readText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(
      `${label} is required and must be at most ${max} characters.`,
    );
  }
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
