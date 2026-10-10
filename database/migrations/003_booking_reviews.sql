-- #77: apply before deploying the reviews API. Safe to rerun.
-- Existing provider ratings remain imported dataset values until the first
-- live review; afterwards the API stores the mean of live reviews only.
BEGIN;
CREATE TABLE IF NOT EXISTS booking_reviews (
    booking_id INTEGER PRIMARY KEY REFERENCES bookings(booking_id),
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
