-- Google Health OAuth token storage foundation (#694)
--
-- Purpose:
--   Store Google Health OAuth connection metadata and encrypted tokens for each
--   Supabase Auth user. Tokens must be usable only by server-side service_role
--   code and must not be exposed through browser clients or authenticated RLS.
--
-- Design:
--   - Store token ciphertext in a private schema, not public.
--   - Do not grant anon / authenticated direct privileges on the token table.
--   - service_role is expected to access this table from server-only code.
--   - Token ciphertext payloads are JSONB objects produced by application code.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON SEQUENCES FROM PUBLIC;

DO $$
BEGIN
  CREATE TYPE private.google_health_connection_status AS ENUM (
    'not_connected',
    'connected',
    'scope_missing',
    'reauthorization_required',
    'error'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON TYPE private.google_health_connection_status FROM PUBLIC;
REVOKE ALL ON TYPE private.google_health_connection_status FROM anon;
REVOKE ALL ON TYPE private.google_health_connection_status FROM authenticated;
GRANT USAGE ON TYPE private.google_health_connection_status TO service_role;

CREATE TABLE IF NOT EXISTS private.google_health_connections (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_access_token     JSONB,
  encrypted_refresh_token    JSONB,
  access_token_expires_at    TIMESTAMPTZ,
  granted_scopes             TEXT[] NOT NULL DEFAULT '{}',
  status                     private.google_health_connection_status NOT NULL DEFAULT 'not_connected',
  last_checked_at            TIMESTAMPTZ,
  last_sync_at               TIMESTAMPTZ,
  last_error_code            TEXT,
  last_error_message         TEXT,
  encryption_key_version     SMALLINT NOT NULL DEFAULT 1,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_google_health_connections_user_id UNIQUE (user_id),
  CONSTRAINT chk_google_health_connections_key_version
    CHECK (encryption_key_version > 0),
  CONSTRAINT chk_google_health_connections_access_token_shape
    CHECK (
      encrypted_access_token IS NULL
      OR jsonb_typeof(encrypted_access_token) = 'object'
    ),
  CONSTRAINT chk_google_health_connections_refresh_token_shape
    CHECK (
      encrypted_refresh_token IS NULL
      OR jsonb_typeof(encrypted_refresh_token) = 'object'
    ),
  CONSTRAINT chk_google_health_connections_error_message_length
    CHECK (last_error_message IS NULL OR length(last_error_message) <= 500)
);

COMMENT ON SCHEMA private IS
  'Server-only schema for sensitive application data. Do not expose to anon/authenticated clients.';
COMMENT ON TYPE private.google_health_connection_status IS
  'Google Health OAuth connection status for settings/status UI.';
COMMENT ON TABLE private.google_health_connections IS
  'Server-only Google Health OAuth connection records. Token fields contain encrypted JSON payloads only.';
COMMENT ON COLUMN private.google_health_connections.id IS 'UUID primary key.';
COMMENT ON COLUMN private.google_health_connections.user_id IS 'Owner Supabase auth.users.id. One Google Health connection per user.';
COMMENT ON COLUMN private.google_health_connections.encrypted_access_token IS
  'Encrypted Google OAuth access token payload. Never store plaintext token values.';
COMMENT ON COLUMN private.google_health_connections.encrypted_refresh_token IS
  'Encrypted Google OAuth refresh token payload. Never store plaintext token values.';
COMMENT ON COLUMN private.google_health_connections.access_token_expires_at IS
  'Google OAuth access token expiry timestamp.';
COMMENT ON COLUMN private.google_health_connections.granted_scopes IS
  'Scopes granted by Google OAuth consent.';
COMMENT ON COLUMN private.google_health_connections.status IS
  'Sanitized connection status: not_connected / connected / scope_missing / reauthorization_required / error.';
COMMENT ON COLUMN private.google_health_connections.last_checked_at IS
  'Last time the connection status was checked.';
COMMENT ON COLUMN private.google_health_connections.last_sync_at IS
  'Last successful Google Health daily metrics sync time.';
COMMENT ON COLUMN private.google_health_connections.last_error_code IS
  'Sanitized operational error code. Must not contain token values.';
COMMENT ON COLUMN private.google_health_connections.last_error_message IS
  'Sanitized operational error message. Must not contain token values.';
COMMENT ON COLUMN private.google_health_connections.encryption_key_version IS
  'Application encryption key version used for the encrypted token payloads.';

CREATE INDEX IF NOT EXISTS idx_google_health_connections_user_id
  ON private.google_health_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_google_health_connections_status
  ON private.google_health_connections(status);

ALTER TABLE private.google_health_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.google_health_connections FROM PUBLIC;
REVOKE ALL ON TABLE private.google_health_connections FROM anon;
REVOKE ALL ON TABLE private.google_health_connections FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.google_health_connections TO service_role;

CREATE OR REPLACE FUNCTION private.set_updated_at_google_health_connections()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.set_updated_at_google_health_connections() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.set_updated_at_google_health_connections() FROM anon;
REVOKE ALL ON FUNCTION private.set_updated_at_google_health_connections() FROM authenticated;
GRANT EXECUTE ON FUNCTION private.set_updated_at_google_health_connections() TO service_role;

DROP TRIGGER IF EXISTS trg_set_updated_at_google_health_connections
  ON private.google_health_connections;

CREATE TRIGGER trg_set_updated_at_google_health_connections
BEFORE UPDATE ON private.google_health_connections
FOR EACH ROW EXECUTE FUNCTION private.set_updated_at_google_health_connections();
