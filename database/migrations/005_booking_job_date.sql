-- #82: apply before deploying the API that stores job dates (booking queries
-- select this column). Safe to rerun. Bookings made before this keep NULL:
-- they were requested for a time slot and day type only, with no date.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS job_date DATE;
