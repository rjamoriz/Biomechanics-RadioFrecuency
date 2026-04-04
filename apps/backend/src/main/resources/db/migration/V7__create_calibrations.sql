CREATE TABLE calibration_profiles (
    id                       UUID PRIMARY KEY,
    station_id               UUID             NOT NULL REFERENCES stations(id),
    status                   VARCHAR(50)      NOT NULL DEFAULT 'IN_PROGRESS',
    environment_baseline_at  TIMESTAMPTZ,
    treadmill_baseline_at    TIMESTAMPTZ,
    athlete_baseline_at      TIMESTAMPTZ,
    completed_at             TIMESTAMPTZ,
    expires_at               TIMESTAMPTZ,
    environment_noise_floor  DOUBLE PRECISION,
    treadmill_noise_floor    DOUBLE PRECISION,
    signal_quality_score     DOUBLE PRECISION,
    notes                    TEXT,
    created_at               TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);
