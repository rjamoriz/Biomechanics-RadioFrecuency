CREATE TABLE treadmills (
    id                   UUID PRIMARY KEY,
    brand                VARCHAR(255)     NOT NULL,
    model                VARCHAR(255)     NOT NULL,
    max_speed_kph        DOUBLE PRECISION,
    max_incline_percent  DOUBLE PRECISION,
    station_id           UUID REFERENCES stations(id),
    active               BOOLEAN          NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);
