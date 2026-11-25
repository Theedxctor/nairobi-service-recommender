-- #105: apply before deploying the API that stores directions (booking
-- queries select this column). Safe to rerun. Bookings made before this keep
-- NULL: they were placed without a directions field.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS location_details VARCHAR(300);
