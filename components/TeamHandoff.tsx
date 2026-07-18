import { type JSX } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { DiffDocument } from "../lib/diff/types.ts";
import {
  createPublishedReviewCapsule,
  createTeamHandoff,
  decryptTeamHandoff,
  encryptTeamHandoff,
  MAX_TEAM_HANDOFF_BYTES,
  type TeamHandoff as TeamHandoffData,
} from "../lib/team/handoff.ts";
import {
  matchingTeamRules,
  MAX_TEAM_RULES,
  type ReviewerProfile,
  type TeamRule,
} from "../lib/team/rules.ts";
import {
  parseReviewCapsule,
  type PortableReviewState,
  type ReviewFinding,
} from "../lib/review/notebook.ts";

interface Props {
  review: DiffDocument;
  selectedFileId?: string;
  viewed: ReadonlySet<string>;
  findings: readonly ReviewFinding[];
  profile: ReviewerProfile;
  teamName: string;
  rules: readonly TeamRule[];
  onPreferences: (
    profile: ReviewerProfile,
    teamName: string,
    rules: TeamRule[],
  ) => void;
  onRestore: (
    state: PortableReviewState,
    handoff: TeamHandoffData,
  ) => Promise<void>;
  onClose: () => void;
}

export function TeamHandoff(props: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [incoming, setIncoming] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = props.review.files.find((file) =>
    file.id === props.selectedFileId
  );
  const selectedRules = useMemo(
    () => selected ? matchingTeamRules(selected.path, props.rules) : [],
    [selected, props.rules],
  );
  const published = props.findings.filter((finding) => finding.included);

  useEffect(() => dialogRef.current?.showModal(), []);

  function updateProfile(field: keyof ReviewerProfile, value: string) {
    props.onPreferences({ ...props.profile, [field]: value }, props.teamName, [
      ...props.rules,
    ]);
  }

  function updateRule(id: string, field: keyof TeamRule, value: string) {
    props.onPreferences(
      props.profile,
      props.teamName,
      props.rules.map((rule) =>
        rule.id === id ? { ...rule, [field]: value } : rule
      ),
    );
  }

  async function exportHandoff() {
    setBusy(true);
    setMessage("");
    try {
      const capsule = createPublishedReviewCapsule(
        props.review,
        [...props.viewed],
        props.selectedFileId,
        props.findings,
      );
      const handoff = createTeamHandoff({
        profile: props.profile,
        teamName: props.teamName,
        rules: props.rules,
        capsule,
      });
      const encrypted = await encryptTeamHandoff(handoff, passphrase);
      downloadFile(
        encrypted,
        `${slug(props.review.title)}-${slug(props.teamName)}.patchscope.team`,
      );
      setMessage(
        `Encrypted handoff created with ${published.length} published finding${
          published.length === 1 ? "" : "s"
        }. Share the passphrase separately.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Handoff could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function importHandoff() {
    if (!incoming) {
      setMessage("Choose an encrypted .patchscope.team file first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (incoming.size > MAX_TEAM_HANDOFF_BYTES * 2) {
        throw new Error("Encrypted handoff exceeds the 2 MiB envelope limit.");
      }
      const handoff = await decryptTeamHandoff(
        await incoming.text(),
        passphrase,
      );
      const restored = parseReviewCapsule(handoff.capsule, props.review);
      await props.onRestore(restored, handoff);
      setMessage(
        `Opened ${handoff.teamName}'s handoff from ${handoff.sharedBy.name}. Team rules were imported; your local identity was not replaced.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Handoff could not be opened.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      class="team-handoff"
      aria-labelledby="team-title"
      onClose={props.onClose}
    >
      <header>
        <div>
          <span class="eyebrow">Encrypted team handoff</span>
          <h2 id="team-title">
            Share selected findings without sharing the patch.
          </h2>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close team handoff"
        >
          Esc
        </button>
      </header>
      <div class="team-layout">
        <section class="identity-panel" aria-labelledby="identity-title">
          <header>
            <span class="identity-mark" aria-hidden="true">
              {initials(props.profile.name)}
            </span>
            <div>
              <h3 id="identity-title">Local reviewer identity</h3>
              <p>
                Stored in this browser. This is a signature, not an account.
              </p>
            </div>
          </header>
          <label>
            Display name
            <input
              name="reviewer-name"
              type="text"
              value={props.profile.name}
              onInput={(event) =>
                updateProfile("name", event.currentTarget.value)}
              maxlength={80}
              autocomplete="name"
            />
          </label>
          <label>
            Team handle
            <input
              name="reviewer-handle"
              type="text"
              value={props.profile.handle}
              onInput={(event) =>
                updateProfile("handle", event.currentTarget.value)}
              maxlength={80}
              placeholder="@handle"
              spellcheck={false}
            />
          </label>
          <label>
            Team name
            <input
              name="team-name"
              type="text"
              value={props.teamName}
              onInput={(event) =>
                props.onPreferences(
                  props.profile,
                  event.currentTarget.value,
                  [...props.rules],
                )}
              maxlength={100}
            />
          </label>
          <section class="selected-coverage" aria-labelledby="coverage-title">
            <h3 id="coverage-title">Selected-file coverage</h3>
            <strong>{selected?.path ?? "No file selected"}</strong>
            {selectedRules.length
              ? (
                <ul>
                  {selectedRules.map((rule) => (
                    <li key={rule.id}>
                      <span>@{stripAt(rule.owner)}</span>
                      {rule.note}
                    </li>
                  ))}
                </ul>
              )
              : (
                <p>
                  No team rule matches this file. That is visible, not silently
                  treated as approval.
                </p>
              )}
          </section>
        </section>

        <section class="rules-panel" aria-labelledby="rules-title">
          <header>
            <div>
              <h3 id="rules-title">Review rules</h3>
              <p>
                Exact path, directory ending in{" "}
                <code>/</code>, extension such as <code>*.ts</code>, or{" "}
                <code>*</code>.
              </p>
            </div>
            <button
              type="button"
              disabled={props.rules.length >= MAX_TEAM_RULES}
              onClick={() =>
                props.onPreferences(props.profile, props.teamName, [
                  ...props.rules,
                  {
                    id: crypto.randomUUID(),
                    pattern: "*",
                    owner: "maintainers",
                    note: "Review intent",
                  },
                ])}
            >
              Add rule
            </button>
          </header>
          <ol class="team-rules">
            {props.rules.map((rule, index) => (
              <li key={rule.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <label>
                  Pattern
                  <input
                    aria-label={`Rule ${index + 1} pattern`}
                    value={rule.pattern}
                    onInput={(event) =>
                      updateRule(rule.id, "pattern", event.currentTarget.value)}
                    spellcheck={false}
                  />
                </label>
                <label>
                  Owner
                  <input
                    aria-label={`Rule ${index + 1} owner`}
                    value={rule.owner}
                    onInput={(event) =>
                      updateRule(rule.id, "owner", event.currentTarget.value)}
                    spellcheck={false}
                  />
                </label>
                <label>
                  Review intent
                  <input
                    aria-label={`Rule ${index + 1} review intent`}
                    value={rule.note}
                    onInput={(event) =>
                      updateRule(rule.id, "note", event.currentTarget.value)}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove rule ${index + 1}`}
                  onClick={() =>
                    props.onPreferences(
                      props.profile,
                      props.teamName,
                      props.rules.filter((candidate) =>
                        candidate.id !== rule.id
                      ),
                    )}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section class="handoff-panel" aria-labelledby="handoff-title">
          <header>
            <h3 id="handoff-title">Encrypted handoff</h3>
            <p>AES-GCM · PBKDF2-SHA-256 · source-free</p>
          </header>
          <label>
            Handoff passphrase
            <input
              name="handoff-passphrase"
              type="password"
              value={passphrase}
              onInput={(event) => setPassphrase(event.currentTarget.value)}
              minlength={12}
              maxlength={512}
              autocomplete="off"
            />
            <small>
              Never stored. Send it through a different channel than the file.
            </small>
          </label>
          <div class="publication-receipt">
            <strong>Publication receipt</strong>
            <dl>
              <div>
                <dt>Published findings</dt>
                <dd>{published.length}</dd>
              </div>
              <div>
                <dt>Private drafts withheld</dt>
                <dd>{props.findings.length - published.length}</dd>
              </div>
              <div>
                <dt>Patch lines</dt>
                <dd>0</dd>
              </div>
            </dl>
          </div>
          <button
            class="handoff-primary"
            type="button"
            disabled={busy}
            onClick={() => void exportHandoff()}
          >
            Create encrypted handoff
          </button>
          <div class="handoff-import">
            <input
              ref={fileRef}
              class="visually-hidden"
              type="file"
              accept=".team,application/json"
              aria-label="Choose encrypted Patchscope team handoff"
              onChange={(event: JSX.TargetedEvent<HTMLInputElement, Event>) =>
                setIncoming(event.currentTarget.files?.[0])}
            />
            <button type="button" onClick={() => fileRef.current?.click()}>
              {incoming ? incoming.name : "Choose handoff file"}
            </button>
            <button
              type="button"
              disabled={busy || !incoming}
              onClick={() => void importHandoff()}
            >
              Decrypt and open
            </button>
          </div>
          <p class="handoff-message" role="status" aria-live="polite">
            {message}
          </p>
        </section>
      </div>
      <footer>
        Hosted presence and comments remain deferred until this portable
        contract proves useful.
      </footer>
    </dialog>
  );
}

function downloadFile(contents: string, name: string) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([contents], { type: "application/json" }),
  );
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function slug(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
    /^-|-$/g,
    "",
  ) || "review";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length
    ? parts.slice(0, 2).map((part) => part[0]).join("")
    : "?").toLocaleUpperCase();
}

function stripAt(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}
