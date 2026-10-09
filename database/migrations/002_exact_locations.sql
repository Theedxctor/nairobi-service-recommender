-- #72: exact client/provider coordinates. Idempotent; for databases created
-- before these columns were added to schema.sql. Run, then
-- database/backfill_locations.py to fill seeded rows from the CSVs.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS location GEOMETRY(Point, 4326);
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS location GEOMETRY(Point, 4326);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_lat DECIMAL(9,6);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_lng DECIMAL(9,6);
CREATE INDEX IF NOT EXISTS idx_clients_location ON clients USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_service_providers_location ON service_providers USING GIST (location);
