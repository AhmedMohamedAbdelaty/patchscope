import type { JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  deleteReview,
  loadReview,
  saveReview,
} from "../lib/client/review-store.ts";
import {
  type AtlasLayer,
  atlasLayerDetails,
  type AtlasLayerId,
  buildAtlas,
  classifyFile,
  isReviewLens,
  type ReviewLens,
} from "../lib/diff/atlas.ts";
import { exportReview } from "../lib/diff/export.ts";
import { parseDiff } from "../lib/diff/parse.ts";
import { priorityLabel } from "../lib/diff/priority.ts";
import type {
  DiffDocument,
  DiffFile,
  DiffHunk,
  DiffLine,
  DiffSource,
} from "../lib/diff/types.ts";

interface Props {
  sampleDiff: string;
}

type ViewStyle = "unified" | "split";
type SortStyle = "priority" | "path";
type Theme = "system" | "light" | "dark";
type AtlasSelection = "all" | AtlasLayerId;

interface Filters {
  generated: boolean;
  lockfiles: boolean;
  whitespace: boolean;
}

interface ImportErrorBody {
  error?: { message?: string };
}

interface GitHubBody {
  diff: string;
  source: { label: string; webUrl: string };
}

const DIFF_PLACEHOLDER = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@`;

export default function ReviewWorkspace({ sampleDiff }: Props) {
  const [review, setReview] = useState<DiffDocument>();
  const [selectedId, setSelectedId] = useState<string>();
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [viewStyle, setViewStyle] = useState<ViewStyle>("unified");
  const [wrap, setWrap] = useState(true);
  const [sortStyle, setSortStyle] = useState<SortStyle>("priority");
  const [reviewLens, setReviewLens] = useState<ReviewLens>("general");
  const [atlasLayer, setAtlasLayer] = useState<AtlasSelection>("all");
  const [filters, setFilters] = useState<Filters>({
    generated: true,
    lockfiles: true,
    whitespace: true,
  });
  const [fileQuery, setFileQuery] = useState("");
  const [codeQuery, setCodeQuery] = useState("");
  const [theme, setTheme] = useState<Theme>("system");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = review?.files.find((file) => file.id === selectedId) ??
    review?.files[0];
  const atlas = useMemo(
    () => buildAtlas(review?.files ?? [], reviewLens),
    [review, reviewLens],
  );
  const visibleFiles = useMemo(() => {
    const files = filterAndSort(
      review?.files ?? [],
      filters,
      fileQuery,
      sortStyle,
    );
    return atlasLayer === "all"
      ? files
      : files.filter((file) => classifyFile(file).layer === atlasLayer);
  }, [review, filters, fileQuery, sortStyle, atlasLayer]);
  const noiseHidden = useMemo(
    () =>
      (review?.files.length ?? 0) -
      filterAndSort(review?.files ?? [], filters, "", sortStyle).length,
    [review, filters, sortStyle],
  );
  const reviewedCount =
    review?.files.filter((file) => viewed.has(file.id)).length ?? 0;

  useEffect(() => {
    const stored = localStorage.getItem("patchscope:preferences");
    if (!stored) return;
    try {
      const preferences = JSON.parse(stored) as {
        theme?: Theme;
        viewStyle?: ViewStyle;
        wrap?: boolean;
        reviewLens?: ReviewLens;
      };
      if (preferences.theme) setTheme(preferences.theme);
      if (preferences.viewStyle) setViewStyle(preferences.viewStyle);
      if (typeof preferences.wrap === "boolean") setWrap(preferences.wrap);
      if (isReviewLens(preferences.reviewLens)) {
        setReviewLens(preferences.reviewLens);
      }
    } catch {
      localStorage.removeItem("patchscope:preferences");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(
      "patchscope:preferences",
      JSON.stringify({ theme, viewStyle, wrap, reviewLens }),
    );
  }, [theme, viewStyle, wrap, reviewLens]);

  useEffect(() => {
    if (!review) return;
    saveReview({
      documentId: review.id,
      viewedFileIds: [...viewed],
      selectedFileId: selected?.id,
      updatedAt: new Date().toISOString(),
    }).catch(() =>
      setNotice("Review progress could not be saved in this browser.")
    );
  }, [review, viewed, selected?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches(
          "input, textarea, select, button, a, [contenteditable='true']",
        )
      ) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key.toLowerCase() === "v" && selected) {
        toggleViewed(selected.id);
      } else if ((event.key === "j" || event.key === "k") && selected) {
        const direction = event.key === "j" ? 1 : -1;
        const index = visibleFiles.findIndex((file) => file.id === selected.id);
        const next = visibleFiles[index + direction];
        if (next) setSelectedId(next.id);
      }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [selected, visibleFiles]);

  useEffect(() => {
    const githubUrl = new URL(globalThis.location.href).searchParams.get(
      "github",
    );
    if (githubUrl && !review && !loading) void importGitHub(githubUrl);
  }, []);

  async function openDiff(raw: string, source: DiffSource, title?: string) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const next = await parseDiff(raw, source, title);
      const saved = await loadReview(next.id).catch(() => undefined);
      setReview(next);
      setAtlasLayer("all");
      setViewed(new Set(saved?.viewedFileIds ?? []));
      setSelectedId(
        saved?.selectedFileId &&
          next.files.some((file) => file.id === saved.selectedFileId)
          ? saved.selectedFileId
          : recommendedFile(next.files)?.id,
      );
      history.replaceState(
        null,
        "",
        source.url
          ? `?github=${encodeURIComponent(source.url)}`
          : location.pathname,
      );
      setNotice(
        saved?.viewedFileIds.length
          ? `Resumed ${saved.viewedFileIds.length} reviewed file${
            saved.viewedFileIds.length === 1 ? "" : "s"
          }.`
          : "Change ready for review.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The change could not be opened.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function importGitHub(value: string) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/github?url=${encodeURIComponent(value)}`,
      );
      const body = await response.json() as GitHubBody & ImportErrorBody;
      if (!response.ok) {
        throw new Error(body.error?.message ?? "GitHub import failed.");
      }
      await openDiff(body.diff, {
        kind: "github",
        label: body.source.label,
        url: body.source.webUrl,
      }, body.source.label);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "GitHub import failed.",
      );
      setLoading(false);
    }
  }

  function toggleViewed(fileId: string) {
    setViewed((current) => {
      const next = new Set(current);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function nextUnreviewed() {
    if (!review) return;
    const ordered = filterAndSort(review.files, filters, "", sortStyle).filter(
      (file) => atlasLayer === "all" || classifyFile(file).layer === atlasLayer,
    );
    const currentIndex = ordered.findIndex((file) => file.id === selected?.id);
    const next = [
      ...ordered.slice(currentIndex + 1),
      ...ordered.slice(0, currentIndex + 1),
    ].find((file) => !viewed.has(file.id));
    if (next) setSelectedId(next.id);
    else setNotice("Every visible file is marked reviewed.");
  }

  async function resetProgress() {
    if (!review) return;
    await deleteReview(review.id).catch(() => undefined);
    setViewed(new Set());
    setNotice("Review progress cleared.");
  }

  function closeReview() {
    setReview(undefined);
    setSelectedId(undefined);
    setViewed(new Set());
    setCodeQuery("");
    setAtlasLayer("all");
    history.replaceState(null, "", location.pathname);
  }

  function selectAtlasLayer(layer: AtlasSelection) {
    setAtlasLayer(layer);
    if (!review || layer === "all") return;
    if (selected && classifyFile(selected).layer === layer) return;
    const next = filterAndSort(
      review.files.filter((file) => classifyFile(file).layer === layer),
      filters,
      fileQuery,
      sortStyle,
    )[0] ?? review.files.find((file) => classifyFile(file).layer === layer);
    if (next) setSelectedId(next.id);
  }

  async function copySummary() {
    if (!review) return;
    await navigator.clipboard.writeText(exportReview(review, viewed));
    setNotice("Markdown review summary copied.");
  }

  function downloadSummary() {
    if (!review) return;
    const blob = new Blob([exportReview(review, viewed)], {
      type: "text/markdown;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${slug(review.title)}-review.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div class="app-shell">
      <header class="masthead">
        <a class="wordmark" href="/" aria-label="Patchscope home">
          <Logo />
          <span>Patchscope</span>
        </a>
        <p class="masthead-purpose">Review the change. Keep your place.</p>
        <div class="masthead-actions">
          <ThemeControl theme={theme} onChange={setTheme} />
          <details class="help-menu">
            <summary aria-label="Keyboard help">
              <HelpIcon />
            </summary>
            <div class="menu-panel">
              <strong>Keyboard</strong>
              <span>
                <kbd>j</kbd> / <kbd>k</kbd> change file
              </span>
              <span>
                <kbd>v</kbd> toggle reviewed
              </span>
              <span>
                <kbd>/</kbd> search this file
              </span>
            </div>
          </details>
        </div>
      </header>

      <div class="sr-status" role="status" aria-live="polite">
        {loading ? "Loading change" : notice}
      </div>
      {error && (
        <div class="global-alert" role="alert">
          <AlertIcon />
          <span>{error}</span>
          <button type="button" onClick={() => setError("")}>Dismiss</button>
        </div>
      )}

      {!review
        ? (
          <ImportDock
            loading={loading}
            sampleDiff={sampleDiff}
            onOpen={openDiff}
            onGitHub={importGitHub}
          />
        )
        : (
          <main id="workspace-main" class="review-workspace">
            <ReviewHeader
              review={review}
              viewed={reviewedCount}
              onClose={closeReview}
            />
            <div class="review-grid">
              <FileNavigator
                files={visibleFiles}
                atlas={atlas}
                atlasLayer={atlasLayer}
                reviewLens={reviewLens}
                noiseHidden={noiseHidden}
                selectedId={selected?.id}
                viewed={viewed}
                query={fileQuery}
                sortStyle={sortStyle}
                filters={filters}
                onQuery={setFileQuery}
                onSort={setSortStyle}
                onFilters={setFilters}
                onAtlasLayer={selectAtlasLayer}
                onReviewLens={setReviewLens}
                onSelect={setSelectedId}
              />
              <section class="review-canvas" aria-label="Selected file review">
                {selected && (
                  <>
                    <FileToolbar
                      file={selected}
                      reviewed={viewed.has(selected.id)}
                      viewStyle={viewStyle}
                      wrap={wrap}
                      query={codeQuery}
                      searchRef={searchRef}
                      onViewStyle={setViewStyle}
                      onWrap={setWrap}
                      onQuery={setCodeQuery}
                      onViewed={() => toggleViewed(selected.id)}
                      onNext={nextUnreviewed}
                      onCopy={copySummary}
                      onDownload={downloadSummary}
                      onReset={resetProgress}
                    />
                    <DiffViewer
                      file={selected}
                      fileIndex={review.files.indexOf(selected)}
                      style={viewStyle}
                      wrap={wrap}
                      query={codeQuery}
                    />
                  </>
                )}
              </section>
            </div>
          </main>
        )}
    </div>
  );
}

function ImportDock({ loading, sampleDiff, onOpen, onGitHub }: {
  loading: boolean;
  sampleDiff: string;
  onOpen: (raw: string, source: DiffSource, title?: string) => Promise<void>;
  onGitHub: (url: string) => Promise<void>;
}) {
  const [pasted, setPasted] = useState("");
  const [github, setGitHub] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(event: JSX.TargetedEvent<HTMLInputElement, Event>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    await onOpen(
      await file.text(),
      { kind: "upload", label: file.name },
      file.name,
    );
    event.currentTarget.value = "";
  }

  return (
    <main id="workspace-main" class="empty-workspace">
      <section class="intro-copy" aria-labelledby="intro-title">
        <p class="eyebrow">LOCAL-FIRST CHANGE REVIEW</p>
        <h1 id="intro-title">A map for the patch in front of you.</h1>
        <p>
          Open a diff, start with the consequential files, and leave with a
          review ledger, not another tab you have to remember.
        </p>
        <ul class="trust-list">
          <li>
            <LockIcon />Pasted and uploaded patches stay in this browser.
          </li>
          <li>
            <CompassIcon />Priority is explained navigation, never an automated
            verdict.
          </li>
          <li>
            <KeyboardIcon />The full review loop works without a mouse.
          </li>
        </ul>
      </section>

      <section
        class="import-dock"
        aria-labelledby="import-title"
        aria-busy={loading}
      >
        <div class="dock-heading">
          <div>
            <p class="step-label">01 / OPEN A CHANGE</p>
            <h2 id="import-title">Choose an input</h2>
          </div>
          <button
            class="text-button"
            type="button"
            disabled={loading}
            onClick={() =>
              onOpen(
                sampleDiff,
                { kind: "sample", label: "Patchscope sample" },
                "Session audit sample",
              )}
          >
            Try the sample
          </button>
        </div>

        <form
          class="github-import"
          onSubmit={(event) => {
            event.preventDefault();
            void onGitHub(github);
          }}
        >
          <label for="github-url">
            Public GitHub commit, pull request, or compare URL
          </label>
          <div class="input-action">
            <input
              id="github-url"
              type="url"
              value={github}
              onInput={(event) => setGitHub(event.currentTarget.value)}
              placeholder="https://github.com/owner/repo/pull/123"
              required
              disabled={loading}
            />
            <button class="primary-button" type="submit" disabled={loading}>
              {loading ? "Opening…" : "Open GitHub change"}
            </button>
          </div>
        </form>

        <div class="divider">
          <span>or keep it entirely local</span>
        </div>

        <label class="paste-label" for="raw-diff">Paste a unified diff</label>
        <textarea
          id="raw-diff"
          value={pasted}
          onInput={(event) => setPasted(event.currentTarget.value)}
          placeholder={DIFF_PLACEHOLDER}
          spellcheck={false}
          disabled={loading}
        />
        <div class="dock-actions">
          <button
            class="secondary-button"
            type="button"
            disabled={loading || !pasted.trim()}
            onClick={() =>
              onOpen(pasted, { kind: "paste", label: "Pasted diff" })}
          >
            Review pasted diff
          </button>
          <input
            ref={fileRef}
            class="visually-hidden"
            type="file"
            aria-label="Choose a patch or diff file"
            accept=".patch,.diff,text/x-diff,text/x-patch"
            onChange={upload}
          />
          <button
            class="secondary-button"
            type="button"
            disabled={loading}
            onClick={() => fileRef.current?.click()}
          >
            <UploadIcon />Choose .patch or .diff
          </button>
        </div>
        <p class="input-note">
          Maximum 5 MiB · no account required · public GitHub reads only
        </p>
      </section>
    </main>
  );
}

function ReviewHeader(
  { review, viewed, onClose }: {
    review: DiffDocument;
    viewed: number;
    onClose: () => void;
  },
) {
  const progress = review.files.length
    ? Math.round((viewed / review.files.length) * 100)
    : 0;
  return (
    <header class="review-header">
      <div class="change-identity">
        <button
          class="icon-button"
          type="button"
          onClick={onClose}
          aria-label="Open another change"
        >
          <BackIcon />
        </button>
        <div>
          <p class="source-label">
            {review.source.kind === "github" ? "GITHUB CHANGE" : "LOCAL CHANGE"}
          </p>
          <h1>{review.title}</h1>
        </div>
      </div>
      <dl class="change-stats">
        <div>
          <dt>Files</dt>
          <dd>{review.stats.files}</dd>
        </div>
        <div>
          <dt>Lines</dt>
          <dd>
            <span class="addition">+{review.stats.additions}</span>{" "}
            <span class="deletion">−{review.stats.deletions}</span>
          </dd>
        </div>
        <div>
          <dt>Reviewed</dt>
          <dd>{viewed}/{review.files.length}</dd>
        </div>
      </dl>
      <div class="progress-block">
        <span>{progress}% complete</span>
        <progress max="100" value={progress}>{progress}%</progress>
      </div>
    </header>
  );
}

function FileNavigator(props: {
  files: DiffFile[];
  atlas: AtlasLayer[];
  atlasLayer: AtlasSelection;
  reviewLens: ReviewLens;
  noiseHidden: number;
  selectedId?: string;
  viewed: ReadonlySet<string>;
  query: string;
  sortStyle: SortStyle;
  filters: Filters;
  onQuery: (value: string) => void;
  onSort: (value: SortStyle) => void;
  onFilters: (value: Filters) => void;
  onAtlasLayer: (value: AtlasSelection) => void;
  onReviewLens: (value: ReviewLens) => void;
  onSelect: (id: string) => void;
}) {
  const groups = groupFiles(props.files);
  return (
    <aside class="file-navigator" aria-label="Changed files">
      <div class="navigator-tools">
        <ChangeAtlas
          layers={props.atlas}
          selected={props.atlasLayer}
          lens={props.reviewLens}
          onLayer={props.onAtlasLayer}
          onLens={props.onReviewLens}
        />
        <label class="search-field">
          <SearchIcon />
          <span class="visually-hidden">Filter changed files</span>
          <input
            type="search"
            value={props.query}
            onInput={(event) => props.onQuery(event.currentTarget.value)}
            placeholder="Filter files"
          />
        </label>
        <div class="navigator-options">
          <label>
            Order<select
              value={props.sortStyle}
              onChange={(event) =>
                props.onSort(event.currentTarget.value as SortStyle)}
            >
              <option value="priority">Review priority</option>
              <option value="path">File path</option>
            </select>
          </label>
          <details class="filter-menu">
            <summary>
              Noise{props.noiseHidden > 0
                ? ` · ${props.noiseHidden} hidden`
                : ""}
            </summary>
            <div class="filter-panel">
              <FilterToggle
                label="Generated files"
                checked={props.filters.generated}
                onChange={(checked) =>
                  props.onFilters({ ...props.filters, generated: checked })}
              />
              <FilterToggle
                label="Lockfiles"
                checked={props.filters.lockfiles}
                onChange={(checked) =>
                  props.onFilters({ ...props.filters, lockfiles: checked })}
              />
              <FilterToggle
                label="Whitespace only"
                checked={props.filters.whitespace}
                onChange={(checked) =>
                  props.onFilters({ ...props.filters, whitespace: checked })}
              />
              <p>Checked items stay visible.</p>
            </div>
          </details>
        </div>
      </div>
      <div class="file-scroll">
        {groups.length === 0 && (
          <p class="empty-filter">No files match these filters.</p>
        )}
        {groups.map(([group, files]) => (
          <section
            class="file-group"
            key={group}
            aria-labelledby={`group-${slug(group)}`}
          >
            <h2 id={`group-${slug(group)}`}>
              <FolderIcon />
              {group}
            </h2>
            <ol>
              {files.map((file) => (
                <li key={file.id}>
                  <button
                    type="button"
                    class="file-row"
                    data-selected={file.id === props.selectedId}
                    data-viewed={props.viewed.has(file.id)}
                    onClick={() => props.onSelect(file.id)}
                    aria-current={file.id === props.selectedId
                      ? "true"
                      : undefined}
                  >
                    <span
                      class="review-check"
                      aria-label={props.viewed.has(file.id)
                        ? "Reviewed"
                        : "Not reviewed"}
                    >
                      {props.viewed.has(file.id) ? <CheckIcon /> : <span />}
                    </span>
                    <span class="file-copy">
                      <span class="file-name">{basename(file.path)}</span>
                      <span class="file-parent">{dirname(file.path)}</span>
                    </span>
                    <span class="file-delta">
                      <span class="addition">+{file.additions}</span>
                      <span class="deletion">−{file.deletions}</span>
                    </span>
                    <span
                      class="priority-dot"
                      data-level={priorityLevel(file.priority)}
                      title={`${
                        priorityLabel(file.priority)
                      }: priority ${file.priority}/100`}
                    />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </aside>
  );
}

function ChangeAtlas(props: {
  layers: AtlasLayer[];
  selected: AtlasSelection;
  lens: ReviewLens;
  onLayer: (value: AtlasSelection) => void;
  onLens: (value: ReviewLens) => void;
}) {
  const selected = props.layers.find((layer) => layer.id === props.selected);
  return (
    <section class="change-atlas" aria-labelledby="atlas-title">
      <div class="atlas-heading">
        <div>
          <span class="eyebrow">SUGGESTED ROUTE</span>
          <h2 id="atlas-title">Change Atlas</h2>
        </div>
        <label>
          <span class="visually-hidden">Review lens</span>
          <select
            value={props.lens}
            onChange={(event) =>
              props.onLens(event.currentTarget.value as ReviewLens)}
          >
            <option value="general">General</option>
            <option value="security">Security</option>
            <option value="tests">Tests first</option>
          </select>
        </label>
      </div>
      <ol class="atlas-route" aria-label="Suggested review layers">
        <li>
          <button
            type="button"
            data-active={props.selected === "all"}
            aria-pressed={props.selected === "all"}
            onClick={() => props.onLayer("all")}
          >
            <span class="atlas-step">00</span>
            <span>
              <strong>All files</strong>
              <small>Full change</small>
            </span>
          </button>
        </li>
        {props.layers.map((layer, index) => (
          <li key={layer.id}>
            <button
              type="button"
              data-active={props.selected === layer.id}
              aria-pressed={props.selected === layer.id}
              title={layer.description}
              onClick={() => props.onLayer(layer.id)}
            >
              <span class="atlas-step">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{layer.title}</strong>
                <small>
                  {layer.files.length} file{layer.files.length === 1 ? "" : "s"}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p class="atlas-explanation" aria-live="polite">
        {selected?.description ??
          "A path-based starting point, not a dependency graph."}
      </p>
    </section>
  );
}

function FileToolbar(props: {
  file: DiffFile;
  reviewed: boolean;
  viewStyle: ViewStyle;
  wrap: boolean;
  query: string;
  searchRef: { current: HTMLInputElement | null };
  onViewStyle: (value: ViewStyle) => void;
  onWrap: (value: boolean) => void;
  onQuery: (value: string) => void;
  onViewed: () => void;
  onNext: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onReset: () => void;
}) {
  const classification = classifyFile(props.file);
  const route = atlasLayerDetails(classification.layer);
  return (
    <header class="file-toolbar">
      <div class="file-title-row">
        <div class="file-heading">
          <StatusMark status={props.file.status} />
          <div>
            <h2>{props.file.path}</h2>
            {props.file.oldPath !== props.file.path && (
              <p>from {props.file.oldPath}</p>
            )}
          </div>
        </div>
        <details class="priority-explain">
          <summary>
            <span
              class="priority-dot"
              data-level={priorityLevel(props.file.priority)}
            />
            {priorityLabel(props.file.priority)} · {props.file.priority}
          </summary>
          <div class="priority-panel">
            <strong>Why this order?</strong>
            <p>
              Atlas: {route.title}. {classification.reason}.
            </p>
            {props.file.prioritySignals.length
              ? (
                <ul>
                  {props.file.prioritySignals.map((signal) => (
                    <li key={signal.label}>
                      <span>{signal.label}</span>
                      <small>{signal.detail}</small>
                    </li>
                  ))}
                </ul>
              )
              : <p>No special signals; standard file priority.</p>}
            <p>This is a navigation hint, not a finding.</p>
          </div>
        </details>
      </div>
      <div class="tool-row">
        <label class="search-field code-search">
          <SearchIcon />
          <span class="visually-hidden">Search selected file</span>
          <input
            ref={props.searchRef}
            type="search"
            value={props.query}
            onInput={(event) => props.onQuery(event.currentTarget.value)}
            placeholder="Search this file  /"
          />
        </label>
        <div class="segmented" aria-label="Diff view">
          <button
            type="button"
            aria-pressed={props.viewStyle === "unified"}
            onClick={() => props.onViewStyle("unified")}
          >
            Unified
          </button>
          <button
            type="button"
            aria-pressed={props.viewStyle === "split"}
            onClick={() => props.onViewStyle("split")}
          >
            Split
          </button>
        </div>
        <button
          class="tool-button"
          type="button"
          aria-pressed={props.wrap}
          onClick={() => props.onWrap(!props.wrap)}
        >
          Wrap
        </button>
        <button
          class="review-button"
          data-reviewed={props.reviewed}
          type="button"
          onClick={props.onViewed}
        >
          {props.reviewed
            ? (
              <>
                <CheckIcon />Reviewed
              </>
            )
            : "Mark reviewed"}
        </button>
        <button class="next-button" type="button" onClick={props.onNext}>
          Next unreviewed <ArrowIcon />
        </button>
        <details class="more-menu">
          <summary aria-label="Review actions">
            <MoreIcon />
          </summary>
          <div class="menu-panel align-right">
            <button type="button" onClick={props.onCopy}>
              Copy Markdown summary
            </button>
            <button type="button" onClick={props.onDownload}>
              Download Markdown
            </button>
            <button type="button" onClick={props.onReset}>
              Clear review progress
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}

function DiffViewer(
  { file, fileIndex, style, wrap, query }: {
    file: DiffFile;
    fileIndex: number;
    style: ViewStyle;
    wrap: boolean;
    query: string;
  },
) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [lineLimit, setLineLimit] = useState(2_000);
  useEffect(() => {
    setExpanded(new Set());
    setLineLimit(2_000);
  }, [file.id]);

  if (file.isBinary) {
    return (
      <div class="diff-empty">
        <BinaryIcon />
        <h3>Binary change</h3>
        <p>Git does not provide reviewable text lines for this file.</p>
      </div>
    );
  }
  if (!file.hunks.length) {
    return (
      <div class="diff-empty">
        <FileIcon />
        <h3>No textual hunks</h3>
        <p>The patch contains metadata for this file but no changed lines.</p>
      </div>
    );
  }

  const totalLines = file.hunks.reduce(
    (sum, hunk) => sum + hunk.lines.length,
    0,
  );
  let remaining = lineLimit;
  const hunks = file.hunks.flatMap((hunk) => {
    if (remaining <= 0) return [];
    const lines = hunk.lines.slice(0, remaining);
    remaining -= lines.length;
    return [{ ...hunk, lines }];
  });

  return (
    <div class="diff-viewer" data-style={style} data-wrap={wrap}>
      <div class="diff-legend" aria-hidden="true">
        <span>
          <i class="legend-add" />addition
        </span>
        <span>
          <i class="legend-del" />deletion
        </span>
        <span>line numbers link here</span>
      </div>
      {hunks.map((hunk, hunkIndex) => {
        const rows = compactHunk(hunk, expanded.has(hunkIndex));
        return (
          <section
            class="diff-hunk"
            key={`${file.id}-${hunkIndex}`}
            aria-label={`Hunk ${hunkIndex + 1}: ${hunk.header}`}
          >
            <div class="hunk-header">
              <code>{hunk.header}</code>
              <span>
                {hunk.lines.filter((line) => line.kind !== "context").length}
                {" "}
                changed lines
              </span>
            </div>
            {style === "unified"
              ? (
                <UnifiedRows
                  rows={rows}
                  fileIndex={fileIndex}
                  query={query}
                  onExpand={() => setExpanded(addToSet(expanded, hunkIndex))}
                />
              )
              : (
                <SplitRows
                  rows={splitRows(rows)}
                  fileIndex={fileIndex}
                  query={query}
                  onExpand={() => setExpanded(addToSet(expanded, hunkIndex))}
                />
              )}
          </section>
        );
      })}
      {totalLines > lineLimit && (
        <button
          class="load-more-lines"
          type="button"
          onClick={() => setLineLimit((current) => current + 2_000)}
        >
          Show next {Math.min(2_000, totalLines - lineLimit).toLocaleString()}
          {" "}
          lines
          <span>
            {(totalLines - lineLimit).toLocaleString()} still hidden
          </span>
        </button>
      )}
    </div>
  );
}

type DisplayRow = DiffLine | { kind: "gap"; count: number };
interface SplitRow {
  left?: DiffLine;
  right?: DiffLine;
  gap?: number;
}

function UnifiedRows(
  { rows, fileIndex, query, onExpand }: {
    rows: DisplayRow[];
    fileIndex: number;
    query: string;
    onExpand: () => void;
  },
) {
  return (
    <div class="unified-lines" aria-label="Unified diff lines">
      {rows.map((line, index) => {
        if (line.kind === "gap") {
          return (
            <GapRow
              key={`gap-${index}`}
              count={line.count}
              onExpand={onExpand}
            />
          );
        }
        const anchor = lineAnchor(fileIndex, line);
        return (
          <div
            class="diff-line"
            data-kind={line.kind}
            id={anchor}
            key={`${anchor}-${index}`}
          >
            <LineLink value={line.oldLine} anchor={anchor} label="Old line" />
            <LineLink value={line.newLine} anchor={anchor} label="New line" />
            <span class="line-sign" aria-hidden="true">
              {line.kind === "addition"
                ? "+"
                : line.kind === "deletion"
                ? "−"
                : " "}
            </span>
            <code>{highlight(line.content, query)}</code>
          </div>
        );
      })}
    </div>
  );
}

function SplitRows(
  { rows, fileIndex, query, onExpand }: {
    rows: SplitRow[];
    fileIndex: number;
    query: string;
    onExpand: () => void;
  },
) {
  return (
    <div class="split-lines" aria-label="Side-by-side diff lines">
      {rows.map((row, index) => {
        if (row.gap) {
          return (
            <GapRow key={`gap-${index}`} count={row.gap} onExpand={onExpand} />
          );
        }
        return (
          <div class="split-row" key={`${fileIndex}-${index}`}>
            <SplitCell
              line={row.left}
              side="old"
              fileIndex={fileIndex}
              query={query}
            />
            <SplitCell
              line={row.right}
              side="new"
              fileIndex={fileIndex}
              query={query}
            />
          </div>
        );
      })}
    </div>
  );
}

function SplitCell(
  { line, side, fileIndex, query }: {
    line?: DiffLine;
    side: "old" | "new";
    fileIndex: number;
    query: string;
  },
) {
  if (!line) return <div class="split-cell empty-cell" />;
  const anchor = lineAnchor(fileIndex, line, side);
  const value = side === "old" ? line.oldLine : line.newLine;
  return (
    <div class="split-cell" data-kind={line.kind} id={anchor}>
      <LineLink value={value} anchor={anchor} label={`${side} line`} />
      <span class="line-sign" aria-hidden="true">
        {line.kind === "addition" ? "+" : line.kind === "deletion" ? "−" : " "}
      </span>
      <code>{highlight(line.content, query)}</code>
    </div>
  );
}

function GapRow({ count, onExpand }: { count: number; onExpand: () => void }) {
  return (
    <button class="context-gap" type="button" onClick={onExpand}>
      <ExpandIcon />
      <span>Show {count} unchanged lines</span>
    </button>
  );
}

function LineLink(
  { value, anchor, label }: { value?: number; anchor: string; label: string },
) {
  return value == null ? <span class="line-number" /> : (
    <a
      class="line-number"
      href={`#${anchor}`}
      aria-label={`${label} ${value}`}
    >
      {value}
    </a>
  );
}

function ThemeControl(
  { theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void },
) {
  const next: Record<Theme, Theme> = {
    system: "light",
    light: "dark",
    dark: "system",
  };
  return (
    <button
      class="theme-button"
      type="button"
      onClick={() => onChange(next[theme])}
      aria-label={`Color theme: ${theme}. Change theme.`}
    >
      {theme === "dark"
        ? <MoonIcon />
        : theme === "light"
        ? <SunIcon />
        : <SystemIcon />}
      <span>{theme}</span>
    </button>
  );
}

function FilterToggle(
  { label, checked, onChange }: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  },
) {
  return (
    <label class="check-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function StatusMark({ status }: { status: DiffFile["status"] }) {
  const labels: Record<DiffFile["status"], string> = {
    added: "A",
    deleted: "D",
    modified: "M",
    renamed: "R",
    binary: "B",
  };
  return (
    <span
      class="status-mark"
      data-status={status}
      aria-label={`${status} file`}
    >
      {labels[status]}
    </span>
  );
}

function filterAndSort(
  files: DiffFile[],
  filters: Filters,
  query: string,
  sortStyle: SortStyle,
): DiffFile[] {
  const needle = query.trim().toLocaleLowerCase();
  return files.filter((file) =>
    (filters.generated || !file.isGenerated) &&
    (filters.lockfiles || !file.isLockfile) &&
    (filters.whitespace || !file.isWhitespaceOnly) &&
    (!needle || file.path.toLocaleLowerCase().includes(needle))
  ).toSorted((a, b) =>
    sortStyle === "priority"
      ? b.priority - a.priority || a.path.localeCompare(b.path)
      : a.path.localeCompare(b.path)
  );
}

function recommendedFile(files: DiffFile[]): DiffFile | undefined {
  return files.toSorted((a, b) => b.priority - a.priority)[0];
}

function compactHunk(hunk: DiffHunk, expanded: boolean): DisplayRow[] {
  if (expanded) return hunk.lines;
  const output: DisplayRow[] = [];
  for (let index = 0; index < hunk.lines.length;) {
    if (hunk.lines[index].kind !== "context") {
      output.push(hunk.lines[index++]);
      continue;
    }
    let end = index;
    while (end < hunk.lines.length && hunk.lines[end].kind === "context") end++;
    const run = hunk.lines.slice(index, end);
    if (run.length > 10) {
      output.push(
        ...run.slice(0, 3),
        { kind: "gap", count: run.length - 6 },
        ...run.slice(-3),
      );
    } else output.push(...run);
    index = end;
  }
  return output;
}

function splitRows(rows: DisplayRow[]): SplitRow[] {
  const output: SplitRow[] = [];
  for (let index = 0; index < rows.length;) {
    const line = rows[index];
    if (line.kind === "gap") {
      output.push({ gap: line.count });
      index++;
      continue;
    }
    if (line.kind === "context") {
      output.push({ left: line, right: line });
      index++;
      continue;
    }
    const block: DiffLine[] = [];
    while (
      index < rows.length && rows[index].kind !== "context" &&
      rows[index].kind !== "gap"
    ) block.push(rows[index++] as DiffLine);
    const left = block.filter((item) => item.kind === "deletion");
    const right = block.filter((item) => item.kind === "addition");
    for (let row = 0; row < Math.max(left.length, right.length); row++) {
      output.push({ left: left[row], right: right[row] });
    }
  }
  return output;
}

function highlight(content: string, query: string): JSX.Element | string {
  const needle = query.trim();
  if (!needle) return content;
  const index = content.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) return content;
  return (
    <>
      {content.slice(0, index)}
      <mark>{content.slice(index, index + needle.length)}</mark>
      {content.slice(index + needle.length)}
    </>
  );
}

function lineAnchor(
  fileIndex: number,
  line: DiffLine,
  preferred?: "old" | "new",
): string {
  const side = preferred ?? (line.newLine != null ? "R" : "L");
  const value = side === "old" || side === "L" ? line.oldLine : line.newLine;
  return `F${fileIndex + 1}-${
    side === "old" ? "L" : side === "new" ? "R" : side
  }${value ?? 0}`;
}

function groupFiles(files: DiffFile[]): Array<[string, DiffFile[]]> {
  const groups = new Map<string, DiffFile[]>();
  for (const file of files) {
    const group = file.path.includes("/") ? file.path.split("/")[0] : "root";
    groups.set(group, [...(groups.get(group) ?? []), file]);
  }
  return [...groups.entries()];
}

function priorityLevel(priority: number): "high" | "medium" | "normal" | "low" {
  if (priority >= 65) return "high";
  if (priority >= 42) return "medium";
  if (priority >= 18) return "normal";
  return "low";
}

function addToSet(values: ReadonlySet<number>, value: number): Set<number> {
  return new Set([...values, value]);
}

function basename(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function dirname(path: string): string {
  const parts = path.split("/");
  return parts.length > 1 ? `${parts.slice(0, -1).join("/")}/` : "project root";
}

function slug(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
    /(^-|-$)/g,
    "",
  ) || "change";
}

function Icon(
  { children, size = 18, viewBox = "0 0 24 24" }: {
    children: JSX.Element | JSX.Element[];
    size?: number;
    viewBox?: string;
  },
) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
const Logo = () => (
  <svg
    class="logo"
    width="27"
    height="27"
    viewBox="0 0 27 27"
    aria-hidden="true"
  >
    <path
      d="M4 3.5h12.5L23 10v13.5H4z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    />
    <path
      d="M16.5 3.5V10H23M8 14h11M8 18h7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    />
    <path d="M8 10h4" stroke="var(--accent)" strokeWidth="2.5" />
  </svg>
);
const HelpIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.7 9a2.4 2.4 0 1 1 3 2.3c-.7.25-.7.9-.7 1.7M12 17h.01" />
  </Icon>
);
const AlertIcon = () => (
  <Icon>
    <path d="M12 3 2.8 20h18.4zM12 9v4M12 17h.01" />
  </Icon>
);
const LockIcon = () => (
  <Icon>
    <rect x="5" y="10" width="14" height="10" rx="1" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Icon>
);
const CompassIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="m15 9-2 4-4 2 2-4z" />
  </Icon>
);
const KeyboardIcon = () => (
  <Icon>
    <rect x="3" y="6" width="18" height="12" rx="1" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
  </Icon>
);
const UploadIcon = () => (
  <Icon>
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" />
  </Icon>
);
const BackIcon = () => (
  <Icon>
    <path d="m15 18-6-6 6-6" />
  </Icon>
);
const SearchIcon = () => (
  <Icon size={16}>
    <circle cx="11" cy="11" r="6" />
    <path d="m16 16 4 4" />
  </Icon>
);
const FolderIcon = () => (
  <Icon size={15}>
    <path d="M3 6h7l2 2h9v10H3z" />
  </Icon>
);
const CheckIcon = () => (
  <Icon size={15}>
    <path d="m5 12 4 4L19 6" />
  </Icon>
);
const ArrowIcon = () => (
  <Icon size={15}>
    <path d="M5 12h14m-5-5 5 5-5 5" />
  </Icon>
);
const MoreIcon = () => (
  <Icon>
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
  </Icon>
);
const ExpandIcon = () => (
  <Icon size={15}>
    <path d="m8 10 4 4 4-4" />
    <path d="M4 7h16" />
  </Icon>
);
const BinaryIcon = () => (
  <Icon size={28}>
    <path d="M5 3h10l4 4v14H5zM15 3v5h4M9 13h.01M9 17h.01M13 13h2M13 17h2" />
  </Icon>
);
const FileIcon = () => (
  <Icon size={28}>
    <path d="M5 3h10l4 4v14H5zM15 3v5h4" />
  </Icon>
);
const MoonIcon = () => (
  <Icon size={16}>
    <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z" />
  </Icon>
);
const SunIcon = () => (
  <Icon size={16}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);
const SystemIcon = () => (
  <Icon size={16}>
    <rect x="3" y="4" width="18" height="13" rx="1" />
    <path d="M8 21h8M12 17v4" />
  </Icon>
);
