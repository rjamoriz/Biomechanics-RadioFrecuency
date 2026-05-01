-- Longitudinal athlete data: personal baselines, training loads, and pain/wellness reports.
-- These tables power 7/14/28-day risk forecasting and ACWR monitoring.

-- Rolling per-metric baselines for each athlete.
-- Updated incrementally after each session by the analytics pipeline.
CREATE TABLE athlete_baselines (
    id               UUID         PRIMARY KEY,
    athlete_id       UUID         NOT NULL REFERENCES athletes(id),
    metric_name      VARCHAR(100) NOT NULL,
    baseline_mean    DOUBLE PRECISION NOT NULL,
    baseline_std     DOUBLE PRECISION NOT NULL DEFAULT 0,
    sample_count     INTEGER      NOT NULL DEFAULT 1,
    window_days      INTEGER      NOT NULL DEFAULT 28,
    last_updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (athlete_id, metric_name, window_days)
);

CREATE INDEX idx_athlete_baselines_athlete_id ON athlete_baselines(athlete_id);

-- Daily training load records derived from session analytics.
-- Supports ACWR (acute:chronic workload ratio) and monotony/strain calculations.
CREATE TABLE training_loads (
    id             UUID         PRIMARY KEY,
    athlete_id     UUID         NOT NULL REFERENCES athletes(id),
    session_id     UUID         REFERENCES sessions(id),
    session_date   DATE         NOT NULL,
    acute_load     DOUBLE PRECISION NOT NULL DEFAULT 0,
    chronic_load   DOUBLE PRECISION NOT NULL DEFAULT 0,
    acwr           DOUBLE PRECISION,
    monotony       DOUBLE PRECISION,
    strain         DOUBLE PRECISION,
    rpe            INTEGER,
    session_rpe    DOUBLE PRECISION,
    source         VARCHAR(100) NOT NULL DEFAULT 'derived',
    notes          TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_training_loads_athlete_id ON training_loads(athlete_id);
CREATE INDEX idx_training_loads_session_date ON training_loads(session_date);
CREATE INDEX idx_training_loads_athlete_date ON training_loads(athlete_id, session_date);

-- Athlete-reported pain / wellness check-ins.
-- Pain scale 0–10 per body region; used as a risk modifier in longitudinal models.
CREATE TABLE pain_reports (
    id           UUID         PRIMARY KEY,
    athlete_id   UUID         NOT NULL REFERENCES athletes(id),
    session_id   UUID         REFERENCES sessions(id),
    reported_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    body_region  VARCHAR(100) NOT NULL,
    pain_scale   INTEGER      NOT NULL CHECK (pain_scale >= 0 AND pain_scale <= 10),
    notes        TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pain_reports_athlete_id ON pain_reports(athlete_id);
CREATE INDEX idx_pain_reports_reported_at ON pain_reports(reported_at);
