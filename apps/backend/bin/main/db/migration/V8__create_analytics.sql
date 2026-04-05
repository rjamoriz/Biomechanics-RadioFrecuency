CREATE TABLE derived_metric_series (
    id                  UUID PRIMARY KEY,
    session_id          UUID         NOT NULL REFERENCES sessions(id),
    metric_name         VARCHAR(100) NOT NULL,
    data_points_json    JSONB        NOT NULL,
    mean_confidence     DOUBLE PRECISION,
    signal_quality_mean DOUBLE PRECISION,
    validation_status   VARCHAR(50)  NOT NULL DEFAULT 'UNVALIDATED',
    model_version       VARCHAR(100),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_derived_metric_session ON derived_metric_series(session_id);
CREATE INDEX idx_derived_metric_name ON derived_metric_series(session_id, metric_name);
