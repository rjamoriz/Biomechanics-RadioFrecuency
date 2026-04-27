-- V11: Injury risk assessments
-- Stores session-level injury risk summaries derived from proxy metrics.
-- All data is experimental — not for clinical use.

CREATE TABLE injury_risk_assessments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id              UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

    -- Composite risk
    peak_risk_score         DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    peak_risk_level         VARCHAR(20)      NOT NULL DEFAULT 'low',
    mean_risk_score         DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    peak_risk_timestamp     BIGINT,

    -- Per-articulation peak scores (JSONB: joint → peak_score)
    articulation_peaks_json JSONB,

    -- Dominant factors across the session (JSONB: string[])
    dominant_risk_factors   JSONB,

    -- Snapshot count for this assessment
    snapshot_count          INTEGER          NOT NULL DEFAULT 0,

    -- Assessment quality
    model_confidence        DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    signal_quality_score    DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    validation_status       VARCHAR(30)      NOT NULL DEFAULT 'experimental',
    experimental            BOOLEAN          NOT NULL DEFAULT TRUE,

    created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_injury_risk_session ON injury_risk_assessments (session_id);
CREATE INDEX idx_injury_risk_peak_score ON injury_risk_assessments (peak_risk_score DESC);
