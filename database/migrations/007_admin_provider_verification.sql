-- UCD administrator use case: Verify Provider Identity.
-- service_providers.is_verified remains the fast boolean used by ranking and
-- filtering; this table records the decision, reviewer, note and timestamp.
CREATE TABLE IF NOT EXISTS provider_identity_reviews (
    provider_id VARCHAR(10) PRIMARY KEY REFERENCES service_providers(provider_id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('approved', 'rejected')),
    reviewed_by VARCHAR(10) REFERENCES users(user_id),
    note VARCHAR(500),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_identity_reviews_status
    ON provider_identity_reviews (status);

-- Preserve the meaning of imported/existing verified providers without
-- fabricating an administrator or review note for those historic decisions.
INSERT INTO provider_identity_reviews (provider_id, status, reviewed_by, note)
SELECT provider_id, 'approved', NULL, 'Imported as verified before review auditing was introduced.'
FROM service_providers
WHERE is_verified = true
ON CONFLICT (provider_id) DO NOTHING;
