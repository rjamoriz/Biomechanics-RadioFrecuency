CREATE TABLE stations (
    id                 UUID PRIMARY KEY,
    name               VARCHAR(255) NOT NULL UNIQUE,
    location           VARCHAR(255),
    description        TEXT,
    receiver_mac       VARCHAR(17)  NOT NULL,
    transmitter_mac    VARCHAR(17)  NOT NULL,
    tx_distance_cm     DOUBLE PRECISION,
    tx_height_cm       DOUBLE PRECISION,
    rx_height_cm       DOUBLE PRECISION,
    tx_angle_deg       DOUBLE PRECISION,
    calibration_status VARCHAR(50)  NOT NULL DEFAULT 'NOT_CALIBRATED',
    active             BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
