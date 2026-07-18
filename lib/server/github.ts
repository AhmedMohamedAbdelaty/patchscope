const GITHUB_HOST = "github.com";
const API_ROOT = "https://api.github.com";
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;

export type GitHubChangeKind = "commit" | "pull" | "compare";

export interface GitHubChange {
  kind: GitHubChangeKind;
  owner: string;
  repo: string;
  reference: string;
  webUrl: string;
  apiUrl: string;
  label: string;
}

export interface GitHubDiffResult {
  diff: string;
  source: GitHubChange;
  cache: "hit" | "miss" | "revalidated";
}

interface CacheEntry {
  diff: string;
  etag?: string;
  expiresAt: number;
}

export class GitHubImportError extends Error {
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
    this.name = "GitHubImportError";
  }
}

const cache = new Map<string, CacheEntry>();

export function parseGitHubUrl(input: string): GitHubChange {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw invalidUrl();
  }
  if (
    url.protocol !== "https:" || url.hostname.toLowerCase() !== GITHUB_HOST ||
    url.username || url.password
  ) {
    throw invalidUrl();
  }

  const segments = url.pathname.split("/").filter(Boolean).map(safeDecode);
  if (segments.length < 4) throw invalidUrl();
  const [owner, repo, action, ...rest] = segments;
  assertSegment(owner);
  assertSegment(repo);

  if (action === "commit" && rest.length === 1) {
    const sha = rest[0];
    assertReference(sha);
    return change(
      "commit",
      owner,
      repo,
      sha,
      url,
      `/repos/${encodeURIComponent(owner)}/${
        encodeURIComponent(repo)
      }/commits/${encodeURIComponent(sha)}`,
    );
  }
  if (
    action === "pull" &&
    rest.length >= 1 &&
    /^\d+$/.test(rest[0]) &&
    rest.slice(1).every((segment) =>
      ["files", "commits", "checks"].includes(segment)
    )
  ) {
    const number = rest[0];
    return change(
      "pull",
      owner,
      repo,
      number,
      url,
      `/repos/${encodeURIComponent(owner)}/${
        encodeURIComponent(repo)
      }/pulls/${number}`,
    );
  }
  if (action === "compare" && rest.length >= 1) {
    const reference = rest.join("/");
    const separator = reference.includes("...")
      ? "..."
      : reference.includes("..")
      ? ".."
      : "";
    if (!separator) throw invalidUrl();
    const [base, head] = reference.split(separator);
    assertReference(base);
    assertReference(head);
    const normalized = `${base}...${head}`;
    return change(
      "compare",
      owner,
      repo,
      normalized,
      url,
      `/repos/${encodeURIComponent(owner)}/${
        encodeURIComponent(repo)
      }/compare/${encodeURIComponent(normalized)}`,
    );
  }
  throw invalidUrl();
}

export async function fetchGitHubDiff(
  input: string,
  options: {
    fetcher?: typeof fetch;
    token?: string;
    now?: number;
  } = {},
): Promise<GitHubDiffResult> {
  const source = parseGitHubUrl(input);
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now();
  const cached = cache.get(source.apiUrl);
  if (cached && cached.expiresAt > now) {
    return { diff: cached.diff, source, cache: "hit" };
  }

  const headers = new Headers({
    Accept: "application/vnd.github.diff",
    "User-Agent": "patchscope-deno",
    "X-GitHub-Api-Version": "2022-11-28",
  });
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (cached?.etag) headers.set("If-None-Match", cached.etag);

  let response: Response;
  try {
    response = await fetcher(`${API_ROOT}${source.apiUrl}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GitHubImportError(
      "UPSTREAM",
      "GitHub did not respond in time. Try again shortly.",
      502,
    );
  }

  if (response.status === 304 && cached) {
    cached.expiresAt = now + CACHE_TTL_MS;
    return { diff: cached.diff, source, cache: "revalidated" };
  }
  if (response.status === 404) {
    throw new GitHubImportError(
      "NOT_FOUND",
      "That public GitHub change was not found.",
      404,
    );
  }
  if (response.status === 403 || response.status === 429) {
    const reset = response.headers.get("x-ratelimit-reset");
    const retryAfter = response.headers.get("retry-after") ??
      (reset ? secondsUntil(reset, now) : undefined);
    throw new GitHubImportError(
      "RATE_LIMITED",
      "GitHub's public request limit is temporarily exhausted.",
      429,
      retryAfter,
    );
  }
  if (!response.ok) {
    throw new GitHubImportError(
      "UPSTREAM",
      `GitHub returned ${response.status} while loading this change.`,
      502,
    );
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw tooLarge();
  const diff = await readBoundedText(response, MAX_RESPONSE_BYTES);
  if (!diff.trim()) {
    throw new GitHubImportError(
      "EMPTY_DIFF",
      "GitHub returned no textual changes for this URL.",
      422,
    );
  }

  putCache(source.apiUrl, {
    diff,
    etag: response.headers.get("etag") ?? undefined,
    expiresAt: now + CACHE_TTL_MS,
  });
  return { diff, source, cache: "miss" };
}

export function resetGitHubCache(): void {
  cache.clear();
}

function change(
  kind: GitHubChangeKind,
  owner: string,
  repo: string,
  reference: string,
  web: URL,
  path: string,
): GitHubChange {
  const webUrl = new URL(web.pathname, "https://github.com").toString();
  const noun = kind === "pull"
    ? `PR #${reference}`
    : kind === "commit"
    ? `commit ${reference.slice(0, 8)}`
    : `compare ${reference}`;
  return {
    kind,
    owner,
    repo,
    reference,
    webUrl,
    apiUrl: path,
    label: `${owner}/${repo} · ${noun}`,
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw invalidUrl();
  }
}

function assertSegment(value: string): void {
  if (
    !/^[A-Za-z0-9_.-]{1,100}$/.test(value) || value === "." || value === ".."
  ) throw invalidUrl();
}

function assertReference(value: string): void {
  if (!value || value.length > 250 || /[\s?#\\]/.test(value)) {
    throw invalidUrl();
  }
}

function invalidUrl(): GitHubImportError {
  return new GitHubImportError(
    "INVALID_URL",
    "Use a public GitHub commit, pull request, or compare URL.",
    400,
  );
}

function tooLarge(): GitHubImportError {
  return new GitHubImportError(
    "TOO_LARGE",
    "This GitHub diff is larger than the 5 MiB import limit.",
    413,
  );
}

function secondsUntil(unixSeconds: string, now: number): string | undefined {
  const seconds = Number(unixSeconds) - Math.floor(now / 1000);
  return Number.isFinite(seconds) ? String(Math.max(1, seconds)) : undefined;
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

async function readBoundedText(
  response: Response,
  limit: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
