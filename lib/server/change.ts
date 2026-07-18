import { fetchForgeDiff, ForgeImportError } from "./forge.ts";
import { fetchGitHubDiff, GitHubImportError } from "./github.ts";

export type ChangeImportError = ForgeImportError | GitHubImportError;

export async function fetchChangeDiff(
  input: string,
  options: {
    fetcher?: typeof fetch;
    githubToken?: string;
    now?: number;
  } = {},
) {
  let host = "";
  try {
    host = new URL(input.trim()).hostname.toLowerCase();
  } catch {
    throw new ForgeImportError(
      "INVALID_URL",
      "Use a supported public forge change URL.",
      400,
    );
  }
  if (host === "github.com") {
    return await fetchGitHubDiff(input, {
      fetcher: options.fetcher,
      token: options.githubToken,
      now: options.now,
    });
  }
  return await fetchForgeDiff(input, {
    fetcher: options.fetcher,
    now: options.now,
  });
}

export function isChangeImportError(
  error: unknown,
): error is ChangeImportError {
  return error instanceof ForgeImportError ||
    error instanceof GitHubImportError;
}
