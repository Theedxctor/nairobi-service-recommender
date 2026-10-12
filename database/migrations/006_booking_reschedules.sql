-- #83: apply before deploying the rescheduling API (booking queries join this
-- table). Safe to rerun. A row is one proposal to move a booking; the booking
-- itself only changes when a proposal is accepted.
BEGIN;
CREATE TABLE IF NOT EXISTS booking_reschedules (
    reschedule_id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(booking_id),
    proposed_by VARCHAR(10) NOT NULL CHECK (proposed_by IN ('client', 'provider')),
    job_date DATE NOT NULL,
    time_slot VARCHAR(20) NOT NULL,
    previous_job_date DATE,
    previous_time_slot VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_reschedules_one_pending
    ON booking_reschedules (booking_id) WHERE status = 'pending';
COMMIT;
