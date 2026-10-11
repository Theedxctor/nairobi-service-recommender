-- #81: apply before deploying the API that records cancellation reasons
-- (it selects these columns). Safe to rerun. Bookings cancelled earlier keep
-- NULL in both columns: who cancelled and why was never recorded for them.
BEGIN;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(10);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(300);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'bookings_cancellation_check' AND conrelid = 'bookings'::regclass) THEN
        ALTER TABLE bookings ADD CONSTRAINT bookings_cancellation_check CHECK (
            (cancelled_by IS NULL OR cancelled_by IN ('client', 'provider'))
            AND (status = 'cancelled' OR (cancelled_by IS NULL AND cancellation_reason IS NULL))
        );
    END IF;
END $$;
COMMIT;
