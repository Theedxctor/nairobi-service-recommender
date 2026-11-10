-- #95: apply before deploying the API with Google sign-in and email
-- verification (login and profile queries select these columns). Safe to rerun.
-- Existing accounts keep email_verified_at NULL: their address was never
-- checked, so they are asked to verify rather than being marked verified.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64);
-- Accounts created with Google have no password.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'chk_users_has_credential' AND conrelid = 'users'::regclass) THEN
        ALTER TABLE users ADD CONSTRAINT chk_users_has_credential
            CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);
    END IF;
END $$;
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    token_hash CHAR(64) PRIMARY KEY,
    user_id VARCHAR(10) NOT NULL REFERENCES users(user_id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens (user_id);
COMMIT;
