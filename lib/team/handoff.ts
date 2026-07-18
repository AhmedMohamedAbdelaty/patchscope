import {
  type ReviewerProfile,
  type TeamRule,
  validateProfile,
  validateTeamRules,
} from "./rules.ts";
import type { DiffDocument } from "../diff/types.ts";
import {
  type ReviewFinding,
  serializeReviewCapsule,
} from "../review/notebook.ts";

export const TEAM_HANDOFF_FORMAT = "patchscope.team";
export const TEAM_ENVELOPE_FORMAT = "patchscope.team.encrypted";
export const TEAM_HANDOFF_VERSION = 1;
export const MAX_TEAM_HANDOFF_BYTES = 1024 * 1024;
export const TEAM_KDF_ITERATIONS = 600_000;
const MIN_IMPORT_ITERATIONS = 100_000;
const MAX_IMPORT_ITERATIONS = 1_200_000;

export interface TeamHandoff {
  format: typeof TEAM_HANDOFF_FORMAT;
  version: typeof TEAM_HANDOFF_VERSION;
  sharedAt: string;
  sharedBy: ReviewerProfile;
  teamName: string;
  rules: TeamRule[];
  capsule: string;
}

export function createPublishedReviewCapsule(
  document: DiffDocument,
  viewedFileIds: readonly string[],
  selectedFileId: string | undefined,
  findings: readonly ReviewFinding[],
): string {
  return serializeReviewCapsule(document, {
    viewedFileIds: [...viewedFileIds],
    selectedFileId,
    findings: findings.filter((finding) => finding.included),
  });
}

interface TeamEnvelope {
  format: typeof TEAM_ENVELOPE_FORMAT;
  version: typeof TEAM_HANDOFF_VERSION;
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string;
  };
  cipher: {
    name: "AES-GCM";
    iv: string;
    ciphertext: string;
  };
}

export function createTeamHandoff(input: {
  profile: ReviewerProfile;
  teamName: string;
  rules: readonly TeamRule[];
  capsule: string;
}): TeamHandoff {
  const profile = validateProfile(input.profile);
  const rules = validateTeamRules(input.rules);
  if (!input.teamName.trim() || input.teamName.length > 100) {
    throw new Error(
      "Team name is required and must be at most 100 characters.",
    );
  }
  if (!input.capsule || encodedSize(input.capsule) > MAX_TEAM_HANDOFF_BYTES) {
    throw new Error("Review capsule is missing or exceeds the handoff limit.");
  }
  return {
    format: TEAM_HANDOFF_FORMAT,
    version: TEAM_HANDOFF_VERSION,
    sharedAt: new Date().toISOString(),
    sharedBy: profile,
    teamName: input.teamName.trim(),
    rules,
    capsule: input.capsule,
  };
}

export async function encryptTeamHandoff(
  handoff: TeamHandoff,
  passphrase: string,
): Promise<string> {
  validatePassphrase(passphrase);
  const plaintext = new TextEncoder().encode(
    JSON.stringify(readHandoff(handoff)),
  );
  if (plaintext.byteLength > MAX_TEAM_HANDOFF_BYTES) {
    throw new Error("Team handoff exceeds the 1 MiB limit.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, TEAM_KDF_ITERATIONS, [
    "encrypt",
  ]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: envelopeContext() },
    key,
    plaintext,
  );
  const envelope: TeamEnvelope = {
    format: TEAM_ENVELOPE_FORMAT,
    version: TEAM_HANDOFF_VERSION,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: TEAM_KDF_ITERATIONS,
      salt: encodeBase64(salt),
    },
    cipher: {
      name: "AES-GCM",
      iv: encodeBase64(iv),
      ciphertext: encodeBase64(new Uint8Array(ciphertext)),
    },
  };
  return JSON.stringify(envelope, null, 2);
}

export async function decryptTeamHandoff(
  raw: string,
  passphrase: string,
): Promise<TeamHandoff> {
  validatePassphrase(passphrase);
  if (encodedSize(raw) > MAX_TEAM_HANDOFF_BYTES * 2) {
    throw new Error("Encrypted handoff exceeds the 2 MiB envelope limit.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("This file is not a valid encrypted Patchscope handoff.");
  }
  const envelope = readEnvelope(parsed);
  const salt = decodeBase64(envelope.kdf.salt, 16);
  const iv = decodeBase64(envelope.cipher.iv, 12);
  const ciphertext = decodeBase64(
    envelope.cipher.ciphertext,
    MAX_TEAM_HANDOFF_BYTES + 64,
  );
  try {
    const key = await deriveKey(
      passphrase,
      salt,
      envelope.kdf.iterations,
      ["decrypt"],
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: envelopeContext() },
      key,
      ciphertext,
    );
    return readHandoff(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch {
    throw new Error(
      "The handoff could not be decrypted. Check the passphrase and file.",
    );
  }
}

function readHandoff(value: unknown): TeamHandoff {
  if (
    !isRecord(value) || value.format !== TEAM_HANDOFF_FORMAT ||
    value.version !== TEAM_HANDOFF_VERSION ||
    typeof value.sharedAt !== "string" ||
    !Number.isFinite(Date.parse(value.sharedAt)) ||
    typeof value.teamName !== "string" || !value.teamName.trim() ||
    value.teamName.length > 100 || typeof value.capsule !== "string" ||
    !value.capsule || encodedSize(value.capsule) > MAX_TEAM_HANDOFF_BYTES
  ) throw new Error("Decrypted team handoff is invalid.");
  return {
    format: TEAM_HANDOFF_FORMAT,
    version: TEAM_HANDOFF_VERSION,
    sharedAt: value.sharedAt,
    sharedBy: validateProfile(value.sharedBy),
    teamName: value.teamName.trim(),
    rules: validateTeamRules(value.rules),
    capsule: value.capsule,
  };
}

function readEnvelope(value: unknown): TeamEnvelope {
  if (
    !isRecord(value) || value.format !== TEAM_ENVELOPE_FORMAT ||
    value.version !== TEAM_HANDOFF_VERSION || !isRecord(value.kdf) ||
    value.kdf.name !== "PBKDF2" || value.kdf.hash !== "SHA-256" ||
    !Number.isSafeInteger(value.kdf.iterations) ||
    (value.kdf.iterations as number) < MIN_IMPORT_ITERATIONS ||
    (value.kdf.iterations as number) > MAX_IMPORT_ITERATIONS ||
    typeof value.kdf.salt !== "string" || !isRecord(value.cipher) ||
    value.cipher.name !== "AES-GCM" || typeof value.cipher.iv !== "string" ||
    typeof value.cipher.ciphertext !== "string"
  ) {
    throw new Error(
      "This file is not a supported encrypted Patchscope handoff.",
    );
  }
  return value as unknown as TeamEnvelope;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

function validatePassphrase(passphrase: string) {
  if (passphrase.length < 12 || passphrase.length > 512) {
    throw new Error("Use a handoff passphrase between 12 and 512 characters.");
  }
}

function envelopeContext(): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    `${TEAM_ENVELOPE_FORMAT}:v${TEAM_HANDOFF_VERSION}`,
  );
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 32_768));
  }
  return btoa(binary);
}

function decodeBase64(
  value: string,
  maxBytes: number,
): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length > maxBytes * 2) {
    throw new Error("Encrypted handoff contains invalid binary data.");
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("Encrypted handoff contains invalid binary data.");
  }
  if (binary.length > maxBytes) {
    throw new Error("Encrypted handoff binary data is too large.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodedSize(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
