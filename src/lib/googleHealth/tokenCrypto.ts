import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";

export const GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY_ENV = "GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY";
export const GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY_VERSION = 1;

const ALGORITHM = "aes-256-gcm";
const PAYLOAD_ALGORITHM = "A256GCM";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AAD = Buffer.from("body-comp-tracker-v2:google-health-token:v1", "utf8");

export type GoogleHealthEncryptedTokenPayload = {
  v: 1;
  alg: "A256GCM";
  kid: string;
  iv: string;
  tag: string;
  data: string;
};

type EncryptOptions = {
  key?: Buffer;
  keyVersion?: number;
};

type DecryptOptions = {
  key?: Buffer;
};

type EnvLike = Record<string, string | undefined>;

function toBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

function fromBase64Url(value: string): Buffer {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw new Error("google_health_token_ciphertext_invalid");
  }
}

function isEncryptedPayload(value: unknown): value is GoogleHealthEncryptedTokenPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Partial<GoogleHealthEncryptedTokenPayload>;
  return (
    payload.v === 1 &&
    payload.alg === PAYLOAD_ALGORITHM &&
    typeof payload.kid === "string" &&
    typeof payload.iv === "string" &&
    typeof payload.tag === "string" &&
    typeof payload.data === "string"
  );
}

function decodeKey(value: string): Buffer {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("google_health_token_encryption_key_missing");
  }

  if (/^[0-9a-f]{64}$/i.test(normalized)) {
    return Buffer.from(normalized, "hex");
  }

  try {
    return Buffer.from(normalized, "base64url");
  } catch {
    throw new Error("google_health_token_encryption_key_invalid");
  }
}

export function parseGoogleHealthTokenEncryptionKey(value: string): Buffer {
  const key = decodeKey(value);
  if (key.byteLength !== KEY_BYTES) {
    throw new Error("google_health_token_encryption_key_invalid");
  }
  return key;
}

export function getGoogleHealthTokenEncryptionKey(env: EnvLike = process.env): Buffer {
  const value = env[GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY_ENV];
  if (!value) {
    throw new Error("google_health_token_encryption_key_missing");
  }
  return parseGoogleHealthTokenEncryptionKey(value);
}

export function encryptGoogleHealthToken(
  token: string,
  options: EncryptOptions = {},
): GoogleHealthEncryptedTokenPayload {
  if (token.length === 0) {
    throw new Error("google_health_token_empty");
  }

  const key = options.key ?? getGoogleHealthTokenEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(AAD);

  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    v: 1,
    alg: PAYLOAD_ALGORITHM,
    kid: String(options.keyVersion ?? GOOGLE_HEALTH_TOKEN_ENCRYPTION_KEY_VERSION),
    iv: toBase64Url(iv),
    tag: toBase64Url(authTag),
    data: toBase64Url(ciphertext),
  };
}

export function decryptGoogleHealthToken(
  payload: unknown,
  options: DecryptOptions = {},
): string {
  if (!isEncryptedPayload(payload)) {
    throw new Error("google_health_token_ciphertext_invalid");
  }

  const key = options.key ?? getGoogleHealthTokenEncryptionKey();
  const iv = fromBase64Url(payload.iv);
  const authTag = fromBase64Url(payload.tag);
  const ciphertext = fromBase64Url(payload.data);

  if (iv.byteLength !== IV_BYTES || authTag.byteLength !== 16 || ciphertext.byteLength === 0) {
    throw new Error("google_health_token_ciphertext_invalid");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("google_health_token_decryption_failed");
  }
}
