CREATE TABLE inferred_motion_series (
    id                      UUID PRIMARY KEY,
    session_id              UUID         NOT NULL REFERENCES sessions(id),
    model_version           VARCHAR(100) NOT NULL,
    inference_mode          VARCHAR(50)  NOT NULL,
    experimental            BOOLEAN      NOT NULL DEFAULT TRUE,
    keypoint_schema_version VARCHAR(50)  NOT NULL,
    frames_json             JSONB,
    mean_confidence         DOUBLE PRECISION,
    signal_quality_summary  DOUBLE PRECISION,
    frame_count             INTEGER      NOT NULL DEFAULT 0,
    validation_status       VARCHAR(50)  NOT NULL DEFAULT 'EXPERIMENTAL',
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inferred_motion_session ON inferred_motion_series(session_id);
