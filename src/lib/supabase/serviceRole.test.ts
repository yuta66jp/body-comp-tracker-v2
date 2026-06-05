jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ kind: "service-role-client" })),
}));

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "./serviceRole";

const mockCreateSupabaseClient = createSupabaseClient as jest.Mock;

describe("createServiceRoleClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockCreateSupabaseClient.mockClear();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("service role key で persistSession 無効の Supabase client を作成する", () => {
    const client = createServiceRoleClient();

    expect(client).toEqual({ kind: "service-role-client" });
    expect(mockCreateSupabaseClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-key",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  });

  it("必要な env がない場合は sanitized error を返す", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => createServiceRoleClient()).toThrow("supabase_service_role_env_missing");
    expect(mockCreateSupabaseClient).not.toHaveBeenCalled();
  });
});
