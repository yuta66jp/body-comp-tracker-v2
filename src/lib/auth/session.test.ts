import {
  getAllowedAuthEmail,
  isAllowedUserEmail,
  isAuthAllowlistConfigured,
  isProductionAuthAllowlistRequired,
} from "./session";

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_ALLOWED_AUTH_EMAIL: process.env.NEXT_PUBLIC_ALLOWED_AUTH_EMAIL,
  ALLOWED_AUTH_EMAIL: process.env.ALLOWED_AUTH_EMAIL,
};

function resetEnv(overrides: Record<string, string | undefined> = {}) {
  delete process.env.NEXT_PUBLIC_ALLOWED_AUTH_EMAIL;
  delete process.env.ALLOWED_AUTH_EMAIL;

  Object.defineProperty(process.env, "NODE_ENV", {
    value: originalEnv.NODE_ENV,
    writable: true,
    configurable: true,
    enumerable: true,
  });

  Object.assign(process.env, overrides);
  if ("NODE_ENV" in overrides) {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: overrides.NODE_ENV,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
}

describe("auth session allowlist", () => {
  afterEach(() => {
    resetEnv(originalEnv);
  });

  it("normalizes the configured public allowlist email", () => {
    resetEnv({ NEXT_PUBLIC_ALLOWED_AUTH_EMAIL: " Owner@Example.COM " });

    expect(getAllowedAuthEmail()).toBe("owner@example.com");
    expect(isAuthAllowlistConfigured()).toBe(true);
  });

  it("prefers NEXT_PUBLIC_ALLOWED_AUTH_EMAIL over ALLOWED_AUTH_EMAIL", () => {
    resetEnv({
      NEXT_PUBLIC_ALLOWED_AUTH_EMAIL: "public@example.com",
      ALLOWED_AUTH_EMAIL: "server@example.com",
    });

    expect(getAllowedAuthEmail()).toBe("public@example.com");
  });

  it("allows any email in non-production when the allowlist is not configured", () => {
    resetEnv({ NODE_ENV: "test" });

    expect(isProductionAuthAllowlistRequired()).toBe(false);
    expect(isAuthAllowlistConfigured()).toBe(false);
    expect(isAllowedUserEmail("anyone@example.com")).toBe(true);
  });

  it("rejects all emails in production when the allowlist is not configured", () => {
    resetEnv({ NODE_ENV: "production" });

    expect(isProductionAuthAllowlistRequired()).toBe(true);
    expect(isAuthAllowlistConfigured()).toBe(false);
    expect(isAllowedUserEmail("owner@example.com")).toBe(false);
  });

  it("only allows the configured email in production", () => {
    resetEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_ALLOWED_AUTH_EMAIL: "owner@example.com",
    });

    expect(isAllowedUserEmail(" OWNER@example.com ")).toBe(true);
    expect(isAllowedUserEmail("other@example.com")).toBe(false);
    expect(isAllowedUserEmail(null)).toBe(false);
  });
});
