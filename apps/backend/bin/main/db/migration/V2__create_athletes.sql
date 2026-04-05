CREATE TABLE athletes (
    id         UUID PRIMARY KEY,
    first_name VARCHAR(255) NOT NULL,
    last_name  VARCHAR(255) NOT NULL,
    email      VARCHAR(255),
    sport      VARCHAR(100),
    birth_year INTEGER,
    height_cm  DOUBLE PRECISION,
    weight_kg  DOUBLE PRECISION,
    shoe_notes TEXT,
    notes      TEXT,
    active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
