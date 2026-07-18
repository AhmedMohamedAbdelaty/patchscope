export type EditorChannel = "stable" | "insiders";

export function buildEditorLink(
  channel: EditorChannel,
  workspaceRoot: string,
  filePath: string,
  line = 1,
): string {
  const root = normalizeRoot(workspaceRoot);
  const relative = normalizeRelativePath(filePath);
  if (!Number.isSafeInteger(line) || line < 1) {
    throw new Error("Editor line must be a positive integer.");
  }
  const fullPath = root === "/" ? `/${relative}` : `${root}/${relative}`;
  const encoded = fullPath.split("/").map(encodeURIComponent).join("/");
  const scheme = channel === "insiders" ? "vscode-insiders" : "vscode";
  return `${scheme}://file/${encoded}:${line}:1`;
}

function normalizeRoot(value: string): string {
  const normalized = value.trim().replaceAll("\\", "/");
  const root = normalized === "/" ? "/" : normalized.replace(/\/+$/, "");
  if (!root || root.length > 4_096 || /[\0\r\n]/.test(root)) {
    throw new Error("Enter an absolute local workspace path.");
  }
  if (!root.startsWith("/") && !/^[A-Za-z]:(\/|$)/.test(root)) {
    throw new Error("Enter an absolute local workspace path.");
  }
  if (root.split("/").some((part) => part === "..")) {
    throw new Error("Workspace path cannot contain parent traversal.");
  }
  return root || "/";
}

function normalizeRelativePath(value: string): string {
  const path = value.replaceAll("\\", "/").replace(/^\/+/, "");
  if (
    !path || path.length > 4_096 || /[\0\r\n]/.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Changed file path is not safe for an editor link.");
  }
  return path;
}
