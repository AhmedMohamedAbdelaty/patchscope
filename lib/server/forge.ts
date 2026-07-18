import { readBoundedText, ResponseTooLargeError } from "./bounded-response.ts";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;

export type ForgeProvider = "gitlab" | "forgejo" | "gitea";
export type ForgeChangeKind = "commit" | "pull" | "compare";

export interface ForgeChange {
  provider: ForgeProvider;
  kind: ForgeChangeKind;
  owner: string;
  repo: string;
  reference: string;
  webUrl: string;
  fetchUrl: string;
  format: "diff" | "gitlab-compare";
  label: string;
}

export interface ForgeDiffResult {
  diff: string;
  source: ForgeChange;
  cache: "hit" | "miss" | "revalidated";
}

interface CacheEntry {
  diff: string;
  etag?: string;
  expiresAt: number;
}

export class ForgeImportError extends Error {
  constructor(
    public readonly code:
      | "INVALID_URL"
      | "NOT_FOUND"
      | "RATE_LIMITED"
      | "TOO_LARGE"
      | "EMPTY_DIFF"
      | "UPSTREAM",
    message: string,
    public readonly status: number,
    public readonly retryAfter?: string,
  ) {
    super(message);
    this.name = "ForgeImportError";
  }
}

const cache = new Map<string, CacheEntry>();

export function parseForgeUrl(input: string): ForgeChange {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw invalidUrl();
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw invalidUrl();
  }
  const host = url.hostname.toLowerCase();
  if (host === "gitlab.com") return parseGitLab(url);
  if (host === "codeberg.org") return parseGiteaFamily(url, "forgejo");
  if (host === "gitea.com") return parseGiteaFamily(url, "gitea");
  throw invalidUrl();
}

export async function fetchForgeDiff(
  input: string,
  options: { fetcher?: typeof fetch; now?: number } = {},
): Promise<ForgeDiffResult> {
  const source = parseForgeUrl(input);
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now();
  const cached = cache.get(source.fetchUrl);
  if (cached && cached.expiresAt > now) {
    return { diff: cached.diff, source, cache: "hit" };
  }
  const headers = new Headers({
    Accept: source.format === "gitlab-compare"
      ? "application/json"
      : "text/plain, text/x-diff",
    "User-Agent": "patchscope-deno",
  });
  if (cached?.etag) headers.set("If-None-Match", cached.etag);

  let response: Response;
  try {
    response = await fetcher(source.fetchUrl, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ForgeImportError(
      "UPSTREAM",
      `${
        providerName(source.provider)
      } did not respond in time. Try again shortly.`,
      502,
    );
  }
  if (response.status === 304 && cached) {
    cached.expiresAt = now + CACHE_TTL_MS;
    return { diff: cached.diff, source, cache: "revalidated" };
  }
  if (response.status === 404) {
    throw new ForgeImportError(
      "NOT_FOUND",
      `That public ${providerName(source.provider)} change was not found.`,
      404,
    );
  }
  if (response.status === 403 || response.status === 429) {
    throw new ForgeImportError(
      "RATE_LIMITED",
      `${providerName(source.provider)} is temporarily refusing public reads.`,
      429,
      response.headers.get("retry-after") ?? undefined,
    );
  }
  if (response.status >= 300 && response.status < 400) {
    throw new ForgeImportError(
      "UPSTREAM",
      `${
        providerName(source.provider)
      } requires another page or sign-in for this change.`,
      422,
    );
  }
  if (!response.ok) {
    throw new ForgeImportError(
      "UPSTREAM",
      `${
        providerName(source.provider)
      } returned ${response.status} while loading this change.`,
      502,
    );
  }
  let body: string;
  try {
    body = await readBoundedText(response);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      throw new ForgeImportError(
        "TOO_LARGE",
        "This provider diff is larger than the 5 MiB import limit.",
        413,
      );
    }
    throw error;
  }
  const diff = source.format === "gitlab-compare"
    ? readGitLabCompare(body)
    : body;
  if (!diff.trim()) {
    throw new ForgeImportError(
      "EMPTY_DIFF",
      `${
        providerName(source.provider)
      } returned no textual changes for this URL.`,
      422,
    );
  }
  if (!/(^|\n)diff --git /.test(diff)) {
    throw new ForgeImportError(
      "EMPTY_DIFF",
      `${providerName(source.provider)} did not return a unified Git diff.`,
      422,
    );
  }
  putCache(source.fetchUrl, {
    diff,
    etag: response.headers.get("etag") ?? undefined,
    expiresAt: now + CACHE_TTL_MS,
  });
  return { diff, source, cache: "miss" };
}

export function resetForgeCache(): void {
  cache.clear();
}

function parseGitLab(url: URL): ForgeChange {
  const segments = decodeSegments(url);
  const divider = segments.indexOf("-");
  if (divider < 2 || divider > 20) throw invalidUrl();
  const project = segments.slice(0, divider);
  project.forEach(assertSegment);
  const action = segments[divider + 1];
  const rest = segments.slice(divider + 2);
  const owner = project.slice(0, -1).join("/");
  const repo = project.at(-1)!;
  const projectPath = project.map(encodeURIComponent).join("/");
  if (action === "commit" && rest.length === 1) {
    assertReference(rest[0]);
    const path = `/${projectPath}/-/commit/${encodeURIComponent(rest[0])}`;
    return forgeChange(
      "gitlab",
      "commit",
      owner,
      repo,
      rest[0],
      path,
      `${path}.diff`,
    );
  }
  if (
    action === "merge_requests" && rest.length >= 1 && /^\d+$/.test(rest[0]) &&
    rest.slice(1).every((part) =>
      ["diffs", "commits", "pipelines"].includes(part)
    )
  ) {
    const path = `/${projectPath}/-/merge_requests/${rest[0]}`;
    return forgeChange(
      "gitlab",
      "pull",
      owner,
      repo,
      rest[0],
      path,
      `${path}.diff`,
    );
  }
  if (action === "compare" && rest.length === 1) {
    const reference = normalizeCompare(rest[0]);
    const path = `/${projectPath}/-/compare/${encodeURIComponent(reference)}`;
    const [base, head] = reference.split("...");
    const projectId = encodeURIComponent(project.join("/"));
    const api = `/api/v4/projects/${projectId}/repository/compare?from=${
      encodeURIComponent(base)
    }&to=${encodeURIComponent(head)}`;
    return forgeChange(
      "gitlab",
      "compare",
      owner,
      repo,
      reference,
      path,
      api,
      "https://gitlab.com",
      "gitlab-compare",
    );
  }
  throw invalidUrl();
}

function parseGiteaFamily(
  url: URL,
  provider: "forgejo" | "gitea",
): ForgeChange {
  const [owner, repo, action, ...rest] = decodeSegments(url);
  assertSegment(owner);
  assertSegment(repo);
  const origin = `https://${url.hostname.toLowerCase()}`;
  if (action === "commit" && rest.length === 1) {
    assertReference(rest[0]);
    const path = `/${encodeURIComponent(owner)}/${
      encodeURIComponent(repo)
    }/commit/${encodeURIComponent(rest[0])}`;
    const fetchPath = `/api/v1/repos/${encodeURIComponent(owner)}/${
      encodeURIComponent(repo)
    }/git/commits/${encodeURIComponent(rest[0])}.diff`;
    return forgeChange(
      provider,
      "commit",
      owner,
      repo,
      rest[0],
      path,
      fetchPath,
      origin,
    );
  }
  if (action === "pulls" && rest.length === 1 && /^\d+$/.test(rest[0])) {
    const path = `/${encodeURIComponent(owner)}/${
      encodeURIComponent(repo)
    }/pulls/${rest[0]}`;
    return forgeChange(
      provider,
      "pull",
      owner,
      repo,
      rest[0],
      path,
      `${path}.diff`,
      origin,
    );
  }
  if (action === "compare" && rest.length === 1) {
    const reference = normalizeCompare(rest[0]);
    const path = `/${encodeURIComponent(owner)}/${
      encodeURIComponent(repo)
    }/compare/${encodeURIComponent(reference)}`;
    return forgeChange(
      provider,
      "compare",
      owner,
      repo,
      reference,
      path,
      `${path}.diff`,
      origin,
    );
  }
  throw invalidUrl();
}

function forgeChange(
  provider: ForgeProvider,
  kind: ForgeChangeKind,
  owner: string,
  repo: string,
  reference: string,
  webPath: string,
  fetchPath: string,
  origin = "https://gitlab.com",
  format: ForgeChange["format"] = "diff",
): ForgeChange {
  const noun = kind === "pull"
    ? `${provider === "gitlab" ? "MR" : "PR"} #${reference}`
    : kind === "commit"
    ? `commit ${reference.slice(0, 8)}`
    : `compare ${reference}`;
  return {
    provider,
    kind,
    owner,
    repo,
    reference,
    webUrl: `${origin}${webPath}`,
    fetchUrl: `${origin}${fetchPath}`,
    format,
    label: `${owner}/${repo} · ${noun}`,
  };
}

function readGitLabCompare(raw: string): string {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw upstreamCompare();
  }
  if (
    !isRecord(value) || !Array.isArray(value.diffs) ||
    value.compare_timeout === true
  ) {
    throw upstreamCompare();
  }
  return value.diffs.map((entry) => {
    if (
      !isRecord(entry) || typeof entry.old_path !== "string" ||
      typeof entry.new_path !== "string" || typeof entry.diff !== "string" ||
      typeof entry.new_file !== "boolean" ||
      typeof entry.deleted_file !== "boolean"
    ) {
      throw upstreamCompare();
    }
    const oldPath = safeProviderPath(entry.old_path);
    const newPath = safeProviderPath(entry.new_path);
    return [
      `diff --git ${diffPath("a", oldPath)} ${diffPath("b", newPath)}`,
      `--- ${entry.new_file ? "/dev/null" : diffPath("a", oldPath)}`,
      `+++ ${entry.deleted_file ? "/dev/null" : diffPath("b", newPath)}`,
      entry.diff.trimEnd(),
    ].join("\n");
  }).join("\n");
}

function safeProviderPath(value: string): string {
  if (!value || /[\0\r\n]/.test(value)) throw upstreamCompare();
  return value;
}

function diffPath(prefix: "a" | "b", path: string): string {
  const value = `${prefix}/${path}`;
  return /[\s"\\]/.test(value) ? JSON.stringify(value) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function upstreamCompare(): ForgeImportError {
  return new ForgeImportError(
    "UPSTREAM",
    "GitLab returned an incomplete compare response.",
    502,
  );
}

function decodeSegments(url: URL): string[] {
  try {
    return url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    throw invalidUrl();
  }
}

function assertSegment(value: string | undefined): asserts value is string {
  if (
    !value || !/^[A-Za-z0-9_.-]{1,100}$/.test(value) || value === "." ||
    value === ".."
  ) {
    throw invalidUrl();
  }
}

function assertReference(value: string): void {
  if (!value || value.length > 250 || /[\s?#\\]/.test(value)) {
    throw invalidUrl();
  }
}

function normalizeCompare(value: string): string {
  const separator = value.includes("...")
    ? "..."
    : value.includes("..")
    ? ".."
    : "";
  if (!separator) throw invalidUrl();
  const [base, head] = value.split(separator);
  assertReference(base);
  assertReference(head);
  return `${base}...${head}`;
}

function invalidUrl(): ForgeImportError {
  return new ForgeImportError(
    "INVALID_URL",
    "Use a public GitLab.com, Codeberg, or Gitea.com commit, pull request, or compare URL.",
    400,
  );
}

function providerName(provider: ForgeProvider): string {
  if (provider === "gitlab") return "GitLab";
  if (provider === "forgejo") return "Codeberg";
  return "Gitea";
}

function putCache(key: string, entry: CacheEntry): void {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}
