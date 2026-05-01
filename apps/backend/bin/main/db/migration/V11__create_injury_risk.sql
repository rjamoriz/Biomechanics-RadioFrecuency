-- Injury-risk session summaries persisted by the gateway at recording stop.
-- Each row is the aggregated risk profile for one session.
CREATE TABLE injury_risk_summaries (
    id                       UUID         PRIMARY KEY,
    session_id               UUID         NOT NULL REFERENCES sessions(id),
    peak_risk_score          DOUBLE PRECISION NOT NULL,
    peak_risk_level          VARCHAR(20)  NOT NULL,
    mean_risk_score          DOUBLE PRECISION NOT NULL,
    peak_risk_timestamp      BIGINT,
    articulation_peaks_json  JSONB,
    dominant_risk_factors    TEXT[],
    snapshot_count           INTEGER      NOT NULL DEFAULT 0,
    model_confidence         DOUBLE PRECISION,
    signal_quality_score     DOUBLE PRECISION,
    validation_status        VARCHAR(50)  NOT NULL DEFAULT 'unvalidated',
    experimental             BOOLEAN      NOT NULL DEFAULT TRUE,
    notes                    TEXT,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_injury_risk_summaries_session_id ON injury_risk_summaries(session_id);
CREATE INDEX idx_injury_risk_summaries_peak_risk_level ON injury_risk_summaries(peak_risk_level);
