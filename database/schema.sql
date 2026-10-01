-- Enable PostGIS spatial extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- 1. nairobi_areas
-- Reference table for geographic areas in Nairobi with spatial centroids
-- ---------------------------------------------------------------------------
CREATE TABLE nairobi_areas (
    area_id VARCHAR(10) PRIMARY KEY,
    area_name VARCHAR(50) NOT NULL UNIQUE,
    geom GEOMETRY(Point, 4326) NOT NULL, -- PostGIS spatial column, SRID 4326
    area_type VARCHAR(30),
    avg_income VARCHAR(20),
    road_quality VARCHAR(20)
);

-- Spatial index for area centroid point geometry
CREATE INDEX idx_nairobi_areas_geom ON nairobi_areas USING GIST (geom);

-- ---------------------------------------------------------------------------
-- 2. clients
-- Registered clients requesting services
-- ---------------------------------------------------------------------------
CREATE TABLE clients (
    client_id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    area_id VARCHAR(10) REFERENCES nairobi_areas(area_id),
    phone VARCHAR(20),
    email VARCHAR(100)
);

CREATE INDEX idx_clients_area_id ON clients (area_id);

-- ---------------------------------------------------------------------------
-- 3. service_providers
-- Service providers and their base metadata
-- ---------------------------------------------------------------------------
CREATE TABLE service_providers (
    provider_id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    base_area_id VARCHAR(10) REFERENCES nairobi_areas(area_id),
    service_type VARCHAR(30) NOT NULL,
    rating DECIMAL(2,1),
    completion_rate DECIMAL(3,2),
    experience_years DECIMAL(4,1),
    avg_response_min DECIMAL(5,1),
    total_jobs INTEGER,
    is_verified BOOLEAN DEFAULT false,
    hourly_rate_ksh INTEGER,
    phone VARCHAR(20)
);

CREATE INDEX idx_service_providers_base_area_id ON service_providers (base_area_id);

-- ---------------------------------------------------------------------------
-- 4. traffic_patterns
-- Historical traffic corridor observations by time slot and day type
-- ---------------------------------------------------------------------------
CREATE TABLE traffic_patterns (
    traffic_pattern_id VARCHAR(10) PRIMARY KEY,
    corridor_name VARCHAR(50) NOT NULL,
    direction VARCHAR(20),
    time_slot VARCHAR(20) NOT NULL,
    day_type VARCHAR(20) NOT NULL,
    congestion_multiplier DECIMAL(3,2),
    avg_speed_kmh DECIMAL(4,1),
    congestion_level DECIMAL(3,1)
);

-- ---------------------------------------------------------------------------
-- 5. corridor_areas
-- Junction table: Many-to-Many relationship between traffic patterns & areas
-- ---------------------------------------------------------------------------
CREATE TABLE corridor_areas (
    corridor_area_id SERIAL PRIMARY KEY,
    traffic_pattern_id VARCHAR(10) REFERENCES traffic_patterns(traffic_pattern_id),
    area_id VARCHAR(10) REFERENCES nairobi_areas(area_id)
);

CREATE INDEX idx_corridor_areas_tp_id ON corridor_areas (traffic_pattern_id);
CREATE INDEX idx_corridor_areas_area_id ON corridor_areas (area_id);

ALTER TABLE corridor_areas ADD CONSTRAINT unique_corridor_area UNIQUE (traffic_pattern_id, area_id);

-- ---------------------------------------------------------------------------
-- 6. provider_availability
-- Working hours and scheduled availability per provider
-- ---------------------------------------------------------------------------
CREATE TABLE provider_availability (
    availability_id SERIAL PRIMARY KEY,
    provider_id VARCHAR(10) REFERENCES service_providers(provider_id),
    day_of_week VARCHAR(10) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL
);

CREATE INDEX idx_provider_availability_provider_id ON provider_availability (provider_id);

-- ---------------------------------------------------------------------------
-- 7. historical_bookings
-- Historical booking logs and arrival reliability records
-- ---------------------------------------------------------------------------
CREATE TABLE historical_bookings (
    booking_id SERIAL PRIMARY KEY,
    client_id VARCHAR(10) REFERENCES clients(client_id),
    provider_id VARCHAR(10) REFERENCES service_providers(provider_id),
    client_area_id VARCHAR(10) REFERENCES nairobi_areas(area_id),
    provider_area_id VARCHAR(10) REFERENCES nairobi_areas(area_id),
    service_type VARCHAR(30),
    distance_km DECIMAL(6,2),
    time_slot VARCHAR(20),
    day_type VARCHAR(20),
    congestion_multiplier DECIMAL(3,2),
    estimated_travel_min DECIMAL(6,1),
    arrival_reliability_score DECIMAL(4,3) CHECK (arrival_reliability_score BETWEEN 0 AND 1),
    on_time BOOLEAN,
    job_completed BOOLEAN,
    delay_min DECIMAL(6,1),
    actual_travel_min DECIMAL(6,1),
    client_rating_given DECIMAL(2,1)
);

CREATE INDEX idx_historical_bookings_client_id ON historical_bookings (client_id);
CREATE INDEX idx_historical_bookings_provider_id ON historical_bookings (provider_id);
CREATE INDEX idx_historical_bookings_client_area_id ON historical_bookings (client_area_id);
CREATE INDEX idx_historical_bookings_provider_area_id ON historical_bookings (provider_area_id);

-- ---------------------------------------------------------------------------
-- 8. users
-- Login/auth accounts, linked to a clients or service_providers row
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    user_id VARCHAR(10) PRIMARY KEY,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL, -- bcrypt hash, never plaintext
    role VARCHAR(20) NOT NULL CHECK (role IN ('client', 'provider', 'admin')),
    client_id VARCHAR(10) REFERENCES clients(client_id),
    provider_id VARCHAR(10) REFERENCES service_providers(provider_id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_client_id ON users (client_id);
CREATE INDEX idx_users_provider_id ON users (provider_id);

-- Enforces that only the FK matching the account's role is populated.
ALTER TABLE users ADD CONSTRAINT chk_users_role_matches_fk CHECK (
    (role = 'client' AND client_id IS NOT NULL AND provider_id IS NULL) OR
    (role = 'provider' AND provider_id IS NOT NULL AND client_id IS NULL) OR
    (role = 'admin' AND client_id IS NULL AND provider_id IS NULL)
);

-- ---------------------------------------------------------------------------
-- 9. bookings
-- Live/active booking requests made through the app (ML training data
-- lives in historical_bookings above; this table is not used for training)
-- ---------------------------------------------------------------------------
CREATE TABLE bookings (
    booking_id SERIAL PRIMARY KEY,
    client_id VARCHAR(10) REFERENCES clients(client_id),
    provider_id VARCHAR(10) REFERENCES service_providers(provider_id),
    service_type VARCHAR(30) NOT NULL,
    client_area VARCHAR(50) NOT NULL,
    time_slot VARCHAR(20) NOT NULL,
    day_type VARCHAR(20) NOT NULL,
    reliability_score DECIMAL(4,3),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bookings_client_id ON bookings (client_id);
CREATE INDEX idx_bookings_provider_id ON bookings (provider_id);

-- ---------------------------------------------------------------------------
-- 10. notifications
-- Real, event-triggered notifications for a user (never seeded/fabricated)
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id VARCHAR(10) REFERENCES users(user_id),
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications (user_id);
