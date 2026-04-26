import nextConfig, { securityHeaders } from "./next.config";

describe("next.config security headers", () => {
  it("applies security headers to all routes", async () => {
    const headerRules = await nextConfig.headers?.();

    expect(headerRules).toEqual([
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]);
  });

  it("includes the baseline browser security headers", () => {
    const headers = new Map(securityHeaders.map((header) => [header.key, header.value]));

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("Content-Security-Policy")).toContain("connect-src 'self' https://*.supabase.co wss://*.supabase.co");
  });
});
