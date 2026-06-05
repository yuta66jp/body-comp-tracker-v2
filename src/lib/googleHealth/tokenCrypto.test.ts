import {
  decryptGoogleHealthToken,
  encryptGoogleHealthToken,
  getGoogleHealthTokenEncryptionKey,
  parseGoogleHealthTokenEncryptionKey,
} from "./tokenCrypto";

const key = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
const otherKey = Buffer.from("abcdef0123456789abcdef0123456789", "utf8");
const token = "ya29.google-health-access-token";

describe("Google Health token crypto", () => {
  it("AES-256-GCM で token を暗号化して復号できる", () => {
    const encrypted = encryptGoogleHealthToken(token, { key });

    expect(encrypted).toEqual({
      v: 1,
      alg: "A256GCM",
      kid: "1",
      iv: expect.any(String),
      tag: expect.any(String),
      data: expect.any(String),
    });
    expect(JSON.stringify(encrypted)).not.toContain(token);
    expect(decryptGoogleHealthToken(encrypted, { key })).toBe(token);
  });

  it("同じ token でも暗号化 payload は毎回異なる", () => {
    const encryptedA = encryptGoogleHealthToken(token, { key });
    const encryptedB = encryptGoogleHealthToken(token, { key });

    expect(encryptedA).not.toEqual(encryptedB);
    expect(decryptGoogleHealthToken(encryptedA, { key })).toBe(token);
    expect(decryptGoogleHealthToken(encryptedB, { key })).toBe(token);
  });

  it("異なる key では復号できず token を含まないエラーを返す", () => {
    const encrypted = encryptGoogleHealthToken(token, { key });

    expect(() => decryptGoogleHealthToken(encrypted, { key: otherKey }))
      .toThrow("google_health_token_decryption_failed");
  });

  it("不正な payload は復号しない", () => {
    expect(() => decryptGoogleHealthToken({ data: token }, { key }))
      .toThrow("google_health_token_ciphertext_invalid");
  });

  it("base64url または hex の 32 bytes key を読み取る", () => {
    expect(parseGoogleHealthTokenEncryptionKey(key.toString("base64url"))).toEqual(key);
    expect(parseGoogleHealthTokenEncryptionKey(key.toString("hex"))).toEqual(key);
  });

  it("env の key がない場合は sanitized error を返す", () => {
    expect(() => getGoogleHealthTokenEncryptionKey({}))
      .toThrow("google_health_token_encryption_key_missing");
  });

  it("32 bytes ではない key は拒否する", () => {
    expect(() => parseGoogleHealthTokenEncryptionKey(Buffer.from("short").toString("base64url")))
      .toThrow("google_health_token_encryption_key_invalid");
  });
});
