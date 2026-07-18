import { type JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  buildEvidenceContext,
  type EvidenceClaim,
  validateEvidenceClaims,
} from "../lib/ai/evidence.ts";
import { analyzeWithOllama } from "../lib/client/ollama.ts";
import type { DiffFile } from "../lib/diff/types.ts";

type Provider = "openai" | "ollama";

interface Props {
  file: DiffFile;
  fileIndex: number;
  claims: readonly EvidenceClaim[];
  onClaims: (claims: EvidenceClaim[]) => void;
  onConvert: (claim: EvidenceClaim) => Promise<void>;
  onClose: () => void;
}

interface ApiErrorBody {
  error?: { message?: string };
}

export function EvidenceLab(props: Props) {
  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState("gpt-5.6-luna");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const context = useMemo(() => buildEvidenceContext(props.file), [props.file]);

  useEffect(() => dialogRef.current?.showModal(), []);

  function chooseProvider(next: Provider) {
    setProvider(next);
    setModel(next === "openai" ? "gpt-5.6-luna" : "qwen3:4b");
    setMessage("");
  }

  async function analyze(event: JSX.TargetedSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      let raw: unknown;
      if (provider === "openai") {
        const response = await fetch("/api/ai", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model, context }),
        });
        raw = await response.json();
        if (!response.ok) {
          throw new Error(
            (raw as ApiErrorBody).error?.message ?? "OpenAI request failed.",
          );
        }
      } else {
        raw = await analyzeWithOllama(context, model);
      }
      const result = validateEvidenceClaims(raw, context);
      props.onClaims(result.claims);
      setMessage(
        result.claims.length
          ? `${result.claims.length} cited claim${
            result.claims.length === 1 ? "" : "s"
          } ready.${
            result.rejected
              ? ` ${result.rejected} ungrounded response${
                result.rejected === 1 ? " was" : "s were"
              } rejected.`
              : ""
          }`
          : result.rejected
          ? `No claim survived citation checking; ${result.rejected} ungrounded response${
            result.rejected === 1 ? " was" : "s were"
          } rejected.`
          : "The model found no review claim in this file context.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Evidence request failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function convert(claim: EvidenceClaim) {
    await props.onConvert(claim);
    props.onClaims(
      props.claims.filter((candidate) => candidate.id !== claim.id),
    );
    setMessage(
      "Claim saved as a private finding. Nothing was posted upstream.",
    );
  }

  return (
    <dialog
      ref={dialogRef}
      class="evidence-lab"
      aria-labelledby="evidence-title"
      onClose={props.onClose}
    >
      <header>
        <div>
          <span class="eyebrow">OPT-IN EVIDENCE</span>
          <h2 id="evidence-title">Interrogate one file, not the repository.</h2>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close evidence lab"
        >
          Esc
        </button>
      </header>
      <div class="evidence-layout">
        <form class="evidence-setup" onSubmit={analyze}>
          <fieldset class="provider-switch">
            <legend>Model route</legend>
            <label>
              <input
                type="radio"
                name="provider"
                value="openai"
                checked={provider === "openai"}
                onChange={() => chooseProvider("openai")}
              />
              OpenAI · your key
            </label>
            <label>
              <input
                type="radio"
                name="provider"
                value="ollama"
                checked={provider === "ollama"}
                onChange={() => chooseProvider("ollama")}
              />
              Ollama · this device
            </label>
          </fieldset>
          <label>
            Model
            <input
              name="model"
              type="text"
              value={model}
              onInput={(event) => setModel(event.currentTarget.value)}
              spellcheck={false}
              required
            />
          </label>
          {provider === "openai"
            ? (
              <label>
                OpenAI API key
                <input
                  name="api-key"
                  type="password"
                  value={apiKey}
                  onInput={(event) => setApiKey(event.currentTarget.value)}
                  autocomplete="off"
                  required
                />
                <small>
                  Held only while this window is open; never stored by
                  Patchscope.
                </small>
              </label>
            )
            : (
              <div class="local-route-note">
                <strong>Fixed route</strong>
                <code>127.0.0.1:11434</code>
                <p>
                  Ollama may require{" "}
                  <code>OLLAMA_ORIGINS={globalThis.location?.origin}</code>{" "}
                  before <code>ollama serve</code>.
                </p>
              </div>
            )}
          <section class="context-receipt" aria-labelledby="context-title">
            <h3 id="context-title">What leaves the page</h3>
            <strong>{props.file.path}</strong>
            <dl>
              <div>
                <dt>Line records</dt>
                <dd>{context.lines.length.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Context size</dt>
                <dd>{formatBytes(context.bytes)}</dd>
              </div>
              <div>
                <dt>Omitted</dt>
                <dd>{context.omittedLines.toLocaleString()}</dd>
              </div>
            </dl>
            <p>
              No findings, review history, other files, or repository contents.
            </p>
          </section>
          <button
            class="evidence-run"
            type="submit"
            disabled={busy || !context.lines.length}
          >
            {busy ? "Checking citations…" : "Analyze selected file"}
          </button>
          <p class="evidence-message" role="status" aria-live="polite">
            {message}
          </p>
        </form>
        <section class="claim-stream" aria-label="Model claims">
          <header>
            <h3>Claims under review</h3>
            <span>{props.claims.length} kept</span>
          </header>
          {props.claims.length
            ? props.claims.map((claim) => (
              <article
                class="evidence-claim"
                key={claim.id}
                data-confidence={claim.confidence}
              >
                <header>
                  <span>{claim.confidence} confidence</span>
                  <button
                    type="button"
                    onClick={() =>
                      props.onClaims(
                        props.claims.filter((candidate) =>
                          candidate.id !== claim.id
                        ),
                      )}
                    aria-label={`Dismiss ${claim.title}`}
                  >
                    Dismiss
                  </button>
                </header>
                <h4>{claim.title}</h4>
                <p>{claim.explanation}</p>
                <ol class="claim-citations">
                  {claim.evidence.map((citation) => (
                    <li key={`${citation.side}-${citation.line}`}>
                      <a
                        href={`#${
                          lineHref(
                            props.fileIndex,
                            citation.side,
                            citation.line,
                          )
                        }`}
                        onClick={props.onClose}
                      >
                        {citation.side === "new" ? "New" : "Old"} line{" "}
                        {citation.line}
                      </a>
                      <code>{citation.quote}</code>
                    </li>
                  ))}
                </ol>
                <aside>
                  <strong>Why this may be wrong</strong>
                  <p>{claim.uncertainty}</p>
                </aside>
                <button
                  class="claim-convert"
                  type="button"
                  onClick={() => void convert(claim)}
                >
                  Save as private finding
                </button>
              </article>
            ))
            : (
              <div class="claim-empty">
                <strong>No model claims are trusted yet.</strong>
                <p>
                  Run an explicit check. Schema-valid but uncited output is
                  discarded.
                </p>
              </div>
            )}
        </section>
      </div>
      <footer>
        Patchscope never posts model output to a forge or marks a file reviewed.
      </footer>
    </dialog>
  );
}

function lineHref(
  fileIndex: number,
  side: "old" | "new",
  line: number,
): string {
  return `F${fileIndex + 1}-${side === "old" ? "L" : "R"}${line}`;
}

function formatBytes(bytes: number): string {
  return bytes < 1_024 ? `${bytes} B` : `${(bytes / 1_024).toFixed(1)} KiB`;
}
